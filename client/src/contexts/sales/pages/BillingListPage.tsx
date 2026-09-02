/**
 * ⑤ 見積・請求（全案件） (v4)
 *
 * 案件をまたいで「返事待ち」と「入金待ち」を取りこぼさないための画面です。
 * 案件詳細の見積タブが「この案件の見積」なのに対して、こちらは横に見ます。
 * **同じテーブルから読む**ので数字は食い違いません。
 *
 * ── 検収と入金を ONAiR で持つことにした（ご判断）──────────────
 *
 * `revenues` には請求日・支払期日・請求書の発行済フラグはありましたが、
 * **「検収したか」と「いつ入金されたか」を持つ列がありませんでした**
 * （仕入 `purchases` には `inspection_date` があるのに売上側には無い、という非対称）。
 * migration 140 で `inspection_date` / `paid_date` を足しています。
 *
 * **フラグではなく日付**です。済んだかを別のフラグでも持つと、
 * 片方だけ更新されて必ず食い違います（日付が入っていれば済み）。
 *
 * ── モックと違えたところ ────────────────────────────────────
 *
 * ・**「見積を作成」ボタンは置いていません。** 見積は案件にぶら下がるもので、
 *   ここで押しても「どの案件の？」を先に訊くことになります。案件詳細の
 *   見積タブへ行くのが最短なので、行を押すとそこへ飛びます
 * ・**旧版（差し替え済み）は出しません。** サーバー側で外しています。
 *   一覧に並ぶと「返事待ちが何件か」が読めなくなります
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Receipt, FileText, Info } from 'lucide-react';
import api from '@/lib/api';
import { localDateStr } from '@/lib/format';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';
import { EstimateRows } from './billing/EstimateRows';
import { InvoiceRows } from './billing/InvoiceRows';
import type { BillingEstimate, BillingInvoice } from './billing/types';

/** 見積の絞り込み。**「すべて」でも旧版は出ません**（サーバーで外している） */
const ESTIMATE_CHIPS = [
  { key: 'all', label: 'すべて', status: '' },
  /**
   * **承認待ち**（値引きが上限を超えて止まっている見積）。
   * 承認する人は案件を1件ずつ開いて回れないので、**ここから探せる**必要がある
   * （承認する導線がクライアントに1つも無く、pending の見積が永久に送れなかった）。
   * 状態（作成中・提出済…）とは別の軸なので `status` は空のまま。
   */
  { key: 'approval', label: '承認待ち', status: '' },
  { key: 'sent', label: '提出済', status: 'sent' },
  { key: 'draft', label: '作成中', status: 'draft' },
  { key: 'accepted', label: '受注', status: 'accepted' },
  { key: 'rejected', label: '失注', status: 'rejected' },
];

/**
 * 請求の絞り込み。
 *
 * ⚠️ **名前も中身も財務の売上台帳とそろえてあります**（レビューでの指摘 #125）。
 * 前はここだけ「入金前」で、**中身は「入金日が空」だけ**でした。台帳の「入金待ち」は
 * **請求書を出したのに入金がまだ**だったので、**同じ話をしているのに件数が違い**、
 * どちらが正しいか画面からは分かりませんでした（実測: 40 件 と 3 件）。
 *
 * 出していないものは**「未請求」で拾えます** — 消えたわけではなく、
 * 「入金を待っている」ではなく**「こちらが請求していない」**という別の仕事なので分けました。
 */
const INVOICE_CHIPS = [
  { key: 'all', label: 'すべて', state: '' },
  { key: 'unissued', label: '未請求', state: 'unissued' },
  { key: 'unpaid', label: '入金待ち', state: 'unpaid' },
  { key: 'overdue', label: '期日超過', state: 'overdue' },
  { key: 'uninspected', label: '検収前', state: 'uninspected' },
  { key: 'paid', label: '入金済', state: 'paid' },
];

/**
 * 一覧の応答。**件数も合計もサーバーが数えたもの**を使います（レビューでの指摘 #53）。
 *
 * ⚠️ **並んだ行を数えない・足さない。** 行は 300 件で切っているので、
 * 数えると「300 件」、足すと **301 件目からが落ちた合計**になります。
 * どちらも画面を見ても気づけません（それらしい数字が出るだけで、
 * 月末に突き合わせるまで分かりません）。
 */
interface ListResponse<T> {
  data: T[];
  /** 絞り込み全体の件数 */
  total_count?: number;
  /** 同上の合計（税抜・見積は値引きを引いたあと） */
  total_amount?: number;
  /** 行を切ったか */
  truncated?: boolean;
}

