/**
 * GMO ONAiR v2.0 — Dashboard chart palette
 * デジタル庁ダッシュボードガイドブック「違いに気づける」原則に沿って、
 * 強調色(brand/status)は少数に絞り、残りはニュートラルスケールを利用する。
 *
 * 使い分け:
 *   - `brand`       : 主要指標・選択中の系列 (GMO Blue)
 *   - `positive`    : 増加・達成・正常 (success = green)
 *   - `negative`    : 減少・未達・危険 (destructive = red)
 *   - `warning`     : 注意・遅延 (amber/yellow)
 *   - `info`        : 参考値・二次指標 (light blue/cyan)
 *   - `neutral`     : その他・比較対象 (sumi gray)
 *   - `categorical` : 5系列以上のカテゴリカル表示 (DADS プリミティブ由来)
 */

export const chartColors = {
  /* Primary accents — use sparingly */
  brand:    "#005bac",        /* GMO Blue */
  positive: "#197a4b",        /* DADS green-800 */
  negative: "#c7243a",        /* DADS red-800 */
  warning:  "#d2a400",        /* DADS yellow-600 */
  info:     "#0877d7",        /* DADS light-blue-700 */

  /* Neutral scale — sumi (DADS) for comparison/secondary values */
  neutral:  "#5d6470",        /* muted foreground (WCAG 5.5:1 on white) */
  neutralLight: "#b1b5bc",
  gridline: "#e3e5e8",        /* chart grid */
  axis:     "#6b7280",        /* chart axis labels */

  /* Categorical — up to 8 distinct colors for series breakdowns */
  categorical: [
    "#005bac",                 /* brand */
    "#0877d7",                 /* light-blue-700 */
    "#008299",                 /* cyan-800 */
    "#197a4b",                 /* green-800 */
    "#d2a400",                 /* yellow-600 */
    "#c7243a",                 /* red-800 */
    "#6f42c1",                 /* purple */
    "#5d6470",                 /* neutral */
  ],
} as const;

/** Chart background & grid defaults — call as spread into Recharts components */
export const chartDefaults = {
  grid:       { stroke: chartColors.gridline, strokeDasharray: "3 3" },
  axis:       { tick: { fontSize: 12, fill: chartColors.axis } },
  cartesian:  { strokeDasharray: "3 3", stroke: chartColors.gridline },
} as const;
