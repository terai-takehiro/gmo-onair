/**
 * ガント・工程表（SVG／今日線バッジ）専用の色定数
 *
 * SVG の `fill`/`stroke` と、今日線バッジの実色合わせ（`GpmTimelineView.tsx`）は
 * Tailwind のクラス名や `rgb(var(--x))` を直接書けない（または書いても
 * ブラウザ間で解決が安定しない）。だから**この1か所にまとめて色コードを持つ**
 * ——`GpmGanttView` / `GpmGanttBar` / `GpmGanttExtras` / `GpmTimelineView` の
 * どれかだけ色が古いままになるのを防ぐ。
 *
 * 値は `shared/src/client/tokens-v4.css`（現在の上書き層）の同名トークンと
 * 揃えてある。**トークンの値を変えたらここも合わせて直すこと。**
 */
export const GANTT_COLORS = {
  /** 今日線・期限超過。`--destructive`（#c7243a）と同じ */
  destructive: '#c7243a',
  /** マイルストーン（◆）。`--warning`（#c2410e）と同じ */
  warning: '#c2410e',
  /** 依存の矢印・後続の補助線。`--muted-foreground`（#5d6470）と同じ */
  mutedForeground: '#5d6470',
} as const;
