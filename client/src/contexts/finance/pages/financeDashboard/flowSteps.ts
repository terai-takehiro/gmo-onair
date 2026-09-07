/**
 * 損益の流れ（`ProfitFlow`）に渡す段の組み立て — `BudgetDashboardPage` から分離
 * （400行の上限を守るため。ロジックは移しただけで中身は変えていない）。
 *
 * **案件で絞り込み中は3枚だけ。** 販管費は案件に紐づかない（＝どの案件で絞っても
 * 同じ全社の販管費が出るだけで、その案件の損益とは無関係）ので、絞り込み中は
 * 「売上 − 仕入（変動原価） = 限界利益」までしか出さない。固定原価・売上総利益・
 * 営業利益も同じ理由でここでは意味を持たないため出さない（ご要望）。
 */
import type { MonthlySummary } from './useDashboardData';
import type { FlowStep } from './ProfitFlow';

export function buildFlowSteps(params: {
  projectId: string;
  s: MonthlySummary;
  ledgerQuery: string;
  revenueTotalCount: number;
  purchaseTotalCount: number;
  fixedTotalCount: number;
  sgaTotalCount: number;
}): FlowStep[] {
  const { projectId, s, ledgerQuery, revenueTotalCount, purchaseTotalCount, fixedTotalCount, sgaTotalCount } = params;
  const pct = (n: number) => (s.revenue_total > 0 ? (n / s.revenue_total) * 100 : null);

  return projectId
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
}
