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
 * ── 案件の絞り込みは URL が正（`?project_id=`）──────────────
 *
 * 絞り込み帯のプルダウンで案件を選ぶと**この画面のまま**その案件だけの集計になります。
 * 絞り込みをコンポーネントの state で持つと**「戻る」で全案件に戻れず、その状態の
 * リンクも共有できない**ので、URL に置いて売上台帳（`RevenueListPage`）と
 * そろえています（`financeDashboard/useProjectFilter.ts`）。
 *
 * ── 内訳の行を押したら「明細一覧（台帳）」へ飛ぶ（売上だけ）──────
 *
 * 売上の行は**押す＝台帳の明細一覧へ移動**（ご指摘「明細一覧に飛ばして
 * ください」）。`/budget/revenues` へ、いま効いている期間（と、案件に紐づく
 * 行はその案件）で絞り込んだ状態で開きます。**引き継ぐクエリの組み立ては
 * `ledgerOpenQuery` 1本**で、カード下の「台帳をひらく」ボタンと同じ関数を
 * 通ります — 違いは案件を付けるかどうかだけ（行＝その行の案件／
 * フッター＝いま絞り込み中の案件）。
 *
 * ── 仕入・販管費の行は「この画面のまま」詳細モーダルだけを開く（9/4）──
 *
 * 一時期は仕入・販管費も売上と同じく台帳へ`navigate()`し、`?edit=<id>`で
 * 編集ダイアログを開いた状態で着地させていた。しかし**背景のページごと台帳に
 * 遷移してしまい、一覧画面を維持してほしい**というご指摘が入ったため、
 * フルページ遷移をやめ、行はすでに持っている1件分のデータで、この画面の上に
 * 閲覧専用モーダル（`PurchaseDialog`/`SgaDialog` の `readOnly`）を重ねるだけに
 * 戻した（`viewingPurchase`/`viewingSga` の state）。台帳側の編集ダイアログや
 * `?edit=` の仕組み自体は他画面（`PdfTab.tsx` 等）が使うためそのまま残っている。
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
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SgaExpense } from '@/types';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { PeriodBar, type PeriodMode } from './financeDashboard/PeriodBar';
import { resolvePeriod, ledgerOpenQuery } from './financeDashboard/period';
import { useDashboardData, EMPTY_SUMMARY, type MonthlySummary } from './financeDashboard/useDashboardData';
import type { PurchaseRow } from './ledger/types';
import { PurchaseDialog } from './ledger/PurchaseDialog';
import SgaDialog, { initialFormData as initialSgaForm, type SgaFormData } from '../components/SgaDialog';
import { formFromSga } from '../components/sgaPrefill';
import { ProfitFlow, type FlowStep } from './financeDashboard/ProfitFlow';
import { PipelineForecast } from './financeDashboard/PipelineForecast';
import { ForecastModeToggle, type ForecastMode } from './financeDashboard/ForecastModeToggle';
import { BreakdownColumn } from './financeDashboard/Breakdown';
import { useProjectFilter, initialPeriodMode } from './financeDashboard/useProjectFilter';
import {
  buildRevenueItems, buildPurchaseItems, buildSgaItems, type RevenueBreakdownRow,
} from './financeDashboard/breakdownItems';
import { useLatestDataMonth, LatestMonthAction } from './ledger/LatestDataMonth';
import { useEntityFilter, EntityTabs } from './shared/entityFilter';

const pad2 = (n: number) => String(n).padStart(2, '0');

