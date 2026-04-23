// 共通時刻ユーティリティ
// parseDur: 尺文字列（mm:ss, HH:MM:SS, 整数秒）を秒数に
// fmtAbs:  開始時刻などの絶対時刻を HH:MM:SS で
// fmtMinSec / hms: 再生時間表示用

const safe = (n: number): number => (isNaN(n) || !isFinite(n) ? 0 : Math.floor(n));

export function parseDur(v: string | number | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).trim();
  if (!s) return 0;
  // HH:MM:SS (:, °, ', " のいずれも許容)
  let m = s.match(/^(\d+)[°:](\d+)[':"](\d+)/);
  if (m) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  // MM:SS  (:, ', ., " のいずれも許容)
  m = s.match(/^(\d+)[':."](\d+)/);
  if (m) return (+m[1] || 0) * 60 + (+m[2] || 0);
  // 整数秒（互換維持）
  m = s.match(/^(\d+)$/);
  if (m) return +m[1] || 0;
  return 0;
}

// 入力値を mm:ss 形式に正規化（整数秒や空文字も吸収）
export function normalizeDur(v: string | number | undefined | null): string {
  const sec = parseDur(v);
  if (sec === 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// HH:MM:SS 絶対時刻表示
export function fmtAbs(sec: number): string {
  const v = safe(sec);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = v % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 0分05秒 のような表示
export function fmtMinSec(sec: number): string {
  const v = safe(sec);
  const m = Math.floor(v / 60);
  const s = v % 60;
  return `${m}分${String(s).padStart(2, "0")}秒`;
}

// MM:SS 表示
export function fmtMmSs(sec: number): string {
  const v = safe(sec);
  const a = Math.abs(v);
  const m = Math.floor(a / 60);
  return `${v < 0 ? "-" : ""}${String(m).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
