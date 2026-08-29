/**
 * ① 財務ダッシュボード (v4)
 *
 * 売上から営業利益まで、**引き算の順に並べます**。
 *
 * ── KPI を8枚並べるのをやめた ────────────────────────────────
 *
 * 旧実装は同じ大きさのカードを8枚並べていて、**どれとどれを引くと
 * どれになるのかが読み取れませんでした**（「限界利益」と「売上総利益」が
 * 隣にあるのに関係が書いていない）。演算子を出すと1回で読めます。
 *
 * ── 数え方は1か所（サーバー）────────────────────────────────
 *
 * 合計は `GET /monthly-summary` が出します。**画面で足し算し直しません** —
 * 内訳は上位だけを出す（＝全部足しても合計にならない）ので、
 * 画面側で計算すると内訳と合計が食い違います。
 *
 * ── 期間の計算は旧実装のまま ──────────────────────────────────
 *
 * 月／四半期／年／期間指定の期間の作り方は1行も変えていません。
 *
 * ── 内訳は「台帳へ行かないと全件見えない」を無くした ──────────
 *
 * 以前は5本のクエリとも `limit` を大きく（300/2000）指定して上位だけを
 * 切り出していましたが、実際には共通の `extractPagination` が `limit` を
 * 無条件に100件へ切っており（`shared/services/pagination.ts`）、大きい
 * `limit` を渡しても100件しか返っていませんでした。売上・仕入（変動原価）・
 * 販管費は `useInfiniteQuery` に変え、`BreakdownColumn` の「もっと見る」で
 * サーバーの実ページ（100件区切り）を追加取得できるようにしています
 * （固定原価は案件のように増えないため従来どおり単発取得のまま）。
 */
import { useMemo, useState } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatMonth } from '@/lib/format';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { PeriodBar, type PeriodMode, type ProjectOption } from './financeDashboard/PeriodBar';
import { ProfitFlow, type FlowStep } from './financeDashboard/ProfitFlow';
import { BreakdownColumn, type BreakdownItem } from './financeDashboard/Breakdown';
import { useLatestDataMonth, LatestMonthAction } from './ledger/LatestDataMonth';

interface MonthlySummary {
  month: string;
  revenue_total: number;
  purchase_total: number;
  fixed_cost_total: number;
  variable_cost_total: number;
  marginal_profit: number;
  gross_profit: number;
  sga_total: number;
  operating_profit: number;
}

