/**
 * Wiki だけで使う表示整形。
 * 日付そのものは `@gmo-onair/shared/src/client/format` を使い、ここには
 * 「第N版」「見直し期限が切れているか」のような Wiki 固有のものだけを置く。
 */
import { localDateStr } from '@gmo-onair/shared/src/client/format';

/** 画面では `rev.14` ではなく **第14版**（docs/design/v4/wiki.md §4-1） */
export function revLabel(rev: number | null | undefined): string {
  if (rev === null || rev === undefined || !Number.isFinite(rev)) return '';
  return `第${rev}版`;
}

/** 一覧の更新日時。同じ年なら `9/18 16:22`、違う年なら `2025/9/18` */
export function updatedLabel(value: string | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return '—';
  const m = t.getMonth() + 1;
  const d = t.getDate();
  if (t.getFullYear() !== now.getFullYear()) return `${t.getFullYear()}/${m}/${d}`;
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${m}/${d} ${hh}:${mm}`;
}

/** 情報欄の「2026/09/18 16:22」 */
export function stampLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return '—';
  const mo = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return `${t.getFullYear()}/${mo}/${d} ${hh}:${mm}`;
}

/**
 * 見直し期限までの残り日数。過ぎていれば負の数を返す。
 * 期限は日付（時刻を持たない）なので、**端末の時刻で日をまたがせない**ように
 * `localDateStr` で日付の文字列にしてから比べる（`toISOString` を使うと UTC に寄る）。
 */
export function daysUntil(reviewBy: string | null | undefined, now = new Date()): number | null {
  if (!reviewBy) return null;
  const m = reviewBy.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const today = localDateStr(now);
  const a = Date.parse(`${today}T00:00:00`);
  const b = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** 期限切れか（当日はまだ切れていない） */
export function isOverdue(reviewBy: string | null | undefined, now = new Date()): boolean {
  const n = daysUntil(reviewBy, now);
  return n !== null && n < 0;
}

/** 情報欄に添える「あと 190日」「3日 超過」 */
export function reviewRemainLabel(reviewBy: string | null | undefined, now = new Date()): string {
  const n = daysUntil(reviewBy, now);
  if (n === null) return '';
  if (n < 0) return `${-n}日 超過`;
  if (n === 0) return '今日まで';
  return `あと ${n}日`;
}

/** 見直し期限の表示（`2027/03/31`）。入っていなければ空 */
export function reviewByLabel(reviewBy: string | null | undefined): string {
  if (!reviewBy) return '';
  const m = reviewBy.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : '';
}