export default function BudgetDashboardPage() {
  const navigate = useNavigate();
  const now = new Date();
  const curYm = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const [mode, setMode] = useState<PeriodMode>(initialPeriodMode);
  const [month, setMonth] = useState(curYm);
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [rangeFrom, setRangeFrom] = useState(`${now.getFullYear()}-01`);
  const [rangeTo, setRangeTo] = useState(curYm);

  /*
   * 「全部を100%で」/「確度をかけて」の切り替え（営業見通しカードが使う）。**画面レベルの state**
   * にして `PeriodBar` と同じ並びに置く（旧 `PipelineForecast.tsx` のローカル state を
   * 引き上げたもの・ファイル冒頭コメント参照）。初期値は旧実装を踏襲し「確度をかけて」。
   * ⚠️ 集計対象はこれまでどおり `PipelineForecast` だけ（損益フロー・内訳・サマリーには適用しない）
   */
  const [forecastMode, setForecastMode] = useState<ForecastMode>('weighted');

  // 案件の絞り込み（URL の `?project_id=` が正）は `financeDashboard/useProjectFilter.ts`。
  // この画面で案件を絞る道はプルダウン1本（内訳の行のうち売上だけ台帳へ移動する）
  const { projectId, selectProject } = useProjectFilter(mode, setMode);
  const { entity, setEntity, options: entityOptions } = useEntityFilter(); // `?entity=` が正。省略=全社合算

  // 仕入・販管費の行を押したときに、この画面のまま開く閲覧専用モーダル
  // （台帳へは遷移しない・ファイル冒頭コメント参照）
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseRow | null>(null);
  const [viewingSga, setViewingSga] = useState<SgaExpense | null>(null);
  const [viewingSgaForm, setViewingSgaForm] = useState<SgaFormData>(initialSgaForm);

  // 期間の正規化と、送るパラメータの組み立ては `financeDashboard/period.ts`
  // （純関数にして `shared/tests/financeDashboardPeriod.test.ts` で固定してある）
  const period = useMemo(
    () => resolvePeriod({ mode, month, year, quarter, rangeFrom, rangeTo }),
    [mode, month, year, quarter, rangeFrom, rangeTo],
  );
  const { projects, summaryQuery, revenues, purchases, fixed, sga, periodReady } =
    useDashboardData(period, projectId, entity);
  const s: MonthlySummary = (summaryQuery.data?.data as MonthlySummary) ?? EMPTY_SUMMARY;

  // 読み込み済みページを1本の配列に展開。**件数の badge には使わない**（読み込み済み分でしかない）
  const revenueRows = useMemo<RevenueBreakdownRow[]>(
    () => revenues.data?.pages.flatMap((p) => p.data) ?? [], [revenues.data],
  );
  const purchaseRows = useMemo(() => purchases.data?.pages.flatMap((p) => p.data) ?? [], [purchases.data]);
  const sgaRows = useMemo<SgaExpense[]>(() => sga.data?.pages.flatMap((p) => p.data) ?? [], [sga.data]);

  // 件数の badge・「もっと見る」の残数はサーバーが返す実件数 (pagination.total) を正とする
  const revenueTotalCount = revenues.data?.pages[0]?.pagination?.total ?? revenueRows.length;
  const purchaseTotalCount = purchases.data?.pages[0]?.pagination?.total ?? purchaseRows.length;
  const fixedTotalCount = fixed.data?.pagination?.total ?? fixed.data?.data.length ?? 0;
  const sgaTotalCount = sga.data?.pages[0]?.pagination?.total ?? sgaRows.length;

  const pct = (n: number) => (s.revenue_total > 0 ? (n / s.revenue_total) * 100 : null);

  /*
   * 絞り込み中の案件名。**プルダウンの候補に無くても出せるようにする** —
   * 候補の一部（`projects-with-activity`）は期間つきで引いているので、絞り込んだあとに
   * 期間を変えると候補から消え、`SearchableSelect` が placeholder（＝「全案件」）に
   * 戻って**絞り込みが効いていないように見える**。読み込み済みの行からも名前を拾う。
   */
  const selectedProjectName = useMemo(() => {
    if (!projectId) return undefined;
    return projects.find((p) => p.id === projectId)?.name
      ?? revenueRows.find((r) => r.project_id === projectId)?.project_name
      ?? purchaseRows.find((p) => p.project_id === projectId)?.project_name
      ?? undefined;
  }, [projectId, projects, revenueRows, purchaseRows]);

  /** 絞り込み中の案件を候補に必ず含める（上のコメントの打ち消し） */
  const projectOptions = useMemo(
    () => (!projectId || projects.some((p) => p.id === projectId)
      ? projects
      : [{ id: projectId, gls_number: null, name: selectedProjectName ?? '（選んだ案件）' }, ...projects]),
    [projects, projectId, selectedProjectName],
  );

  /*
   * カード下の「台帳をひらく」・損益フローの各段が引き継ぐクエリパラメータ
   * （仕様変更 #4）。**期間と、いま絞り込み中の案件を1つの文字列にまとめておき**、
   * `BreakdownColumn`/`ProfitFlow` のどの導線からも同じものを使う
   * （片方だけ引き継ぐ、を防ぐ）。
   */
  const ledgerQuery = useMemo(
    () => ledgerOpenQuery(period, projectId || undefined, selectedProjectName ?? undefined),
    [period, projectId, selectedProjectName],
  );

  /*
   * 売上の**行**から台帳（明細一覧）へ移る。フッターの「台帳をひらく」と
   * **同じ `ledgerOpenQuery`** を通し、案件だけ「その行のもの」に差し替える。
   * ⚠️ 仕入・販管費の行はここを通らない（この画面のまま詳細モーダルを開くだけ・
   * ファイル冒頭コメント参照）。
   */
  const openLedger = useCallback(
    (path: string, rowProjectId?: string | null, rowProjectName?: string | null) => {
      navigate(path + ledgerOpenQuery(period, rowProjectId || undefined, rowProjectName || undefined));
    },
    [navigate, period],
  );

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
        { label: '限界利益', value: s.marginal_profit, result: true, pct: pct(s.marginal_profit) },
      ]
    : [
        { label: '売上', value: s.revenue_total, sub: `確定売上 ${revenueTotalCount}件`, to: '/budget/revenues' + ledgerQuery },
        { label: '仕入（変動原価）', value: s.variable_cost_total, sub: `案件に紐づく ${purchaseTotalCount}件`, to: '/budget/purchases' + ledgerQuery },
        { label: '限界利益', value: s.marginal_profit, result: true, pct: pct(s.marginal_profit) },
        { label: '固定原価', value: s.fixed_cost_total, sub: `償却負担額など ${fixedTotalCount}件`, to: '/budget/purchases' + ledgerQuery },
        { label: '売上総利益', value: s.gross_profit, result: true, pct: pct(s.gross_profit) },
        { label: '販管費', value: s.sga_total, sub: `案件に紐づかない ${sgaTotalCount}件`, to: '/budget/sga' + ledgerQuery },
        { label: '営業利益', value: s.operating_profit, result: true, pct: pct(s.operating_profit) },
      ];

  // 行の組み立ては `financeDashboard/breakdownItems.ts`（申請ステータスは台帳と共通の
  // `settlementState` から作る）。ここは**押したときに何が起きるか**だけを決める
  const revItems = buildRevenueItems(revenueRows, {
    openLedger: (id, name) => openLedger('/budget/revenues', id, name),
    openGroup: (groupId) => navigate(`/sales/project-groups/${groupId}`),
  });
  const purItems = buildPurchaseItems(
    [...purchaseRows, ...((fixed.data?.data ?? []) as PurchaseRow[])],
    (row) => setViewingPurchase(row),
  );
  const sgaItems = buildSgaItems(sgaRows, (row) => { setViewingSga(row); setViewingSgaForm(formFromSga(row)); });

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="財務ダッシュボード"
        /* ⚠️ **どの案件で絞っているのかを名前で出す。** 絞り込み帯のプルダウンは
            画面を作り直さずクエリだけ変えるので、ここに出ないと効いたことが分からない */
        sub={periodReady
          ? `${period.label} ・ 確定売上ベース ・ ${projectId
              ? `${selectedProjectName ?? '選んだ案件'} で絞り込み中（販管費は対象外）`
              : '全案件（販管費を含む）'}`
          : '期間を選んでください'}
      />

      <EntityTabs entity={entity} setEntity={setEntity} options={entityOptions} />
      <PeriodBar
        mode={mode} setMode={setMode}
        month={month} setMonth={setMonth}
        year={year} setYear={setYear}
        quarter={quarter} setQuarter={setQuarter}
        rangeFrom={rangeFrom} setRangeFrom={setRangeFrom}
        rangeTo={rangeTo} setRangeTo={setRangeTo}
        projects={projectOptions} projectId={projectId} setProjectId={selectProject}
      />

      {/*
        * 「全部を100%で」/「確度をかけて」の切り替え。**期間・案件の絞り込み（`PeriodBar`）と
        * 同じ並びの画面レベルの設定として、常に見える・操作できる場所に置く**
        * （旧実装は営業見通しカードの中に閉じていた・ファイル冒頭コメント参照）。
        * 効くのは直下の営業見通しカードだけ（損益フロー・内訳・サマリーには適用しない）。
        */}
      <div className="rounded-card flex flex-wrap items-center gap-2 border border-border bg-card p-3 lg:px-4">
        <span className="text-sub shrink-0 text-muted-foreground">見込みの数え方</span>
        <ForecastModeToggle mode={forecastMode} onChange={setForecastMode} />
        <span className="text-note text-muted-foreground">営業見通しにだけ効きます</span>
      </div>

      {/*
        * 営業見通しは期間の絞り込みと無関係（ファイル冒頭コメント参照）
        * なので、`periodReady` を待たずに常に出す。案件の絞り込みだけ引き継ぐ。
        */}
      <PipelineForecast projectId={projectId} forecastMode={forecastMode} entityCode={entity} />

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
            「この条件の全N件をここで見る」で、この絞り込み条件に該当する分をすべてこの画面のまま確認できます。
            <strong className="font-bold">売上の行を押すと明細一覧（台帳）</strong>を同じ期間で絞り込んで開きます
            （編集・CSV書き出しなど台帳側の機能はそちらにあります）。
            <strong className="font-bold">仕入・販管費の行を押すとこの画面のまま詳細</strong>だけを確認できます。
          </p>
        </>
      )}

      {/* 仕入の内訳を押したときの閲覧専用の詳細。この画面のまま開き、台帳へは遷移しない */}
      {viewingPurchase && (
        <PurchaseDialog
          readOnly
          editing={viewingPurchase}
          defaultProjectId={viewingPurchase.project_id ?? ''}
          onClose={() => setViewingPurchase(null)}
        />
      )}

      {/* 販管費の内訳を押したときの閲覧専用の詳細。同上 */}
      {viewingSga && (
        <SgaDialog
          readOnly
          open
          onOpenChange={(v) => { if (!v) setViewingSga(null); }}
          form={viewingSgaForm}
          setForm={setViewingSgaForm}
          vendors={[]}
          users={[]}
          editingId={viewingSga.id}
          isSaving={false}
          onSubmit={() => {}}
          onClose={() => setViewingSga(null)}
        />
      )}
    </div>
  );
}
