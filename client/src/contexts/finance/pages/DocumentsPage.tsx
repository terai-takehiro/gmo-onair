/**
 * ⑥ 受領書類（財務）
 *
 * 取引先から届いた **見積書・発注書・請求書** を、受け取ってから
 * 仕入・販管費に登録し終わるまで追いかけます。
 *
 *   受信 → 確認中 → 承認 → **仕入・販管費に登録**（＝登録済）
 *
 * ⚠️ **画面では「台帳に入れる」「処理完了」と書かない**（用語の決めごと）。
 * **操作は「仕入・販管費に登録」・状態は「登録済」**で言い切る。
 * コード側の値（`status='processed'`）は変えていない。
 *
 * ── 1通ずつではなく「ひとつづり」で出す（migration 281・2026-09 のご指示）──
 *
 * 取引は 見積書 → 発注書 → 請求書 と段を踏み、しかも
 *   ・見積書が何度も改定される（同じ取引で見積書が3通届く）
 *   ・見積だけ取って発注しない（請求書が来ない）
 *   ・請求書しか来ない（見積も発注も無い）
 * が**ぜんぶ普通に起きます**。1通ずつ並べると「この請求書はどの見積の続きか」が
 * 読めず、経理が毎回メールを探し直すことになっていました。
 * いまは束（`finance_doc_groups`）を1枚のカードにして、**中の書類を段の順に**出します。
 *
 * **見積書を一覧から外すのはやめました。** 以前は「台帳に入るのは請求書・注文書だけ」
 * という理由で隠していましたが、隠すと**あの見積がどうなったかを引く道が無くなります**。
 * 台帳へ渡せないのは変わりません（`doc-handoff.service.ts` が境界で止めます）。
 *
 * ── 当て先は AI が「仮」で置き、決めるのは人 ────────────────
 *
 * どの案件の書類かは**最終的に人が判断するもの**（ご指示）です。AI は
 * GLS 番号や取引先名から候補を当て、**なぜそう当てたかを一緒に残します**。
 * 人は「そのまま確定 / 別の案件に付け替え / 販管費に切替 / 束ごと削除」を選べます。
 *
 * ── 誰かが処理したら他の人の画面からも消える ────────────────
 *
 * 経理は複数人で同じ机を見ます。**数秒ごとに取り直し**、自分が操作したときは
 * その場で取り直します（ご指示の同期方式）。同時に同じ書類を触ったときは
 * サーバーが 409 で止めます（`doc-handoff.service.ts` の `FOR UPDATE`）。
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';
import { HandoffDialog, type HandoffPayload } from './documents/HandoffDialog';
import { GroupCard, type GroupCardActions } from './documents/GroupCard';
import { GroupEditDialog, type GroupPatch } from './documents/GroupEditDialog';
import { DocEditDialog, type DocPatch } from './documents/DocEditDialog';
import type { DocStatus, FinanceDoc, FinanceDocGroup } from './documents/types';

/**
 * **何秒おきに取り直すか。**
 *
 * 短くすると他の人の操作が早く映りますが、経理が数人で開いているだけの画面に
 * 毎秒の往復は要りません。**15秒**は「隣の席の人が処理したものが、
 * コーヒーを淹れて戻る前には消えている」程度の速さです。
 */
const REFETCH_MS = 15_000;

const CHIPS = [
  { key: 'pending', label: '片づいていない', stage: '' },
  { key: 'invoiced', label: '請求書あり', stage: 'invoiced' },
  { key: 'ordered', label: '発注済み', stage: 'ordered' },
  { key: 'quote_only', label: '見積書のみ', stage: 'quote_only' },
  { key: 'settled', label: '片づいたもの', stage: '' },
];

