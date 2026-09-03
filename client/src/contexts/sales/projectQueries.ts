/**
 * 案件（`projects`）を書き換えたときに落とす react-query の鍵（唯一のもと）
 *
 * ── なぜ1か所に集めるか ──────────────────────────────────────
 *
 * 同じ1件の案件を、画面ごとに**別々の鍵**で持っています
 * （案件台帳 `project-ledger` / 仕入の候補 `won-projects-for-purchase` /
 *  スタジオ予約 `project-single` / 見積の回 `episodes` …）。
 * 保存のたびに呼び出し側が鍵を並べる形だと、鍵が1本増えるたびにどこかが
 * 落とし忘れになり、**「保存したのに古いまま・リロードすると出る」**という
 * 同じ不具合が場所を変えて何度も出ます（v4.5.19 の時点で保存経路は
 * `dashboard.sales-overview`・`projects-dropdown`・`won-projects-for-*`・
 * `episodes` を落としていませんでした）。
 *
 * **案件を書き換えたら、鍵を並べずにこの関数を呼ぶこと。**
 *
 * ⚠️ react-query の鍵は**配列の要素どうしの一致**で前方一致します。
 * 文字列の前方一致ではないので、`['projects']` を落としても
 * `['projects-search']` には当たりません（だから下の一覧が長い）。
 */
import type { QueryClient } from '@tanstack/react-query';

/**
 * 案件の一覧・候補・集計を持つ鍵。**先頭の1要素だけ**書く
 * （`['projects', filters]` のような続きは前方一致で当たる）。
 */
const PROJECT_LIST_KEYS = [
  'projects',                          // 案件一覧・じょうご
  'project-ledger',                    // 案件台帳
  'project-integrity',                 // 台帳いちばん上の整合性チェック
  'dashboard',                         // 受付カード・売上サマリ（`alerts` / `sales-overview` の両方）
  'projects-search',                   // 売上ダイアログの案件検索
  'projects-dropdown',                 // やり取りダイアログの案件選択
  'projects-with-activity',            // 活動のある案件
  'projects-booking-search',           // スタジオ予約の案件検索
  'gls-projects',                      // 「いまある案件に足す」の候補
  'gls-projects-for-groups',           // 請求グループの候補
  'won-projects-for-purchase',         // PDF 取込の案件候補
  'won-projects-for-handoff',          // 制作への引き継ぎ
  'won-projects-for-budget-dashboard', // 予算ダッシュボード
  'registerable-projects-for-purchase', // 仕入ダイアログの案件候補（失注以外・2026-09）
] as const;

/**
 * 案件1件ごとに持つ鍵（`['<鍵>', id]`）。`['projects']` の前方一致には当たらない。
 * `episodes` を入れているのは、継続区分を単発↔レギュラーに変えると
 * 「回」タブの中身が変わるため（落とさないとリロードまで出ない）。
 */
const PROJECT_DETAIL_KEYS = ['project', 'project-single', 'project-summary', 'episodes'] as const;

/**
 * 案件の保存・GLS 発番・分類切替・削除のあとに呼ぶ。
 *
 * @param projectId 書き換えた案件の id。新規作成でサーバーが採番した id でもよい。
 *   渡さないと一覧側だけを落とす（1件ごとの鍵は id が無いと当てられない）。
 */
export function invalidateProjectQueries(qc: QueryClient, projectId?: string | null) {
  for (const key of PROJECT_LIST_KEYS) qc.invalidateQueries({ queryKey: [key] });
  if (!projectId) return;
  for (const key of PROJECT_DETAIL_KEYS) qc.invalidateQueries({ queryKey: [key, projectId] });
}
