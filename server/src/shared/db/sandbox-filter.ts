/**
 * お試し（練習）を数から外す条件 — デザイン 25章
 *
 * ── なぜ文字列を1か所に置くか ────────────────────────────
 *
 * 数える口は40か所ある。同じ条件を40回手で書くと、**1か所の書き間違いが
 * 「練習の金額が黙って数字に入る」**という形で出る。文字列を1つにしておけば、
 * 直すときも1か所で済む。
 *
 * ── 2つの形がある ──────────────────────────────────────
 *
 * 1. `projects` を `p` で結合している問い合わせ → `NOT_SANDBOX('p')`
 * 2. 売上・仕入だけを見ていて `projects` を結合していない問い合わせ
 *    → `NOT_SANDBOX_VIA('r')`（案件をたどって外す）
 *
 * **2 の形で案件が入っていない行 (販管費や案件なしの仕入) は落とさない**。
 * `NOT EXISTS` は project_id が NULL のとき真になるので、そのまま残る。
 * ここを `EXISTS ... AND NOT is_sandbox` と書くと、**案件の付いていない行が
 * 全部消えて販管費が0になる**。
 */

/** `projects` を結合している問い合わせ用。既定の別名は `p` */
export const NOT_SANDBOX = (alias = 'p') => `${alias}.is_sandbox = FALSE`;

/**
 * 売上・仕入の側から案件をたどって外す用。
 * 案件の付いていない行は残す (NOT EXISTS が真になる)。
 */
export const NOT_SANDBOX_VIA = (alias: string, col = 'project_id') =>
  `NOT EXISTS (SELECT 1 FROM projects sbx WHERE sbx.id = ${alias}.${col} AND sbx.is_sandbox)`;

/**
 * 按分 (allocations) を通す形。売上/仕入の行そのものは本物でも、
 * 配分先の案件がお試しなら、その配分は数えない。
 */
export const NOT_SANDBOX_ALLOC = (alias: string) =>
  `NOT EXISTS (SELECT 1 FROM projects sbx WHERE sbx.id = ${alias}.project_id AND sbx.is_sandbox)`;
