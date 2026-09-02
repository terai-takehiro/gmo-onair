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
 * ── 期間の計算は `financeDashboard/period.ts` ────────────────
 *
 * 純関数に出して `shared/tests/financeDashboardPeriod.test.ts` で固定しています
 * （月を空にすると `-01` を送って 400 になっていたため）。
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
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { SgaExpense } from '@/types';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { PeriodBar, type PeriodMode } from './financeDashboard/PeriodBar';
import { resolvePeriod, ledgerOpenQuery } from './financeDashboard/period';
import { useDashboardData, EMPTY_SUMMARY, type MonthlySummary } from './financeDashboard/useDashboardData';
import type { PurchaseRow } from './ledger/types';
import { PurchaseDialog } from './ledger/PurchaseDialog';
import SgaDialog from '../components/SgaDialog';
import { formFromSga } from '../components/sgaPrefill';
import { ProfitFlow, type FlowStep } from './financeDashboard/ProfitFlow';
import { BreakdownColumn, type BreakdownItem } from './financeDashboard/Breakdown';
import { useLatestDataMonth, LatestMonthAction } from './ledger/LatestDataMonth';

const pad2 = (n: number) => String(n).padStart(2, '0');

export default function BudgetDashboardPage() {
  const navigate = useNavigate();
  const now = new Date();
  const curYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const [mode, setMode] = useState<PeriodMode>('month');
  const [month, setMonth] = useState(curYm);
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [rangeFrom, setRangeFrom] = useState(`${now.getFullYear()}-01`);
  const [rangeTo, setRangeTo] = useState(curYm);
  const [projectId, setProjectId] = useState('');

  /*
   * **案件を選んだら期間は「全期間」にする**（ご要望）。案件は「その月に計上がある」
   * とは限らず、既定の今月のままだとほぼ必ず ¥0 の画面になる。そこから期間を外そうと
   * して月の欄を空にする、というのが今回のエラー報告の導線だった。
   * ⚠️ **切り替えるのは「絞っていない → 案件を選んだ」ときだけ**（毎回戻すと選び直す
   * たびに期間が飛ぶ）。解除したら元の期間へ戻す。
   */
  const [modeBeforeProject, setModeBeforeProject] = useState<PeriodMode | null>(null);
  const selectProject = (id: string) => {
    if (id && !projectId) { setModeBeforeProject(mode); setMode('all'); }
    if (!id && projectId) { if (modeBeforeProject) setMode(modeBeforeProject); setModeBeforeProject(null); }
    setProjectId(id);
  };

  // 期間の正規化と、送るパラメータの組み立ては `financeDashboard/period.ts`
  // （純関数にして `shared/tests/financeDashboardPeriod.test.ts` で固定してある）
  const period = useMemo(
    () => resolvePeriod({ mode, month, year, quarter, rangeFrom, rangeTo }),
    [mode, month, year, quarter, rangeFrom, rangeTo],
  );
  const { projects, summaryQuery, revenues, purchases, fixed, sga, periodReady } =
    useDashboardData(period, projectId);
  const s: MonthlySummary = (summaryQuery.data?.data as MonthlySummary) ?? EMPTY_SUMMARY;

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
   * 「台帳をひらく」に引き継ぐクエリパラメータ（仕様変更 #4）。**期間・案件の
   * 絞り込みを1つの文字列にまとめておき**、`BreakdownColumn`/`ProfitFlow` の
   * どの「台帳をひらく」導線からも同じものを使う（片方だけ引き継ぐ、を防ぐ）。
   */
  const ledgerQuery = useMemo(
    () => ledgerOpenQuery(period, projectId || undefined, projects.find((p) => p.id === projectId)?.name),
    [period, projectId, projects],
  );

  /*
   * 仕入・販管費の内訳の行を押すと、台帳へ移らずこのままダイアログを開く
   * （仕様変更 #3）。`readOnly` は「案件詳細『見積・請求』」から開くときと同じ
   * 使い方（`PurchaseDialog`/`SgaDialog` のコメント参照）。
   */
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseRow | null>(null);
  const [viewingSga, setViewingSga] = useState<SgaExpense | null>(null);

  // 販管費の閲覧ダイアログが担当者名・勘定科目名を出せるように、開いたときだけ引く
  // （どちらも小さい一覧で他画面と同じ鍵を使うのでキャッシュを共有できる）
  const { data: sgaUsersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users?limit=200')).data,
    enabled: !!viewingSga,
  });
  const sgaUsers: { id: string; name: string }[] = sgaUsersData?.data ?? [];
  const { data: sgaTitlesData } = useQuery({
    queryKey: ['sga-account-titles'],
    queryFn: async () => (await api.get('/sga/account-titles')).data.data as { id: string; name: string }[],
    enabled: !!viewingSga,
    staleTime: 60 * 60 * 1000,
  });
  const viewingSgaForm = useMemo(() => (viewingSga ? formFromSga(viewingSga) : null), [viewingSga]);

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
        { label: '売上', value: s.revenue_total, sub: `確定売上 ${revenueTotalCount}件`, to: '/budget/revenues' + ledgerQuery },
        { label: '仕入（変動原価）', value: s.variable_cost_total, sub: `この案件の ${purchaseTotalCount}件`, to: '/budget/purchases' + ledgerQuery },
        { label: '限界利益（粗利）', value: s.marginal_profit, result: true, pct: pct(s.marginal_profit) },
      ]
    : [
        { label: '売上', value: s.revenue_total, sub: `確定売上 ${revenueTotalCount}件`, to: '/budget/revenues' + ledgerQuery },
        { label: '仕入（変動原価）', value: s.variable_cost_total, sub: `案件に紐づく ${purchaseTotalCount}件`, to: '/budget/purchases' + ledgerQuery },
        { label: '限界利益（粗利）', value: s.marginal_profit, result: true, pct: pct(s.marginal_profit) },
        { label: '固定原価', value: s.fixed_cost_total, sub: `償却負担額など ${fixedTotalCount}件`, to: '/budget/purchases' + ledgerQuery },
        { label: '売上総利益', value: s.gross_profit, result: true, pct: pct(s.gross_profit) },
        { label: '販管費', value: s.sga_total, sub: `案件に紐づかない ${sgaTotalCount}件`, to: '/budget/sga' + ledgerQuery },
        { label: '営業利益', value: s.operating_profit, result: true, pct: pct(s.operating_profit) },
      ];

  const revItems: BreakdownItem[] = revenueRows.map(
    (r: {
      id: string; gls_number?: string | null; episode_code?: string | null; project_name?: string | null;
      customer_name?: string | null; amount: number; project_id?: string | null; group_id?: string | null;
    }) => ({
      id: r.id,
      code: r.episode_code || r.gls_number,
      title: r.project_name || '（案件名なし）',
      sub: r.customer_name,
      amount: Number(r.amount) || 0,
      // 按分グループの売上は案件ではなくグループの詳細へ（仕様変更 #2・
      // `RevenueListPage.tsx` の `onOpen` と同じ分岐）
      onClick: r.group_id
        ? () => navigate(`/sales/project-groups/${r.group_id}`)
        : r.project_id
          ? () => navigate(`/sales/projects/${r.project_id}`)
          : undefined,
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
    // 台帳へ行かず、このまま閲覧専用ダイアログを開く（仕様変更 #3）
    onClick: () => setViewingPurchase(p),
  }));

  const sgaItems: BreakdownItem[] = sgaRows.map(
    (x: SgaExpense) => ({
      id: x.id,
      title: x.description || '（詳細なし）',
      sub: x.vendor_name,
      amount: Number(x.amount) || 0,
      // 台帳へ行かず、このまま閲覧専用ダイアログを開く（仕様変更 #3）
      onClick: () => setViewingSga(x),
    }),
  );

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="財務ダッシュボード"
        sub={periodReady
          ? `${period.label} ・ 確定売上ベース ・ ${projectId ? '案件で絞り込み中（販管費は対象外）' : '全案件（販管費を含む）'}`
          : '期間を選んでください'}
      />

      <PeriodBar
        mode={mode} setMode={setMode}
        month={month} setMonth={setMonth}
        year={year} setYear={setYear}
        quarter={quarter} setQuarter={setQuarter}
        rangeFrom={rangeFrom} setRangeFrom={setRangeFrom}
        rangeTo={rangeTo} setRangeTo={setRangeTo}
        projects={projects} projectId={projectId} setProjectId={selectProject}
      />

      {/*
        * 期間が入っていないときは読み込みに行かない。**何を待っているのか書かないと固まって見える**。
        * ⚠️ **数字は1つも出さない。** 読みに行っていないので、ここで ¥0 を出すと
        * 「0 と分かった」と読めてしまう（実際は「まだ数えていない」）。
        */}
      {!periodReady ? (
        <div className="rounded-card border border-border bg-card p-3 text-sub text-secondary-foreground lg:px-4">
          {period.label}（期間を外して見たいときは「全期間」を選んでください）
        </div>
      ) : summaryQuery.isError ? (
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
              totalCount={revenues.isError ? null : revenueTotalCount}
              hasMore={!!revenues.hasNextPage}
              isLoadingMore={revenues.isFetchingNextPage}
              onLoadMore={() => revenues.fetchNextPage()}
              error={revenues.error}
              onRetry={() => revenues.refetch()}
              to={'/budget/revenues' + ledgerQuery}
              empty="この期間の確定売上はありません。"
            />
            <BreakdownColumn
              title="仕入の内訳"
              total={s.purchase_total}
              items={purItems}
              totalCount={
                // ⚠️ **片方でも落ちたら数を出さない。** この列は変動原価と固定原価の
                // 2本を足しているので、足し算のままだと「失敗を出したのに件数だけ嘘」になる
                purchases.isError || fixed.isError ? null : purchaseTotalCount + fixedTotalCount
              }
              hasMore={!!purchases.hasNextPage}
              isLoadingMore={purchases.isFetchingNextPage}
              onLoadMore={() => purchases.fetchNextPage()}
              error={purchases.error ?? fixed.error}
              partialLabel={!purchases.isError && fixed.isError ? '固定原価' : undefined}
              onRetry={() => { purchases.refetch(); fixed.refetch(); }}
              to={'/budget/purchases' + ledgerQuery}
              empty="この期間の仕入はありません。"
            />
            {/* 販管費は案件に紐づかないので、案件で絞り込み中は内訳ごと出さない（ご要望） */}
            {!projectId && (
              <BreakdownColumn
                title="販管費の内訳"
                total={s.sga_total}
                items={sgaItems}
                totalCount={sga.isError ? null : sgaTotalCount}
                hasMore={!!sga.hasNextPage}
                isLoadingMore={sga.isFetchingNextPage}
                onLoadMore={() => sga.fetchNextPage()}
                error={sga.error}
                onRetry={() => sga.refetch()}
                to={'/budget/sga' + ledgerQuery}
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

      {/* 仕入・販管費の内訳の行を押したときの閲覧専用ダイアログ（仕様変更 #3）。
          台帳ページへは移らず、このままダッシュボード上で開く */}
      {viewingPurchase && (
        <PurchaseDialog
          readOnly
          editing={viewingPurchase}
          defaultProjectId={viewingPurchase.project_id ?? ''}
          onClose={() => setViewingPurchase(null)}
        />
      )}
      {viewingSga && viewingSgaForm && (
        <SgaDialog
          readOnly
          open
          onOpenChange={(v) => { if (!v) setViewingSga(null); }}
          editingId={viewingSga.id}
          form={viewingSgaForm}
          setForm={() => {}}
          vendors={[]}
          users={sgaUsers}
          accountTitles={sgaTitlesData ?? []}
          isSaving={false}
          onSubmit={() => {}}
          onClose={() => setViewingSga(null)}
        />
      )}
    </div>
  );
}
