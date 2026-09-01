/**
 * 役務提供完了日（`purchases.service_completed_date`）の読み書き。
 *
 * ⚠️ **この列だけ `DATE` 型**（migration `060_purchase_service_date.sql`）。
 * 仕入の他の日付（`recognition_date` / `payment_due_date` / `inspection_date`）は
 * すべて `TEXT` で `YYYY-MM-DD` がそのまま返るのに、ここだけ `node-pg` が
 * JS の `Date` に変換するため、API のレスポンスでは
 * `"2026-08-31T00:00:00.000Z"` という別の形で返ってくる。
 *
 * 他の欄と同じ感覚で `<input type="date">` に入れると値が入らない（`YYYY-MM-DD`
 * しか受け付けない）ので、**読むときは必ずここを通す**。
 *
 * ⚠️ **日付の切り出しは UTC で行う。** サーバー（コンテナ）は `TZ` を設定して
 * おらず UTC で動くので、`DATE` は UTC の 0 時として返り、UTC で切り出せば
 * 保存した日付にそのまま一致する。ローカル時刻で切り出すと、閲覧者の端末が
 * JST のとき **1日前**になる。
 */

/** API の値（`YYYY-MM-DD` でも ISO 文字列でも可）を `<input type="date">` 用の `YYYY-MM-DD` にする */
export function toServiceDateInput(value: string | null | undefined): string {
  if (!value) return '';
  // すでに YYYY-MM-DD（TEXT 列と同じ形）ならそのまま
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}