export default function BillingListPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const [params, setParams] = useSearchParams();

  const tab = params.get('tab') === 'invoice' ? 'invoice' : 'estimate';
  const setTab = (t: 'estimate' | 'invoice') => {
    const next = new URLSearchParams(params);
    if (t === 'invoice') next.set('tab', 'invoice'); else next.delete('tab');
    setParams(next, { replace: true });
  };

  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [estimateKey, setEstimateKey] = useState('all');
  const [invoiceKey, setInvoiceKey] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = localDateStr(new Date());
  const status = ESTIMATE_CHIPS.find((c) => c.key === estimateKey)?.status ?? '';
  // 承認待ちは状態ではなく別の絞り込み（`approval_state`）
  const approval = estimateKey === 'approval' ? 'pending' : '';
  const state = INVOICE_CHIPS.find((c) => c.key === invoiceKey)?.state ?? '';

  // **どちらのタブも常に引く。** 開いている側だけにすると、
  // 閉じている側のタブに出る件数が 0 のままになり**数字が嘘になる**
  // (実ブラウザで「見積 0 / 請求 2」と出て気づいた)。
  // 切り替えも待ちなしになる。
  const estimates = useQuery<ListResponse<BillingEstimate>>({
    queryKey: ['billing', 'estimates', scope, status, approval],
    queryFn: async () => (await api.get('/billing/estimates', { params: { scope, status, approval } })).data,
  });
  const invoices = useQuery<ListResponse<BillingInvoice>>({
    queryKey: ['billing', 'invoices', scope, state],
    queryFn: async () => (await api.get('/billing/invoices', { params: { scope, state } })).data,
  });

  const mark = useMutation({
    mutationFn: (p: { id: string; field: 'inspection_date' | 'paid_date'; value: string | null }) =>
      api.patch(`/billing/invoices/${p.id}`, { [p.field]: p.value }),
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['billing'] });
      // この PATCH は revenues テーブルを書く。`['revenues']` は案件詳細
      // （`['revenues','project',projectId]`）に前方一致で当たるが、
      // 財務③ 売上台帳（`['revenues-all',…]`）には当たらない。両方落とす
      // （`closing/MobileCollect.tsx` と同じ対）。
      qc.invalidateQueries({ queryKey: ['revenues'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      // 入金は財務の数字にも効くので、あちらも読み直す
      qc.invalidateQueries({ queryKey: ['dashboard', 'sales-overview'] });
      notifySuccess(p.value ? '記録しました' : '取り消しました');
    },
    onError: (e) => notifyApiError('更新できませんでした', e),
    onSettled: () => setBusyId(null),
  });

  const onMark = async (row: BillingInvoice, field: 'inspection_date' | 'paid_date') => {
    const label = field === 'paid_date' ? '入金' : '検収';
    const current = field === 'paid_date' ? row.paid_date : row.inspection_date;
    if (current) {
      // **取り消しは訊く。** 黙って戻せると、経理の訂正が誰にも気づかれない
      const ok = await confirmAction({
        title: `${label}の記録を取り消しますか`,
        description: `「${row.project_name}」の${label}日（${current}）を消します。もう一度押せば入れ直せます。`,
        confirmLabel: '取り消す',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(row.id);
    mark.mutate({ id: row.id, field, value: current ? null : today });
  };

  // `?? []` を素で書くと**毎回別の配列**になり、下の合計が毎描画で計算し直される
  const eRows = useMemo(() => estimates.data?.data ?? [], [estimates.data]);
  const iRows = useMemo(() => invoices.data?.data ?? [], [invoices.data]);

  /**
   * 合計。**絞り込み全体の合計**（サーバーが数えたもの）。値引きは引いたあと。
   * 古い応答が返ってきたときだけ、今までどおり行を足す
   * （数字が消えるより、多少ずれても出るほうがまし）。
   */
  const total = useMemo(() => {
    const server = tab === 'estimate' ? estimates.data?.total_amount : invoices.data?.total_amount;
    if (typeof server === 'number') return server;
    return tab === 'estimate'
      ? eRows.reduce((n, e) => n + Number(e.subtotal ?? 0) - Number(e.discount ?? 0), 0)
      : iRows.reduce((n, r) => n + Number(r.amount ?? 0), 0);
  }, [tab, eRows, iRows, estimates.data, invoices.data]);

  /** タブに出す件数も**絞り込み全体**（並んだ行の数ではない） */
  const eCount = estimates.data?.total_count ?? eRows.length;
  const iCount = invoices.data?.total_count ?? iRows.length;
  /** 出していない行の数。**黙って切らない** */
  const hidden = tab === 'estimate' ? eCount - eRows.length : iCount - iRows.length;

  const loading = tab === 'estimate' ? estimates.isLoading : invoices.isLoading;
  const err = tab === 'estimate' ? estimates.error : invoices.error;
  const isErr = tab === 'estimate' ? estimates.isError : invoices.isError;
  const rowCount = tab === 'estimate' ? eRows.length : iRows.length;
  const filtered = scope === 'mine' || (tab === 'estimate' ? estimateKey : invoiceKey) !== 'all';

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <PageHeader
        title="見積・請求"
        sub="全案件の見積と請求・検収を1か所で。行を押すとその案件の見積タブへ行きます"
      />

      {/* タブ。**URL に持たせる** — 共有したリンクが同じ画面で開く */}
      <div className="flex gap-1 border-b border-border">
        {([
          ['estimate', '見積', FileText, eCount],
          ['invoice', '請求', Receipt, iCount],
        ] as const).map(([key, label, Icon, n]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`min-h-tap flex items-center gap-2 border-b-2 px-3.5 text-list lg:min-h-[40px] ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
            <span className="font-number rounded-chip bg-muted px-1.5 text-sub-sm text-muted-foreground">{n}</span>
          </button>
        ))}
      </div>

      <div className="rounded-card flex flex-wrap items-center gap-2.5 border border-border bg-card p-3 lg:px-4">
        <FilterChips
          label="全体か自分かを切り替える"
          items={[
            { key: 'all', label: '全体', count: null },
            { key: 'mine', label: '自分', count: null },
          ]}
          value={scope}
          onChange={(v) => setScope(v as 'all' | 'mine')}
        />
        <span className="hidden h-5 w-px bg-border sm:block" />
        {tab === 'estimate' ? (
          <FilterChips
            label="見積の状態で絞り込む"
            items={ESTIMATE_CHIPS.map((c) => ({ key: c.key, label: c.label, count: null }))}
            value={estimateKey}
            onChange={setEstimateKey}
          />
        ) : (
          <FilterChips
            label="請求の状態で絞り込む"
            items={INVOICE_CHIPS.map((c) => ({ key: c.key, label: c.label, count: null }))}
            value={invoiceKey}
            onChange={setInvoiceKey}
          />
        )}
        <div className="flex-1" />
        {/* 合計は**絞り込み全体**のもの（並んでいる行のぶんではない）。
            絞り込みを変えると動く */}
        <span className="text-note text-muted-foreground">合計（税抜）</span>
        <Money value={total} className="w-40 text-[17px] font-bold" />
      </div>

      <section className="rounded-card overflow-hidden border border-border bg-card">
        {isErr ? (
          <div className="p-4">
            <ErrorPanel
              title={tab === 'estimate' ? '見積を読み込めませんでした' : '請求を読み込めませんでした'}
              error={err}
              onRetry={() => (tab === 'estimate' ? estimates.refetch() : invoices.refetch())}
            />
          </div>
        ) : loading ? (
          <div className="p-3"><Delayed><SkeletonRows rows={6} /></Delayed></div>
        ) : rowCount === 0 ? (
          <div className="p-4">
            {filtered ? (
              <NoSearchResults
                activeFilters={[
                  scope === 'mine' ? '自分のものだけ' : null,
                  tab === 'estimate'
                    ? (estimateKey !== 'all' ? `状態: ${ESTIMATE_CHIPS.find((c) => c.key === estimateKey)?.label}` : null)
                    : (invoiceKey !== 'all' ? `状態: ${INVOICE_CHIPS.find((c) => c.key === invoiceKey)?.label}` : null),
                ].filter((f): f is string => f !== null)}
                onClearFilters={() => { setScope('all'); setEstimateKey('all'); setInvoiceKey('all'); }}
              />
            ) : (
              <EmptyState
                title={tab === 'estimate' ? '見積がまだありません' : '確定した請求がまだありません'}
                description={tab === 'estimate'
                  ? '案件を開いて「見積・請求」タブからつくります。'
                  : '売上を確定すると、ここに並びます。'}
              />
            )}
          </div>
        ) : tab === 'estimate' ? (
          <EstimateRows rows={eRows} today={today} />
        ) : (
          <InvoiceRows rows={iRows} today={today} canEdit={canEdit} busyId={busyId} onMark={onMark} />
        )}

        {/* **切ったことを書く**（レビューでの指摘 #53）。黙って切ると
            「これで全部」と読まれる。**合計と件数には入っている** */}
        {hidden > 0 && (
          <p className="text-note border-t border-border-subtle px-4 py-2.5 text-muted-foreground">
            ほか <span className="font-number">{hidden}</span> 件（多いのでここには出していません。
            上の件数と合計には入っています。絞り込むと出せます）
          </p>
        )}
      </section>

      <div className="flex items-start gap-2.5 rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          {tab === 'estimate'
            ? '見積は版で残ります（v1・v2…）。差し替え済みの版はここには出ません。金額は値引きを引いたあとの税抜です。'
            : '検収・入金は押すと今日の日付が入り、もう一度押すと取り消せます。ここに出るのは確定した売上だけです。「分け合う」の印が付いた行は複数の案件で分け合う請求で、金額はグループ全体のものです。'}
        </p>
      </div>
    </div>
  );
}
