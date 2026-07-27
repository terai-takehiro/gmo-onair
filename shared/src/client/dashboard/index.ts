/**
 * GMO ONAiR v2.0 — Shared dashboard pattern library
 *
 * デジタル庁「ダッシュボードデザインの実践ガイドブック」の4原則
 *   1. 目的に則する (Align with Purpose)
 *   2. 違いに気づける (Notice Differences)
 *   3. 分解できる (Decomposable)
 *   4. 鮮度が高い (Fresh Data)
 * に準拠した共通パターンを提供する。全アプリのダッシュボードはこれを使う。
 */
export * from "./DashboardHeader";
export * from "./KpiCard";
export * from "./SectionCard";
// EmptyState は states/ に一本化した (v2.9.291)。
// ここには「データがありません」を既定タイトルにする互換ラッパーがあったが、
// **その言い方は §2.4 で禁じている**（何が無いのかと次の一手を書く）ので消した。
// 全 24 ファイルが実際には title を渡していたため、消しても表示は変わらない。
export * from "./chart-colors";
