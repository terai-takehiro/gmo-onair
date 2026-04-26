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

export function formatPercent(value: number | string | null | undefined): string {
  if (value == null) return "0.0%";
  const num = typeof value === "string" ? Number(value) : value;
  if (isNaN(num)) return "0.0%";
  return `${num.toFixed(1)}%`;
}
