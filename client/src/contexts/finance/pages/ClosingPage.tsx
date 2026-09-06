/**
 * ② 請求・入金（財務） (v4)
 *
 * **月次の締めを一括でやる画面**です。締め月を決めて、その月ぶんをまとめて
 * 「請求書を出す」「入金を記録」「検収を記録」。
 *
 * ── タブ名とボタン名は同じ語にする（2026-09-05 の用語棚卸し）──────
 *
 * 以前はタブが「請求書を出す／入金の確認／検収書を出す」、ボタンが
 * 「請求書を出す／入金を記録／検収を記録」で、**同じ仕事に名前が2つ**あった。
 * このタブでやるのは3つとも**日付を記録すること**なので、**ボタン側の語に揃える**
 * （帳票の PDF は行ごとの「帳票」列から出す・`billing/ClosingRows.tsx`）。
 * 確認ダイアログの見出しも動詞ごとに文を分けてある（`CONFIRM` 表） —
 * 以前は `${n}件を「${label}」ますか` の1本で組み立てており、
 * 「3件を「入金を記録する」ますか」という壊れた日本語になっていた。
 *
 * ── ⑤ 見積・請求（案件管理）との違い ────────────────────────
 *
 * あちらは**案件をまたいで取りこぼさない**ための一覧（1件ずつ・期日順）。
 * こちらは**締め月ぶんをまとめて処理する**ための画面（選んで一括）。
 * **書き込む列も検査も同じ**なので、どちらから記録しても食い違いません
 * （`PATCH /billing/invoices/:id` と `POST /billing/invoices/bulk`）。
 *
 * ── 請求書番号 (migration 163) ──────────────────────────────
 *
 * 「請求書を出す」を押した瞬間に **`INV-<年>-<4桁>`** を採ります。決めごとは
 * ①**年度ごとの通し番号**（年度は暦年）②**取り消しても番号は消さない**
 * （同じ請求は何度出し直しても同じ番号。取り消したまま終わった番号は欠番）
 * ③**既存の行は空のまま**、新しく発行するぶんから採る
 * （いま経理が使っている番号と二重に付けないため）。
 * 採番は `finance/services/invoice-number.service.ts` の1か所だけ。
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Wallet, ClipboardCheck, Info } from 'lucide-react';
import api from '@/lib/api';
import { localDateStr, formatCurrency } from '@/lib/format';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Button } from '@/components/ui/button';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';
import { LedgerTabs } from './ledger/LedgerTabs';
import { MonthPicker } from './ledger/LedgerParts';
import { ClosingRows } from './billing/ClosingRows';
import type { ClosingResponse, ClosingRow, ClosingTab } from './billing/types';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { MobileCollect } from './closing/MobileCollect';
import { useEntityFilter, EntityTabs } from './shared/entityFilter';

const TABS: { key: ClosingTab; label: string; icon: JSX.Element }[] = [
  { key: 'issue', label: '請求書を出す', icon: <Receipt className="h-4 w-4" aria-hidden="true" /> },
  { key: 'collect', label: '入金を記録', icon: <Wallet className="h-4 w-4" aria-hidden="true" /> },
  { key: 'inspect', label: '検収を記録', icon: <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> },
];

/**
 * まとめて記録する前の確認文。**動詞ごとに1文ずつ持つ**。
 * 1本のテンプレートに動詞を差し込むと「3件を「入金を記録する」ますか」のように
 * 文法が壊れる（実際に壊れていた・ファイル冒頭コメント）。
 */
const CONFIRM: Record<ClosingTab, { title: (n: number) => string; confirmLabel: string }> = {
  issue: { title: (n) => `${n}件の請求書を出しますか`, confirmLabel: '請求書を出す' },
  collect: { title: (n) => `${n}件に入金を記録しますか`, confirmLabel: '入金を記録' },
  inspect: { title: (n) => `${n}件に検収を記録しますか`, confirmLabel: '検収を記録' },
};

