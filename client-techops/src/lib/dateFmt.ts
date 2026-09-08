// 制作技術支援トップ（/techops/top）の日付まわりの小さな共通処理。
// `pages/rental/rentalFormat.ts` と役割が近いが、レンタル機材検索専用ファイルへ
// 無関係な機能を足したくないためこちらに分ける（`todayStr`/`formatDateJp` の実装は同じ）。
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function todayStr(): string {
  // toISOString() は UTC なので JST の 0〜9 時に前日へずれる。ローカル日付で組む
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' の1日後（文字列のまま純粋に計算する） */
export function nextDayStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → '9/11（金）' */
export function formatDateJp(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS_JA[d.getDay()]}）`;
}

/** 「きょう」「あす」「◯（曜日）」— 直近の本番・収録カードの見出し */
export function relativeDayLabel(dateStr: string, today: string = todayStr()): string {
  const diff = daysBetween(today, dateStr);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return WEEKDAYS_JA[d.getDay()];
}

/**
 * 本番日までの残り（トップの一覧の行に添える）。`今日` / `明日` / `あと3日` /
 * 3週間より先は空文字（日付そのものを出しているので、遠い先の日数は読まれない）。
 * 過ぎた日は空文字（「終了」などの言葉は呼ぶ側が決める）。
 */
export function countdownLabel(dateStr: string, today: string = todayStr()): string {
  const diff = daysBetween(today, dateStr);
  if (diff < 0) return "";
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  return diff <= 21 ? `あと${diff}日` : "";
}

/** 'YYYY-MM-DD' → { month: '8月', day: '23' } */
export function monthDay(dateStr: string): { month: string; day: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { month: "", day: "" };
  return { month: `${d.getMonth() + 1}月`, day: String(d.getDate()) };
}

/** from → to の日数（負なら to が過去）。'YYYY-MM-DD' 同士の純粋な差 */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
