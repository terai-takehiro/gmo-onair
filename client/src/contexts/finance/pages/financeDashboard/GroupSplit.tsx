/**
 * グループ内／グループ外の売上・仕入（① 財務ダッシュボード） (2026-09 依頼)
 *
 * 「絞り込みをしている状態でも、グループ内案件とグループ外案件の売上・仕入が
 * 分かるようにしてほしい」というご要望に応えて追加したカード。損益の流れ
 * （`ProfitFlow`）・内訳（`Breakdown`）と同じ絞り込み（期間・会社・案件・
 * 総額／確度加味）にそのまま従う——`monthly-summary` の返り値をそのまま出すだけで、
 * 画面側では計算し直さない（`BudgetDashboardPage.tsx` 冒頭コメント「合計は
 * サーバーが出す」と同じ理由）。
 *
 * ⚠️ **固定原価は対象外。** 仕入の内訳合計（グループ内＋グループ外）は
 * `purchase_total` ではなく `variable_cost_total` までしか足し上がらない
 * （固定原価Pjは特定のお客様に紐づかないため）。注記で明示する。
 *
 * ⚠️ **案件で絞り込み中は、選んだ案件の `customer_type` によって
 * 片方が必ず¥0になる。** 1案件はグループ内/外のどちらか一方にしか属さないため
 * （サーバー側コメント参照）。これは壊れているのではなく仕様どおり。
 */
import { Money } from '@gmo-onair/shared/src/client/ui/money';

export function GroupSplit({
  revenueInternal, revenueExternal, purchaseInternal, purchaseExternal,
}: {
  revenueInternal: number;
  revenueExternal: number;
  purchaseInternal: number;
  purchaseExternal: number;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-3 lg:p-4">
      <h3 className="text-cardtitle mb-2">グループ内／グループ外</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-control border border-border-subtle p-3">
          <p className="text-sub font-bold text-foreground">グループ内案件</p>
          <dl className="mt-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sub text-muted-foreground">売上</dt>
              <dd><Money value={revenueInternal} className="text-list font-bold" /></dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sub text-muted-foreground">仕入</dt>
              <dd><Money value={purchaseInternal} className="text-list font-bold" /></dd>
            </div>
          </dl>
        </div>
        <div className="rounded-control border border-border-subtle p-3">
          <p className="text-sub font-bold text-foreground">グループ外案件</p>
          <dl className="mt-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sub text-muted-foreground">売上</dt>
              <dd><Money value={revenueExternal} className="text-list font-bold" /></dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sub text-muted-foreground">仕入</dt>
              <dd><Money value={purchaseExternal} className="text-list font-bold" /></dd>
            </div>
          </dl>
        </div>
      </div>
      <p className="text-note mt-2 text-muted-foreground">
        仕入は変動原価まで（固定原価は特定のお客様に紐づかないため対象外）。
      </p>
    </section>
  );
}