const FOOT: Record<ClosingTab, string> = {
  issue: '申込書が揃っていない案件は選べません。締めた月にあとから確定した売上は、翌月の締めに回ります。請求書番号（INV-年-4桁）は「出す」を押したときに採ります。取り消しても番号は変わりません。',
  collect: '入金を記録すると「入金済」になります。期日を過ぎたものが上に来ます。取り消しは案件管理の「見積・請求」から1件ずつ行えます。',
  inspect: '検収日を記録します。請求書を出したかどうかとは別の記録です（先に検収する取引先もあります）。',
};

function DesktopClosing() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  // `budget` は権限モデル単純化で `sales` に統合済み（両方とも同じ判定になる）
  const canEdit = hasPermission('sales', 'editor');

  const today = localDateStr(new Date());
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [tab, setTab] = useState<ClosingTab>('issue');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // 会社（計上会社）の絞り込み（URL の `?entity=` が正）。省略時は全社合算のまま（`shared/entityFilter.tsx`）
  const { entity, setEntity, options: entityOptions } = useEntityFilter();

  const query = useQuery<ClosingResponse>({
    queryKey: ['billing', 'closing', month, entity],
    // `GET /billing/closing` が entity_code に対応済み（省略時は全社合算のまま）
    queryFn: async () => (await api.get('/billing/closing', {
      params: { month, ...(entity ? { entity_code: entity } : {}) },
    })).data,
  });

  const counts = query.data?.counts;
  const rows: ClosingRow[] = useMemo(() => query.data?.data?.[tab] ?? [], [query.data, tab]);

  // 選べる行だけを「すべて選ぶ」の対象にする（押せないものを数に入れない）
  const selectable = useMemo(
    () => rows.filter((r) => canEdit && !(tab === 'issue' && r.blocked)),
    [rows, tab, canEdit],
  );
  const pickedRows = useMemo(() => selectable.filter((r) => picked.has(r.id)), [selectable, picked]);
  const pickedSum = pickedRows.reduce((t, r) => t + (Number(r.amount) || 0), 0);

  const clearPick = () => setPicked(new Set());
  const switchTab = (k: ClosingTab) => { setTab(k); clearPick(); };

  const bulk = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post('/billing/invoices/bulk', { ids: pickedRows.map((r) => r.id), ...payload }),
    onSuccess: (res) => {
      const d = (res.data?.data ?? {}) as {
        updated?: number; skipped_blocked?: string[]; skipped_unissued?: string[];
      };
      qc.invalidateQueries({ queryKey: ['billing'] });
      // 台数の数字はトップページと売上台帳にも出る。**同じ数字なので一緒に落とす**
      qc.invalidateQueries({ queryKey: ['dashboard', 'app-badges'] });
      // `['revenues']` は案件詳細（`RevenueBillingPane.tsx` の `['revenues','project',projectId]`）に
      // 前方一致で当たるが、財務③ 売上一覧（`['revenues-all',…]`）には当たらない。両方落とす
      qc.invalidateQueries({ queryKey: ['revenues'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      // ⚠️ **飛ばしたものは必ず書く。** 「10件を記録しました」だけ出すと、
      // 押した人は**全部入ったと思って二度と見に来ません**
      notifySuccess(
        `${d.updated ?? 0}件を記録しました`
        + (d.skipped_blocked?.length ? `（申込書が無い ${d.skipped_blocked.length}件は飛ばしました）` : '')
        + (d.skipped_unissued?.length
          ? `（請求書を出していない ${d.skipped_unissued.length}件は飛ばしました）` : ''),
      );
      clearPick();
    },
    onError: (e) => notifyApiError('選んだ行を記録できませんでした', e, '少し時間をおいてもう一度お試しください。'),
  });

  const run = async () => {
    const ok = await confirmAction({
      title: CONFIRM[tab].title(pickedRows.length),
      description: `合計 ${formatCurrency(pickedSum)}（税抜）。${
        tab === 'issue' ? '請求日として今日の日付が入ります。' : '今日の日付が入ります。'
      }取り消しは案件管理の「見積・請求」から1件ずつ行えます。`,
      confirmLabel: CONFIRM[tab].confirmLabel,
    });
    if (!ok) return;
    if (tab === 'issue') bulk.mutate({ invoice_issued: true, billing_date: today });
    else if (tab === 'collect') bulk.mutate({ paid_date: today });
    else bulk.mutate({ inspection_date: today });
  };

  // ボタンの語はタブ・確認ダイアログと同じ（`TABS` / `CONFIRM`）
  const actionLabel = CONFIRM[tab].confirmLabel;

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="請求・入金"
        sub={
          counts
            ? `${month.replace('-', '年')}月締め ・ 未発行 ${counts.issue}件 ・ 入金待ち ${counts.collect}件`
              + (counts.overdue > 0 ? ` ・ 期日超過 ${counts.overdue}件` : '')
              + (counts.blocked > 0 ? ` ・ 申込書が揃っていない ${counts.blocked}件` : '')
            : '締め月ぶんをまとめて処理します'
        }
      >
        <MonthPicker value={month} onChange={(v) => { setMonth(v || today.slice(0, 7)); clearPick(); }} />
      </PageHeader>

      <EntityTabs entity={entity} setEntity={setEntity} options={entityOptions} />

      <LedgerTabs
        value={tab}
        onChange={(k) => switchTab(k as ClosingTab)}
        items={TABS.map((t) => ({ ...t, count: counts?.[t.key] }))}
      />

      {query.isError ? (
        <ErrorPanel title="締めの一覧を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            tab === 'issue' ? 'この月の請求書はすべて出しました'
              : tab === 'collect' ? '入金待ちはありません'
              : '検収の記録待ちはありません'
          }
          description={`${month.replace('-', '年')}月に計上した確定売上を見ています。月を変えると別の締めを見られます。`}
        />
      ) : (
        <>
          <div className="flex flex-col">
            <ClosingRows
              rows={rows}
              tab={tab}
              today={today}
              picked={picked}
              canEdit={canEdit}
              onPick={(id, on) => setPicked((s) => {
                const next = new Set(s);
                if (on) next.add(id); else next.delete(id);
                return next;
              })}
            />
          </div>

          <p className="text-note flex items-start gap-2 text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{FOOT[tab]}</span>
          </p>
        </>
      )}

      {/* 選んだあとの操作。**下に固定しない** — 一覧の下端に置くと、
          選んでから画面を下まで送ることになる。件数と合計を必ず添える */}
      {canEdit && rows.length > 0 && (
        <div className="rounded-card sticky bottom-3 flex flex-wrap items-center gap-3 border border-border bg-card p-3 shadow-lg lg:px-4">
          {pickedRows.length === 0 ? (
            <>
              {/* **選べるものが1つも無いときは理由を書く。**
                  「0件から選べます」だけだと、壊れているのか自分の見落としか分からない */}
              <span className="text-sub text-secondary-foreground">
                {selectable.length === 0
                  ? tab === 'issue'
                    ? `この月の未発行 ${rows.length}件は、すべて申込書が揃っていないため出せません。案件の申込書を登録してください。`
                    : '記録できるものがありません（権限が要ります）。'
                  : `記録するものを選んでください（${selectable.length}件から選べます）`}
              </span>
              <div className="flex-1" />
              {selectable.length > 0 && (
                <Button variant="outline" onClick={() => setPicked(new Set(selectable.map((r) => r.id)))}>
                  すべて選ぶ
                </Button>
              )}
            </>
          ) : (
            <>
              <span className="text-sub text-secondary-foreground">
                <span className="font-number font-bold">{pickedRows.length}</span> 件を選択
              </span>
              <Money value={pickedSum} className="text-cardtitle font-bold" />
              <div className="flex-1" />
              <Button variant="ghost" onClick={clearPick}>選び直す</Button>
              <Button disabled={bulk.isPending} onClick={run}>{actionLabel}</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * スマホと PC で**別の画面**を出す（Phase 6・M3）。
 *
 * PC は月ぶんを**まとめて**処理する画面（請求書を出す／入金を記録／検収を記録の3タブ・複数選択）。
 * スマホは **入金の記録1つだけ**にします（モックの ⑫）。
 * モックの「スマホに置かないもの」に**お金**が挙がっているのは**台帳の表**のことで、
 * **片づく1つの仕事**は置く、という切り分けです。
 *
 * **早期 return にしないこと** — 幅が変わったときにフックの数が変わって落ちます。
 */
export default function ClosingPage() {
  return useIsMobile() ? <MobileCollect /> : <DesktopClosing />;
}
