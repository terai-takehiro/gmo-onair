/**
 * ② 請求・入金（財務） (v4)
 *
 * **月次の締めを一括でやる画面**です。締め月を決めて、その月ぶんをまとめて
 * 「請求書を出す」「入金を記録する」「検収を記録する」。
 *
 * ── ⑤ 見積・請求（案件管理）との違い ────────────────────────
 *
 * あちらは**案件をまたいで取りこぼさない**ための一覧（1件ずつ・期日順）。
 * こちらは**締め月ぶんをまとめて処理する**ための画面（選んで一括）。
 * **書き込む列も検査も同じ**なので、どちらから記録しても食い違いません
 * （`PATCH /billing/invoices/:id` と `POST /billing/invoices/bulk`）。
 *
 * ── 請求書番号は出していません ──────────────────────────────
 *
 * モックは「出す」を押した瞬間に `INV-年月-連番` を採番しますが、
 * **`revenues` に請求書番号の列がありません**。足すには
 * ①連番の単位（会社ぜんぶ／拠点ごと／年度ごと）②取り消したときに番号を空けるか
 * 使い回すか ③いま経理が使っている番号との突き合わせ — を決める必要があります。
 * **勝手に採番すると、会計側の番号と二重になります**。決めていただければ足します。
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

const TABS: { key: ClosingTab; label: string; icon: JSX.Element }[] = [
  { key: 'issue', label: '請求書を出す', icon: <Receipt className="h-4 w-4" aria-hidden="true" /> },
  { key: 'collect', label: '入金の確認', icon: <Wallet className="h-4 w-4" aria-hidden="true" /> },
  { key: 'inspect', label: '検収書を出す', icon: <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> },
];

const FOOT: Record<ClosingTab, string> = {
  issue: '申込書が揃っていない案件は選べません。締めた月にあとから確定した売上は、翌月の締めに回ります。請求書番号は付けていません（採番の決めごとが要るため・画面の説明を読んでください）。',
  collect: '入金を記録すると「入金済」になります。期日を過ぎたものが上に来ます。取り消しは案件管理の「見積・請求」から1件ずつ行えます。',
  inspect: '検収日を記録します。請求書を出したかどうかとは別の記録です（先に検収する取引先もあります）。',
};

export default function ClosingPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('budget', 'editor') || hasPermission('sales', 'editor');

  const today = localDateStr(new Date());
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [tab, setTab] = useState<ClosingTab>('issue');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const query = useQuery<ClosingResponse>({
    queryKey: ['billing', 'closing', month],
    queryFn: async () => (await api.get('/billing/closing', { params: { month } })).data,
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
      const d = (res.data?.data ?? {}) as { updated?: number; skipped_blocked?: string[] };
      qc.invalidateQueries({ queryKey: ['billing'] });
      // 台数の数字はトップページと売上台帳にも出る。**同じ数字なので一緒に落とす**
      qc.invalidateQueries({ queryKey: ['dashboard', 'app-badges'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      notifySuccess(
        `${d.updated ?? 0}件を記録しました`
        + (d.skipped_blocked?.length ? `（申込書が無い ${d.skipped_blocked.length}件は飛ばしました）` : ''),
      );
      clearPick();
    },
    onError: (e) => notifyApiError('記録できませんでした', e),
  });

  const run = async () => {
    const label = tab === 'issue' ? '請求書を出したことにする'
      : tab === 'collect' ? '入金を記録する' : '検収を記録する';
    const ok = await confirmAction({
      title: `${pickedRows.length}件を「${label}」ますか`,
      description: `合計 ${formatCurrency(pickedSum)}（税抜）。${
        tab === 'issue' ? '請求日として今日の日付が入ります。' : '今日の日付が入ります。'
      }取り消しは案件管理の「見積・請求」から1件ずつ行えます。`,
      confirmLabel: '記録する',
    });
    if (!ok) return;
    if (tab === 'issue') bulk.mutate({ invoice_issued: true, billing_date: today });
    else if (tab === 'collect') bulk.mutate({ paid_date: today });
    else bulk.mutate({ inspection_date: today });
  };

  const actionLabel = tab === 'issue' ? '請求書を出す' : tab === 'collect' ? '入金を記録' : '検収を記録';

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