const EMPTY: MonthlySummary = {
  month: '', revenue_total: 0, purchase_total: 0, fixed_cost_total: 0,
  variable_cost_total: 0, marginal_profit: 0, gross_profit: 0, sga_total: 0, operating_profit: 0,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

type PurchaseRow = {
  id: string; gls_number?: string | null; episode_code?: string | null;
  project_name?: string | null; vendor_name?: string | null; description?: string | null;
  amount: number; is_provisional?: boolean;
};

/** `paginatedResponse`（サーバー共通）の形。`total`/`totalPages` を badge・もっと見るに使う */
interface PagedResponse<T> {
  data: T[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

/** サーバー共通の上限（`shared/services/pagination.ts` の `Math.min(100, …)`）に合わせたページサイズ */
const PAGE_SIZE = 100;

export default function BudgetDashboardPage() {
  const now = new Date();
  const curYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const [mode, setMode] = useState<PeriodMode>('month');
  const [month, setMonth] = useState(curYm);
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [rangeFrom, setRangeFrom] = useState(`${now.getFullYear()}-01`);
  const [rangeTo, setRangeTo] = useState(curYm);
  const [projectId, setProjectId] = useState('');

  // 集計期間を [from, to] (YYYY-MM-DD) + 表示ラベルに正規化（旧実装のまま）
  const period = useMemo(() => {
    if (mode === 'quarter') {
      const sm = (quarter - 1) * 3 + 1;
      const em = sm + 2;
      return { from: `${year}-${pad2(sm)}-01`, to: `${year}-${pad2(em)}-31`, label: `${year}年 ${quarter}Q（${sm}〜${em}月）` };
    }
    if (mode === 'year') return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}年（1〜12月 合算）` };
    if (mode === 'range') {
      const [f, t] = rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom];
      return { from: `${f}-01`, to: `${t}-31`, label: `${formatMonth(`${f}-01`)} から ${formatMonth(`${t}-01`)}` };
    }
    return { from: `${month}-01`, to: `${month}-31`, label: formatMonth(`${month}-01`) };
  }, [mode, month, year, quarter, rangeFrom, rangeTo]);

  /*
   * ⚠️ **`/projects?limit=500` は実は 100 件しか返らない**（ご指摘の再現例
   * GLS-A004「GMOアワード2026」で発覚）。`limit` は共通の `extractPagination`
   * （`shared/services/pagination.ts`）が `Math.min(100, …)` で無条件に切るため、
   * `?limit=500` と書いても静かに 100 件へ落ちる。しかも既定の並び順
   * (`DEFAULT_SORT_SQL`) は「完了/失注は最後」なので、GMOアワード2026 のように
   * **開催済み（`s_completed`）の案件から真っ先に 100 件の外へ押し出される**。
   *
   * `client/CLAUDE.md`「受注確定した案件の絞り込みは stage が正」の節のとおり、
   * 受注確定済みの一覧は `project.service.ts` の `getWonProjects()`
   * （`stage IN ('a_won','s_completed')`・**上限なし**）を使うのが正しい形で、
   * 現に同関数のコメントは「予算詳細」もこの一覧の利用先として挙げている
   * （仕入・売上・精算PDF取込レビュー・書類引き渡しの案件プルダウンと同じ）。
   * ここが `/projects?limit=500` のままだったのが今回のズレの本体。
   */
  const { data: projectsData } = useQuery({
    queryKey: ['won-projects-for-budget-dashboard'],
    queryFn: async () => (await api.get('/projects/won-projects')).data,
    staleTime: 120_000,
  });
  /*
   * **`won-projects` だけでも足りない。** 受注確定（`a_won`/`s_completed`）より
   * 前のステージ・削除済みでも、按分や過去の入力で `revenues`/`purchases` に
   * 実績が残っていることがある。そちらを取りこぼさないよう、上限を持たない
   * `/projects-with-activity`（内訳＝`revenues`/`purchases` の LEFT JOIN と同じ集合）
   * を合わせて出す
   */
  const { data: activeProjectsData } = useQuery({
    queryKey: ['projects-with-activity', period.from, period.to],
    queryFn: async () => (await api.get('/projects-with-activity', {
      params: { from: period.from, to: period.to },
    })).data,
    enabled: !!period.from,
    staleTime: 60_000,
  });
  const projects: ProjectOption[] = useMemo(() => {
    const base: ProjectOption[] = projectsData?.data ?? [];
    const extra: ProjectOption[] = activeProjectsData?.data ?? [];
    const seen = new Set(base.map((p) => p.id));
    return [...base, ...extra.filter((p) => !seen.has(p.id))];
  }, [projectsData, activeProjectsData]);

  const summaryQuery = useQuery({
    queryKey: ['budget-monthly-summary', period.from, period.to, projectId],
    queryFn: async () => {
      const params: Record<string, string> = { from: period.from, to: period.to };
      if (projectId) params.project_id = projectId;
      return (await api.get('/monthly-summary', { params, timeout: 20_000 })).data;
    },
    enabled: !!period.from,
    retry: 1,
  });
  const s: MonthlySummary = (summaryQuery.data?.data as MonthlySummary) ?? EMPTY;

  const revenues = useInfiniteQuery({
    queryKey: ['budget-breakdown-revenues', period.from, period.to, projectId],
    queryFn: async ({ pageParam }) => {
      // 合計 (monthly-summary) は確定売上だけを数えているので内訳も confirmed に揃える
      const params: Record<string, string | number> = {
        recognition_from: period.from, recognition_to: period.to, limit: PAGE_SIZE, page: pageParam, status: 'confirmed',
      };
      if (projectId) params.project_id = projectId;
      return (await api.get('/revenues', { params })).data as PagedResponse<any>; // 行の形は revItems 側で個別に絞る
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
    enabled: !!period.from,
  });

  // 仕入(変動原価): 固定原価Pjを除く。固定原価は gls_number=NULL で既定ソートの末尾に来るため、
  // 同じクエリだと limit 内に入らず消える（旧実装のコメントのまま）
  const purchases = useInfiniteQuery({
    queryKey: ['budget-breakdown-purchases', period.from, period.to, projectId],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string | number> = {
        recognition_from: period.from, recognition_to: period.to, limit: PAGE_SIZE, page: pageParam, fixed_cost: '0',
      };
      if (projectId) params.project_id = projectId;
      return (await api.get('/purchases', { params })).data as PagedResponse<PurchaseRow>;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
    enabled: !!period.from,
  });

  // 固定原価は案件に紐づかない。案件で絞り込み中は「限界利益まで」しか出さないので取りに行かない。
  // 償却負担額など全社共通の少数の行しか無い想定のため、こちらは単発取得のまま（「もっと見る」を持たない）
  const fixed = useQuery({
    queryKey: ['budget-breakdown-fixed', period.from, period.to],
    queryFn: async () => (await api.get('/purchases', {
      params: { recognition_from: period.from, recognition_to: period.to, limit: PAGE_SIZE, fixed_cost: '1' },
    })).data as PagedResponse<PurchaseRow>,
    enabled: !!period.from && !projectId,
  });

  // 販管費は案件に紐づかないので、案件で絞っているときは取りに行かない
  const sga = useInfiniteQuery({
    queryKey: ['budget-breakdown-sga', period.from, period.to],
    queryFn: async ({ pageParam }) => (await api.get('/sga', {
      params: { recognition_from: period.from, recognition_to: period.to, limit: PAGE_SIZE, page: pageParam },
    })).data as PagedResponse<any>,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
    enabled: !!period.from && !projectId,
  });

  // 読み込み済みページを1本の配列に展開。**件数の badge には使わない**（読み込み済み分でしかない）
  const revenueRows = useMemo(() => revenues.data?.pages.flatMap((p) => p.data) ?? [], [revenues.data]);
  const purchaseRows = useMemo(() => purchases.data?.pages.flatMap((p) => p.data) ?? [], [purchases.data]);
  const sgaRows = useMemo(() => sga.data?.pages.flatMap((p) => p.data) ?? [], [sga.data]);

  // 件数の badge・「もっと見る」の残数はサーバーが返す実件数 (pagination.total) を正とする
  const revenueTotalCount = revenues.data?.pages[0]?.pagination?.total ?? revenueRows.length;
  const purchaseTotalCount = purchases.data?.pages[0]?.pagination?.total ?? purchaseRows.length;
  const fixedTotalCount = fixed.data?.pagination?.total ?? fixed.data?.data.length ?? 0;
  const sgaTotalCount = sga.data?.pages[0]?.pagination?.total ?? sgaRows.length;

  const pct = (n: number) => (s.revenue_total > 0 ? (n / s.revenue_total) * 100 : null);

  /*
   * **「全部ゼロ」で行き止まりにしない。** 既定の期間は今月だが、月次の入力は
   * 締めのあとに入るので、今月を開いた時点では1件も無いのが普通で、以前は
   * 手掛かりゼロの ¥0 画面が出るだけだった。0 のときだけ「確定売上のある
   * 最新の月」を引いて、その月へ移れるようにする（サーバーは足していない・
   * `ledger/LatestDataMonth.tsx`）。**基準は確定売上**（この画面の見出しと同じ）。
   */
  const nothingHere = !summaryQuery.isLoading && !summaryQuery.isError
    && s.revenue_total === 0 && s.purchase_total === 0 && s.sga_total === 0;
  const latestMonth = useLatestDataMonth('/revenues', {
    enabled: nothingHere,
    params: { status: 'confirmed', project_id: projectId || undefined },
  });

  /*
   * **案件で絞り込み中は3枚だけ。** 販管費は案件に紐づかない（＝どの案件で絞っても
   * 同じ全社の販管費が出るだけで、その案件の損益とは無関係）ので、絞り込み中は
   * 「売上 − 仕入（変動原価） = 限界利益」までしか出さない。固定原価・売上総利益・
   * 営業利益も同じ理由でここでは意味を持たないため出さない（ご要望）。
   */
  const steps: FlowStep[] = projectId
    ? [
        { label: '売上', value: s.revenue_total, sub: `確定売上 ${revenueTotalCount}件`, to: '/budget/revenues' },
        { label: '仕入（変動原価）', value: s.variable_cost_total, sub: `この案件の ${purchaseTotalCount}件`, to: '/budget/purchases' },
        { label: '限界利益（粗利）', value: s.marginal_profit, result: true, pct: pct(s.marginal_profit) },
      ]
    : [
        { label: '売上', value: s.revenue_total, sub: `確定売上 ${revenueTotalCount}件`, to: '/budget/revenues' },
        { label: '仕入（変動原価）', value: s.variable_cost_total, sub: `案件に紐づく ${purchaseTotalCount}件`, to: '/budget/purchases' },
        { label: '限界利益（粗利）', value: s.marginal_profit, result: true, pct: pct(s.marginal_profit) },
        { label: '固定原価', value: s.fixed_cost_total, sub: `償却負担額など ${fixedTotalCount}件`, to: '/budget/purchases' },
        { label: '売上総利益', value: s.gross_profit, result: true, pct: pct(s.gross_profit) },
        { label: '販管費', value: s.sga_total, sub: `案件に紐づかない ${sgaTotalCount}件`, to: '/budget/sga' },
        { label: '営業利益', value: s.operating_profit, result: true, pct: pct(s.operating_profit) },
      ];

  const revItems: BreakdownItem[] = revenueRows.map(
    (r: { id: string; gls_number?: string | null; episode_code?: string | null; project_name?: string | null; customer_name?: string | null; amount: number }) => ({
      id: r.id,
      code: r.episode_code || r.gls_number,
      title: r.project_name || '（案件名なし）',
      sub: r.customer_name,
      amount: Number(r.amount) || 0,
    }),
  );

  const purItems: BreakdownItem[] = [
    ...purchaseRows,
    ...((fixed.data?.data ?? []) as PurchaseRow[]),
  ].map((p) => ({
    id: p.id,
    code: p.episode_code || p.gls_number,
    title: p.description || p.project_name || '（説明なし）',
    sub: [p.vendor_name, p.project_name].filter(Boolean).join(' ／ ') || null,
    amount: Number(p.amount) || 0,
    tag: p.is_provisional ? '仮' : null,
  }));

  const sgaItems: BreakdownItem[] = sgaRows.map(
    (x: { id: string; vendor_name?: string | null; description?: string | null; amount: number }) => ({
      id: x.id,
      title: x.description || '（詳細なし）',
      sub: x.vendor_name,
      amount: Number(x.amount) || 0,
    }),
  );

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="財務ダッシュボード"
        sub={`${period.label} ・ 確定売上ベース ・ ${projectId ? '案件で絞り込み中（販管費は対象外）' : '全案件（販管費を含む）'}`}
      />

      <PeriodBar
        mode={mode} setMode={setMode}
        month={month} setMonth={setMonth}
        year={year} setYear={setYear}
        quarter={quarter} setQuarter={setQuarter}
        rangeFrom={rangeFrom} setRangeFrom={setRangeFrom}
        rangeTo={rangeTo} setRangeTo={setRangeTo}
        projects={projects} projectId={projectId} setProjectId={setProjectId}
      />

      {summaryQuery.isError ? (
        <ErrorPanel
          title="損益を読み込めませんでした"
          error={summaryQuery.error}
          onRetry={() => summaryQuery.refetch()}
        />
      ) : summaryQuery.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : (
        <>
          {nothingHere && latestMonth && !(mode === 'month' && latestMonth === month) && (
            <div className="rounded-card flex flex-wrap items-center gap-3 border border-border bg-card p-3 lg:px-4">
              <span className="text-sub text-secondary-foreground">
                {period.label} には計上がありません。
              </span>
              <div className="flex-1" />
              <LatestMonthAction
                month={latestMonth}
                current={mode === 'month' ? month : ''}
                what="確定売上"
                onJump={(m) => { setMode('month'); setMonth(m); }}
              />
            </div>
          )}

          <ProfitFlow steps={steps} />

          <div className={`grid grid-cols-1 gap-3.5 ${projectId ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
            <BreakdownColumn
              title="売上の内訳"
              total={s.revenue_total}
              items={revItems}
              totalCount={revenueTotalCount}
              hasMore={!!revenues.hasNextPage}
              isLoadingMore={revenues.isFetchingNextPage}
              onLoadMore={() => revenues.fetchNextPage()}
              to="/budget/revenues"
              empty="この期間の確定売上はありません。"
            />
            <BreakdownColumn
              title="仕入の内訳"
              total={s.purchase_total}
              items={purItems}
              totalCount={purchaseTotalCount + fixedTotalCount}
              hasMore={!!purchases.hasNextPage}
              isLoadingMore={purchases.isFetchingNextPage}
              onLoadMore={() => purchases.fetchNextPage()}
              to="/budget/purchases"
              empty="この期間の仕入はありません。"
            />
            {/* 販管費は案件に紐づかないので、案件で絞り込み中は内訳ごと出さない（ご要望） */}
            {!projectId && (
              <BreakdownColumn
                title="販管費の内訳"
                total={s.sga_total}
                items={sgaItems}
                totalCount={sgaTotalCount}
                hasMore={!!sga.hasNextPage}
                isLoadingMore={sga.isFetchingNextPage}
                onLoadMore={() => sga.fetchNextPage()}
                to="/budget/sga"
                empty="この期間の販管費はありません。"
              />
            )}
          </div>

          <p className="text-note text-muted-foreground">
            内訳は既定では<strong className="font-bold">金額の大きい順に上位だけ</strong>を出しています。
            「この条件の全N件をここで見る」で、この絞り込み条件に該当する分をすべてこの画面のまま確認できます
            （編集・CSV書き出しなど台帳側の機能が必要なときは「台帳をひらく」から移動してください）。
          </p>
        </>
      )}
    </div>
  );
}
