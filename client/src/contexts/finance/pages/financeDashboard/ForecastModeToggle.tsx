/**
 * 集計方法（全部を100%で / 確度をかけて）切り替え — ① 財務ダッシュボード（2026-09 依頼）
 *
 * ── 画面全体の見方を切り替えるトグル ────────────────────────────
 *
 * もとは「営業見通し（パイプライン）」カードだけに効くトグルだったが、
 * 「絞り込んでいる状態なども含め画面全体を対象にしてほしい」
 * 「個別の売上・仕入（案件）にもパーセンテージを掛けてほしい」というご依頼で
 * 対象を拡張し、専用カードは廃止した（`BudgetDashboardPage.tsx` 冒頭コメント参照）。
 * **state は `BudgetDashboardPage` が持ち、このコンポーネントは見た目だけ**。
 *
 * `forecastMode==='weighted'` のとき、損益の流れ・内訳・サマリーの
 * すべてが「案件のいまのフェーズの受注確度（%）を掛けたシミュレーション」
 * になる（実額の記録は変えない・あくまで表示上の見方）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';

export type ForecastMode = 'total' | 'weighted';

export const FORECAST_MODE_LABEL: Record<ForecastMode, string> = {
  total: '全部を100%で',
  weighted: '確度をかけて',
};

export function ForecastModeToggle({
  mode, onChange,
}: {
  mode: ForecastMode;
  onChange: (m: ForecastMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="財務ダッシュボードの見込みの数え方"
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