/** 今日（`YYYY-MM-DD`）。**判定は `documents/due.ts`**（ここでは日付を作るだけ） */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  /*
    ⚠️ **2つに分ける**（`shared/tests/clickable403.test.ts` の形）。

    ・確かめる（確認する／承認／却下／当て先を直す）は `dailyops` か `sales` の editor
    ・**仕入・販管費に登録／取り消すは `sales` の editor だけ** — 台帳に行を作る操作なので、
      台帳側の口（`purchases.routes` / `sga.routes`）と同じ権限が要る

    1つにまとめていたので、**`dailyops` だけの人にボタンが見えて、押せて、403** だった。
  */
  const canReview = hasPermission('sales', 'editor') || hasPermission('dailyops', 'editor');
  const canLedger = hasPermission('sales', 'editor');
  const today = todayIso();

  const [chip, setChip] = useState('pending');
  const [handoff, setHandoff] = useState<FinanceDoc | null>(null);
  const [editing, setEditing] = useState<FinanceDocGroup | null>(null);
  const [editingDoc, setEditingDoc] = useState<FinanceDoc | null>(null);
  // **開いた書類だけ中身を出す。** 全部出すとカードが縦に伸びて段が読めなくなる
  const [openedDocId, setOpenedDocId] = useState<string | null>(null);

  /**
   * **束は1回で全部取る。** 絞り込みはこの画面で行う。
   * チップごとにサーバーへ取りに行くと、**取りに行っている間に他の人が処理した書類**が
   * 混ざり、チップの件数と中身が食い違う。
   */
  const query = useQuery<{ data: FinanceDocGroup[]; meta?: { box_folder_name?: string; box_folder_url?: string | null } }>({
    queryKey: ['finance-doc-groups'],
    queryFn: async () => (await api.get('/dailyops/finance-doc-groups')).data,
    // ご指示の同期方式。**開いていない間は取りに行かない**
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  const all = useMemo(() => query.data?.data ?? [], [query.data]);
  const counts = useMemo(() => ({
    pending: all.filter((g) => !g.settled).length,
    invoiced: all.filter((g) => !g.settled && g.stage === 'invoiced').length,
    ordered: all.filter((g) => !g.settled && g.stage === 'ordered').length,
    quote_only: all.filter((g) => !g.settled && g.stage === 'quote_only').length,
    settled: all.filter((g) => g.settled).length,
  } as Record<string, number>), [all]);

  const rows = useMemo(() => {
    if (chip === 'settled') return all.filter((g) => g.settled);
    const live = all.filter((g) => !g.settled);
    const cur = CHIPS.find((c) => c.key === chip);
    return cur?.stage ? live.filter((g) => g.stage === cur.stage) : live;
  }, [all, chip]);

  /** 自分の操作は**その場で**映す（ポーリングを待たない） */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['finance-doc-groups'] });
    qc.invalidateQueries({ queryKey: ['finance-docs'] });
    // 台帳とトップページのタイルにも同じものが出る
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['sga-list'] });
    qc.invalidateQueries({ queryKey: ['purchases-all'] });
  };

  const setStatus = useMutation({
    mutationFn: (p: { id: string; status: DocStatus }) =>
      api.put(`/dailyops/finance-docs/${p.id}`, { status: p.status }),
    onSuccess: () => { invalidate(); notifySuccess('状態を変えました'); },
    onError: (e) => notifyApiError('変えられませんでした', e),
  });

  const saveGroup = useMutation({
    mutationFn: (p: GroupPatch & { id: string }) =>
      api.put(`/dailyops/finance-doc-groups/${p.id}`, p),
    onSuccess: () => { invalidate(); setEditing(null); notifySuccess('当て先を決めました'); },
    onError: (e) => notifyApiError('決められませんでした', e),
  });

  /**
   * 届いた書類そのものを直す。**サーバーが `ai_corrections` に差分を入れる**ので、
   * 直したところは AI の教師データになる（会社方針・条件2）。
   */
  const saveDoc = useMutation({
    mutationFn: (p: DocPatch & { id: string }) =>
      api.put(`/dailyops/finance-docs/${p.id}`, p),
    onSuccess: () => { invalidate(); setEditingDoc(null); notifySuccess('書類を直しました'); },
    onError: (e) => notifyApiError('直せませんでした', e),
  });

  const deleteGroup = useMutation({
    mutationFn: (id: string) => api.delete(`/dailyops/finance-doc-groups/${id}`),
    onSuccess: () => { invalidate(); notifySuccess('消しました'); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  const doHandoff = useMutation({
    mutationFn: (p: HandoffPayload & { id: string }) =>
      api.post(`/dailyops/finance-docs/${p.id}/handoff`, p),
    onSuccess: (_r, p) => {
      invalidate();
      setHandoff(null);
      notifySuccess(p.kind === 'purchase' ? '仕入に入れました' : '販管費に入れました');
    },
    onError: (e) => notifyApiError('登録できませんでした', e),
  });

  const undo = useMutation({
    mutationFn: (id: string) => api.post(`/dailyops/finance-docs/${id}/handoff/undo`),
    onSuccess: () => { invalidate(); notifySuccess('取り消しました（仕入・販管費の行は残っています）'); },
    onError: (e) => notifyApiError('取り消せませんでした', e),
  });

  const onUndo = async (d: FinanceDoc) => {
    const ok = await confirmAction({
      title: '仕入・販管費への登録を取り消しますか',
      description: `書類を「承認」に戻します。**${d.linked_kind === 'purchase' ? '仕入' : '販管費'}に作った行は削除しません** — `
        + 'そのあと経理が直しているかもしれないので、いるかどうかは台帳で確かめて手で削除してください。',
      confirmLabel: '取り消す',
      tone: 'danger',
    });
    if (ok) undo.mutate(d.id);
  };

  const onDeleteGroup = async (g: FinanceDocGroup) => {
    const ok = await confirmAction({
      title: 'この取引ごと消しますか',
      description: `「${g.title}」と、その中の書類 ${g.docs.length} 通を消します。`
        + '**間違って取り込んだもの・そもそも関係ないメールのときだけ**使ってください。'
        + '仕入・販管費に登録済みの行は消えません。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) deleteGroup.mutate(g.id);
  };

  const actions: GroupCardActions = {
    canReview, canLedger, today, openedDocId,
    onToggleDoc: (id) => setOpenedDocId((cur) => (cur === id ? null : id)),
    onSetStatus: (id, status) => setStatus.mutate({ id, status }),
    onHandoff: setHandoff,
    onUndoHandoff: onUndo,
    onEditGroup: setEditing,
    onEditDoc: setEditingDoc,
    onDeleteGroup,
    onOpenLedger: (kind) => navigate(kind === 'purchase' ? '/budget/purchases' : '/budget/sga'),
  };

  const boxFolder = query.data?.meta;

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="受領書類"
        sub="メールで届いた見積書・発注書・請求書を、1つの取引としてまとめて確かめます。承認したら仕入・販管費に登録します。"
      />

      <FilterChips
        label="取引の段で絞り込む"
        items={CHIPS.map((c) => ({ key: c.key, label: c.label, count: counts[c.key] ?? null }))}
        value={chip}
        onChange={setChip}
      />

      {query.isError ? (
        <ErrorPanel title="書類を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title={chip === 'pending' ? '片づいていない取引はありません' : '条件に合う取引はありません'}
          description={chip === 'pending'
            ? 'メールで届いた見積書・発注書・請求書を AI が取り込み、同じ取引のものはひとつづりにまとめます。'
            : '上の絞り込みを変えると、別の段の取引を見られます。'}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {rows.map((g) => <GroupCard key={g.id} group={g} actions={actions} />)}
          </div>

          <p className="text-note text-muted-foreground">
            1枚のカードが<strong className="font-bold">1つの取引</strong>です。
            見積書 → 発注書 → 請求書 が同じカードに並びます
            （<strong className="font-bold">見積書だけで終わった取引もそのまま残ります</strong> —
            あとで「あの見積どうなった」を引けるようにするためです）。
            {' '}
            <strong className="font-bold">当て先（どの案件か・販管費か）は人が決めます。</strong>
            AI が当てた候補には、なぜそう当てたかが添えてあります。
            {' '}
            <Sparkles className="mx-1 inline h-3 w-3 text-ai" aria-hidden="true" />
            の付いた行は AI がメールを項目に分けて読み取ったものです。
            {boxFolder?.box_folder_name && (
              <>
                {' '}添付の PDF は BOX の
                {boxFolder.box_folder_url ? (
                  <a href={boxFolder.box_folder_url} target="_blank" rel="noreferrer" className="mx-1 underline">
                    「{boxFolder.box_folder_name}」
                  </a>
                ) : (
                  <strong className="mx-1 font-bold">「{boxFolder.box_folder_name}」</strong>
                )}
                フォルダに入ります。
              </>
            )}
            {' '}この画面は<strong className="font-bold">{REFETCH_MS / 1000}秒おきに取り直します</strong> —
            誰かが処理したものは、しばらくすると他の人の画面からも消えます。
          </p>
        </>
      )}

      {handoff && (
        <HandoffDialog
          doc={handoff}
          saving={doHandoff.isPending}
          onClose={() => setHandoff(null)}
          onSubmit={(p) => doHandoff.mutate({ ...p, id: handoff.id })}
        />
      )}

      {editingDoc && (
        <DocEditDialog
          doc={editingDoc}
          saving={saveDoc.isPending}
          onClose={() => setEditingDoc(null)}
          onSubmit={(patch) => saveDoc.mutate({ ...patch, id: editingDoc.id })}
        />
      )}

      {editing && (
        <GroupEditDialog
          group={editing}
          saving={saveGroup.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(patch) => saveGroup.mutate({ ...patch, id: editing.id })}
        />
      )}
    </div>
  );
}
