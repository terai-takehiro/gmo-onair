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
 * ── 期間と絞り込みの計算は旧実装のまま ──────────────────────
 *
 * 月／四半期／年／期間指定の期間の作り方と、5本のクエリは**1行も変えていません**。
 * 変えたのは並べ方だけです（金額の集計を作り直しと同じ回で触らない）。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatMonth } from '@/lib/format';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { PeriodBar, type PeriodMode, type ProjectOption } from './financeDashboard/PeriodBar';
import { ProfitFlow, type FlowStep } from './financeDashboard/ProfitFlow';
import { BreakdownColumn, type BreakdownItem } from './financeDashboard/Breakdown';

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

  const { data: projectsData } = useQuery({
    queryKey: ['projects-for-budget-dashboard'],
    queryFn: async () => (await api.get('/projects?limit=500')).data,
    staleTime: 120_000,
  });
  const projects: ProjectOption[] = projectsData?.data ?? [];

  // 期間が複数月にまたがると明細が増えるため上限を引き上げる（旧実装のまま）
  const limit = mode === 'month' ? '300' : '2000';

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

  const revenues = useQuery({
    queryKey: ['budget-breakdown-revenues', period.from, period.to, projectId],
    queryFn: async () => {
      // 合計 (monthly-summary) は確定売上だけを数えているので内訳も confirmed に揃える
      const params: Record<string, string> = {
        recognition_from: period.from, recognition_to: period.to, limit, status: 'confirmed',
      };
      if (projectId) params.project_id = projectId;
      return (await api.get('/revenues', { params })).data;
    },
    enabled: !!period.from,
  });

  // 仕入(変動原価): 固定原価Pjを除く。固定原価は gls_number=NULL で既定ソートの末尾に来るため、
  // 同じクエリだと limit 内に入らず消える（旧実装のコメントのまま）
  const purchases = useQuery({
    queryKey: ['budget-breakdown-purchases', period.from, period.to, projectId],
    queryFn: async () => {
      const params: Record<string, string> = {
        recognition_from: period.from, recognition_to: period.to, limit, fixed_cost: '0',
      };
      if (projectId) params.project_id = projectId;
      return (await api.get('/purchases', { params })).data;
    },
    enabled: !!period.from,
  });

  const fixed = useQuery({
    queryKey: ['budget-breakdown-fixed', period.from, period.to, projectId],
    queryFn: async () => {
      const params: Record<string, string> = {
        recognition_from: period.from, recognition_to: period.to, limit: '2000', fixed_cost: '1',
      };
      if (projectId) params.project_id = projectId;
      return (await api.get('/purchases', { params })).data;
    },
    enabled: !!period.from,
  });

  // 販管費は案件に紐づかないので、案件で絞っているときは取りに行かない
  const sga = useQuery({
    queryKey: ['budget-breakdown-sga', period.from, period.to],
    queryFn: async () => (await api.get('/sga', {
      params: { recognition_from: period.from, recognition_to: period.to, limit },
    })).data,
    enabled: !!period.from && !projectId,
  });

  const pct = (n: number) => (s.revenue_total > 0 ? (n / s.revenue_total) * 100 : null);

  const steps: FlowStep[] = [
    { label: '売上', value: s.revenue_total, sub: `確定売上 ${revenues.data?.data?.length ?? 0}件`, to: '/budget/revenues' },
    { label: '仕入（変動原価）', value: s.variable_cost_total, sub: `案件に紐づく ${purchases.data?.data?.length ?? 0}件`, to: '/budget/purchases' },
    { label: '限界利益（粗利）', value: s.marginal_profit, result: true, pct: pct(s.marginal_profit) },
    { label: '固定原価', value: s.fixed_cost_total, sub: `償却負担額など ${fixed.data?.data?.length ?? 0}件`, to: '/budget/purchases' },
    { label: '売上総利益', value: s.gross_profit, result: true, pct: pct(s.gross_profit) },
    {
      label: '販管費',
      value: s.sga_total,
      sub: projectId ? '案件で絞り込み中は対象外' : `案件に紐づかない ${sga.data?.data?.length ?? 0}件`,
      to: projectId ? undefined : '/budget/sga',
    },
    { label: '営業利益', value: s.operating_profit, result: true, pct: pct(s.operating_profit) },
  ];

  const revItems: BreakdownItem[] = (revenues.data?.data ?? []).map(
    (r: { id: string; gls_number?: string | null; episode_code?: string | null; project_name?: string | null; customer_name?: string | null; amount: number }) => ({
      id: r.id,
      code: r.episode_code || r.gls_number,
      title: r.project_name || '（案件名なし）',
      sub: r.customer_name,
      amount: Number(r.amount) || 0,
    }),
  );

  const purItems: BreakdownItem[] = [
    ...((purchases.data?.data ?? []) as PurchaseRow[]),
    ...((fixed.data?.data ?? []) as PurchaseRow[]),
  ].map((p) => ({
    id: p.id,
    code: p.episode_code || p.gls_number,
    title: p.description || p.project_name || '（説明なし）',
    sub: [p.vendor_name, p.project_name].filter(Boolean).join(' ／ ') || null,
    amount: Number(p.amount) || 0,
    tag: p.is_provisional ? '仮' : null,
  }));

  const sgaItems: BreakdownItem[] = (sga.data?.data ?? []).map(
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
          <ProfitFlow steps={steps} />

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            <BreakdownColumn
              title="売上の内訳"
              total={s.revenue_total}
              items={revItems}
              to="/budget/revenues"
              empty="この期間の確定売上はありません。"
            />
            <BreakdownColumn
              title="仕入の内訳"
              total={s.purchase_total}
              items={purItems}
              to="/budget/purchases"
              empty="この期間の仕入はありません。"
            />
            <BreakdownColumn
              title="販管費の内訳"
              total={s.sga_total}
              items={sgaItems}
              to="/budget/sga"
              empty={projectId ? '案件で絞り込み中は集計から外れます（案件に紐づかないため）。' : 'この期間の販管費はありません。'}
            />
          </div>

          <p className="text-note text-muted-foreground">
            内訳は<strong className="font-bold">金額の大きい順に上位だけ</strong>を出しています。
            合計はサーバーが期間全体で数えたもので、内訳の足し算とは一致しません（全部を見るには台帳をひらいてください）。
          </p>
        </>
      )}
    </div>
  );
}
