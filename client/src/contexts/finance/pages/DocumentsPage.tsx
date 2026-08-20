/**
 * ⑥ 受け取った書類（財務） (v4)
 *
 * 取引先から届いた **見積書・請求書・注文書** を、受け取ってから
 * 台帳に入れ終わるまで追いかけます。
 *
 *   受信 → 確認中 → 承認 → **台帳に入れる**（＝処理完了）
 *
 * ── 日常業務から財務へ移した ────────────────────────────────
 *
 * 元は日常業務アプリ（`/daily/finance`）にありましたが、
 * **`dailyops` 権限を要求していたので経理が開けませんでした**（実測で 403）。
 * 中身は 金額・締月・支払期日・GLS番号 で完全に経理の道具なので、財務に移し、
 * **`dailyops` か `budget` のどちらか**で通すようにしました
 * （いま見られる人は見られたまま、経理が見られるようになります）。
 *
 * ── 「処理完了」を本物にした ────────────────────────────────
 *
 * 以前は状態が変わるだけで**台帳に何も作られず**、同じ請求書を2回入力して
 * 突き合わせは記憶頼みでした。いまは「台帳に入れる」を押すと仕入か販管費を作り、
 * **書類にどの行になったかを記録**します（migration 142）。
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, RotateCcw, Check, X, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { HandoffDialog, type HandoffPayload } from './documents/HandoffDialog';
import { DocDetails } from './documents/DocDetails';
import { STATUS_LABEL, STATUS_TONE, TYPE_LABEL, type DocStatus, type FinanceDoc } from './documents/types';

const CHIPS = [
  { key: 'pending', label: '未処理', status: '' },
  { key: 'new', label: '受信', status: 'new' },
  { key: 'reviewing', label: '確認中', status: 'reviewing' },
  { key: 'approved', label: '承認（台帳待ち）', status: 'approved' },
  { key: 'processed', label: '処理完了', status: 'processed' },
];

/** `2026-08-20` → `08/20` */
const md = (d: string | null) => (d && d.length >= 10 ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '—');

