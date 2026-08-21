/**
 * お客様の詳細（顧客360）— 「年次売上（確定）」節 (v4)
 *
 * 棒グラフそのものは元実装のまま（横棒・比率で幅を決める）。
 * 色をトークンに寄せ、金額を `<Money>` に置き換えただけ。
 */
import { TrendingUp } from 'lucide-react';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';

export function YearlySection({ items }: { items: Array<{ year: string; total: number }> }) {
  if (items.length === 0) return null;
  const maxYear = Math.max(1, ...items.map((y) => Number(y.total)));

  return (
    <section className="rounded-card border border-border bg-card">
      <h2 className="text-cardtitle flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
        年次売上（確定）
      </h2>
      <div className="flex flex-col gap-2 p-4">
        {items.map((y) => (
          <div key={y.year} className="flex items-center gap-3">
            <span className="font-number w-12 shrink-0 text-sub-sm text-muted-foreground">{y.year}年</span>
            <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded bg-primary/70"
                style={{ width: `${Math.max(2, (Number(y.total) / maxYear) * 100)}%` }}
              />
            </div>
            <MoneyCell value={y.total} width={128} className="text-sub" />
          </div>
        ))}
      </div>
    </section>
  );
}
