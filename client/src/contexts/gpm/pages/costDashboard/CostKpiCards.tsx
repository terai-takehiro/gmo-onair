/**
 * コスト側ダッシュボードの KPI 3枚（予算合計・実績合計・残合計）
 * — 2026年10月の事業再編・P3（`docs/reorg-2026-10-plan.md` §4.7）
 *
 * **合計は `GET /gpm/cost-dashboard` が返す `projects` 配列を画面で足すだけ**
 * （別の「合計 API」は無い）。案件別内訳（`ProjectBreakdownPanel.tsx`）と
 * 完全に同じ配列を数えるので、内訳の合計とここの数字が食い違うことはない。
 *
 * 部品は財務ダッシュボードと同じ `KpiCard`（`shared/src/client/dashboard`）を
 * 流用する（新しく作らない）。角丸だけ `rounded-card` に重ねて、下に続く
 * `Panel`（`rounded-card`）と揃える。
 */
import { PiggyBank, ShoppingCart, Wallet } from 'lucide-react';
import { KpiCard } from '@gmo-onair/shared/src/client/dashboard/KpiCard';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import type { CostCenterProjectSummary } from '../../queries';

export function CostKpiCards({ projects }: { projects: CostCenterProjectSummary[] }) {
  const budget = projects.reduce((sum, p) => sum + p.budget, 0);
  const actual = projects.reduce((sum, p) => sum + p.actual, 0);
  const remaining = projects.reduce((sum, p) => sum + p.remaining, 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiCard
        className="rounded-card"
        label="予算合計"
        icon={<Wallet />}
        value={<Money value={budget} inline />}
        footnote="受理済みの見積合計（個別見積を予算案として流用）"
      />
      <KpiCard
        className="rounded-card"
        label="実績合計"
        icon={<ShoppingCart />}
        value={<Money value={actual} inline />}
        footnote="確定した仕入の合計"
      />
      <KpiCard
        className="rounded-card"
        label="残合計"
        icon={<PiggyBank />}
        emphasis={remaining < 0 ? 'negative' : 'default'}
        value={<Money value={remaining} inline negativeIsDanger />}
        footnote="予算 − 実績（マイナスは予算超過）"
      />
    </div>
  );
}