export default function DocumentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  // `budget` は権限モデル単純化で `sales` に統合済み
  const canEdit = hasPermission('sales', 'editor') || hasPermission('dailyops', 'editor');

  const [chip, setChip] = useState('pending');
  const [handoff, setHandoff] = useState<FinanceDoc | null>(null);
  // **開いた行だけ中身を出す。** 全部を行に出すと行の高さがバラバラになり、
  // 金額の桁が縦にそろわなくなる
  const [opened, setOpened] = useState<string | null>(null);
  const cur = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];

  const query = useQuery<{ data: FinanceDoc[] }>({
    queryKey: ['finance-docs', chip],
    queryFn: async () => (await api.get('/dailyops/finance-docs', {
      params: cur.status ? { status: cur.status } : { pending: '1' },
    })).data,
  });

  // 件数はチップに出すので**絞り込み無しでも1回引く**
  // (押す前に 0 件だと分かるようにする)
  const all = useQuery<{ data: FinanceDoc[] }>({
    queryKey: ['finance-docs', 'all'],
    queryFn: async () => (await api.get('/dailyops/finance-docs')).data,
  });
  const counts = useMemo(() => {
    const rows = all.data?.data ?? [];
    const by = (s: DocStatus) => rows.filter((r) => r.status === s).length;
    return {
      pending: rows.filter((r) => r.status !== 'processed' && r.status !== 'rejected').length,
      new: by('new'), reviewing: by('reviewing'), approved: by('approved'), processed: by('processed'),
    } as Record<string, number>;
  }, [all.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['finance-docs'] });
    // 台帳とトップのタイルにも同じものが出る
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

  const doHandoff = useMutation({
    mutationFn: (p: HandoffPayload & { id: string }) =>
      api.post(`/dailyops/finance-docs/${p.id}/handoff`, p),
    onSuccess: (_r, p) => {
      invalidate();
      setHandoff(null);
      notifySuccess(p.kind === 'purchase' ? '仕入に入れました' : '販管費に入れました');
    },
    onError: (e) => notifyApiError('台帳に入れられませんでした', e),
  });

  const undo = useMutation({
    mutationFn: (id: string) => api.post(`/dailyops/finance-docs/${id}/handoff/undo`),
    onSuccess: () => { invalidate(); notifySuccess('取り消しました（台帳の行は残っています）'); },
    onError: (e) => notifyApiError('取り消せませんでした', e),
  });

  const onUndo = async (d: FinanceDoc) => {
    const ok = await confirmAction({
      title: '台帳への受け渡しを取り消しますか',
      description: `書類を「承認」に戻します。**${d.linked_kind === 'purchase' ? '仕入' : '販管費'}に作った行は消しません** — `
        + 'そのあと経理が直しているかもしれないので、いるかどうかは台帳で確かめて手で消してください。',
      confirmLabel: '取り消す',
      tone: 'danger',
    });
    if (ok) undo.mutate(d.id);
  };

  const rows = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="受け取った書類"
        sub="取引先から届いた見積書・請求書・注文書です。承認したら台帳（仕入・販管費）に入れます"
      />

      <FilterChips
        label="書類の状態で絞り込む"
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
          title={chip === 'pending' ? '未処理の書類はありません' : '該当する書類はありません'}
          description="メールで届いた見積書・請求書・注文書を AI が取り込みます。手で足すこともできます。"
        />
      ) : (
        <>
          <div className="flex flex-col">
            <RowHeader className="hidden sm:flex">
              <RowSlot w={72}>種類</RowSlot>
              <RowMain>送付者 ／ 件名</RowMain>
              <RowSlot w={128} align="right">金額（税込）</RowSlot>
              <RowSlot w={72}>支払期日</RowSlot>
              <RowSlot w={96}>状態</RowSlot>
              <RowSlot w={200}>{canEdit ? '次にやること' : ''}</RowSlot>
            </RowHeader>

            {rows.map((d) => (
              <Row key={d.id} align="start">
                <RowSlot w={72}>
                  <span className="text-sub-sm text-secondary-foreground">{TYPE_LABEL[d.doc_type]}</span>
                </RowSlot>

                <RowMain>
                  <RowTitle>
                    {d.source === 'email' && (
                      <Sparkles className="mr-1 inline h-3.5 w-3.5 text-ai" aria-label="AI が取り込みました" />
                    )}
                    {d.subject || '（件名なし）'}
                  </RowTitle>
                  <RowSub>
                    {[d.sender, d.gls_number, d.closing_month ? `${d.closing_month} 締め` : null]
                      .filter(Boolean).join(' ・ ')}
                  </RowSub>
                  <DocDetails
                    doc={d}
                    open={opened === d.id}
                    onToggle={() => setOpened((cur) => (cur === d.id ? null : d.id))}
                  />
                </RowMain>

                <MoneyCell value={Number(d.amount) || 0} width={128} />

                <RowSlot w={72} hideOnMobile>
                  <span className="font-number text-sub-sm text-secondary-foreground">{md(d.payment_due)}</span>
                </RowSlot>

                <RowSlot w={96}>
                  <TableBadge label={STATUS_LABEL[d.status]} w={null} className={`w-full ${STATUS_TONE[d.status]}`} />
                </RowSlot>

                <RowSlot w={200}>
                  {canEdit && (
                    <span className="flex flex-wrap gap-1">
                      {d.status === 'new' && (
                        <Button variant="outline" onClick={() => setStatus.mutate({ id: d.id, status: 'reviewing' })}>
                          確認する
                        </Button>
                      )}
                      {d.status === 'reviewing' && (
                        <>
                          <Button variant="outline" onClick={() => setStatus.mutate({ id: d.id, status: 'approved' })}>
                            <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />承認
                          </Button>
                          <Button variant="ghost" onClick={() => setStatus.mutate({ id: d.id, status: 'rejected' })}>
                            <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />却下
                          </Button>
                        </>
                      )}
                      {d.status === 'approved' && (
                        <Button onClick={() => setHandoff(d)}>
                          台帳に入れる<ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                      {d.status === 'processed' && d.linked_id && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => navigate(d.linked_kind === 'purchase' ? '/budget/purchases' : '/budget/sga')}
                          >
                            <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            {d.linked_kind === 'purchase' ? '仕入' : '販管費'}を見る
                          </Button>
                          <Button variant="ghost" onClick={() => onUndo(d)} aria-label="受け渡しを取り消す">
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                      {d.status === 'rejected' && (
                        <Button variant="ghost" onClick={() => setStatus.mutate({ id: d.id, status: 'new' })}>
                          受信に戻す
                        </Button>
                      )}
                      {/* 昔「処理完了」にしたが台帳に繋がっていないもの。**放置すると
                          二重入力に気づけない**ので、繋ぎ直せることを出す */}
                      {d.status === 'processed' && !d.linked_id && (
                        <span className="text-note text-warning">
                          台帳との結びつきがありません（この画面より前に処理されたもの）
                        </span>
                      )}
                    </span>
                  )}
                </RowSlot>
              </Row>
            ))}
          </div>

          <p className="text-note text-muted-foreground">
            「台帳に入れる」を押すと<strong className="font-bold">仕入か販管費の行を作り、処理完了にします</strong>。
            書類の金額は税込なので、台帳に入れるときに税抜の金額を確かめます。
            取り消しても<strong className="font-bold">台帳の行は消しません</strong>（経理が直しているかもしれないため）。
            <Sparkles className="mx-1 inline h-3 w-3 text-ai" aria-hidden="true" />
            の付いた行は<strong className="font-bold">AI がメールを項目に分けて読み取ったもの</strong>です。
            「中身を読む」でメールの原文も確かめられます。
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
    </div>
  );
}
