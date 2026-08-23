/**
 * shared/src/client/format.ts — 全アプリ共通フォーマット関数
 *
 * v2.4.0 で client/src/lib/format.ts から shared に移管。
 * 全 6 クライアントで `import { formatCurrency } from '@gmo-onair/shared/src/client/format'`
 * で利用可能。
 */

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return "¥0";
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (isNaN(num)) return "¥0";
  return `¥${num.toLocaleString("ja-JP")}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "-";
  return `${m[1]}/${m[2]}/${m[3]}`;
}

// "YYYY年MM月" — for recognition_date month-only display
export function formatMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const m = dateStr.match(/^(\d{4})-(\d{2})/);
  if (!m) return "-";
  return `${m[1]}年${m[2]}月`;
}

// "YY/MM/DD" — compact date for project name suffixes
export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[1].slice(2)}/${m[2]}/${m[3]}`;
}

// Timezone-safe "YYYY-MM-DD" from a local Date object
export function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * 「最後の動き」を相対で書く (v4 モック「案件一覧」の最終列)。
 *
 * ── なぜ絶対時刻ではなく相対にするか ────────────────────────
 *
 * この列を見る目的は「**放っておかれていないか**」で、
 * 「2026/07/24 15:12」からその判断をするには今日の日付を引き算する必要があります。
 * 「12日前」なら一目で分かります。**日時そのものが要る場面 (監査・入金消込) では
 * 使わないこと** — そこは絶対時刻を出します。
 *
 * ── 段の決め方 ──────────────────────────────────────────────
 *
 *   1分未満     「たった今」  … 秒を出しても読み手には使えない
 *   1時間未満   「N分前」
 *   24時間未満  「N時間前」
 *   7日未満     「N日前」
 *   それ以上    「YYYY/MM/DD」… 「43日前」は数え直さないと日付にならない
 *
 * 未来 (期日など) は扱いません。渡されたら「たった今」に丸めます
 * (時計のずれで数秒先になることがあり、「-1分前」と出すよりましなため)。
 *
 * @param now 「今」。テストのために差し替えられるようにしてある
 */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (value === null || value === undefined || value === '') return '';
  const t = value instanceof Date ? value : new Date(value);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return '';

  const diffSec = Math.floor((now.getTime() - ms) / 1000);
  if (diffSec < 60) return 'たった今';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}日前`;

  const y = t.getFullYear();
  const mo = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}/${mo}/${d}`;
}
