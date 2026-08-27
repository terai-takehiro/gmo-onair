/**
 * 予約・予定の start_time/end_time は TEXT 列（`YYYY-MM-DD` か `YYYY-MM-DDTHH:MM` の
 * ISO 文字列）で、比較はすべて文字列比較（`shared/CLAUDE.md` の決めごと）。
 *
 * ── なぜここに切り出すか ────────────────────────────────────
 *
 * スタジオ予約・自分の予定・パートナーの予定の3系統とも「終わりが始まりより前」の
 * 検証が無く、UI 側のバグ（ドラッグの取り違え・日付欄の手直し漏れ等）が
 * そのまま保存されて残っていた。文字列比較なので実装は1行だが、
 * **3系統がそれぞれ書くとどれか1つ書き忘れる**ので1関数にする。
 */

/** `end` が `start` より前（＝壊れている）か。空文字列・undefined は判定しない（別の必須チェックに任せる） */
export function isReversedTimeRange(start: unknown, end: unknown): boolean {
  if (typeof start !== 'string' || typeof end !== 'string') return false;
  if (!start || !end) return false;
  return end < start;
}
