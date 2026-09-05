/**
 * 集計方法（総額 / 確度加味）切り替え — ① 財務ダッシュボード（2026-09 依頼）
 *
 * ── なぜ `PipelineForecast` の中から引き上げたか ──────────────────
 *
 * もとはこのトグルは `PipelineForecast`（営業見通しカード）の内部 state に
 * 閉じていて、そのカードの中だけに出ていた。しかし**見た目・置き場所が
 * 「カード内の一設定」に見え、画面全体の見え方を切り替えているように読めない**
 * というご指摘があり、`PeriodBar`（期間・案件の絞り込み）と同じ並びの
 * 共通エリアへ引き上げた。**state は `BudgetDashboardPage` が持ち、
 * このコンポーネントは見た目だけ**（旧 `PipelineForecast.tsx` の
 * ボタン実装をそのまま移設・文言も変えていない）。
 *
 * ⚠️ **集計対象は変えていない。** `forecastMode` を使うのは引き続き
 * `PipelineForecast`（営業見通しカード）だけ——損益フロー・内訳・サマリーは
 * 確定売上のみの実績を表示しており、確度という概念を持たない（スコープ外）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';

export type ForecastMode = 'total' | 'weighted';

export const FORECAST_MODE_LABEL: Record<ForecastMode, string> = { total: '総額', weighted: '確度加味' };

export function ForecastModeToggle({
  mode, onChange,
}: {
  mode: ForecastMode;
  onChange: (m: ForecastMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="集計方法"
      className="rounded-control inline-flex shrink-0 overflow-hidden border border-border"
    >
      {(['total', 'weighted'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            'min-h-tap px-3 text-sub lg:min-h-[36px]',
            mode === m
              ? 'bg-primary font-bold text-primary-foreground'
              : 'text-secondary-foreground hover:bg-muted',
          )}
        >
          {FORECAST_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
