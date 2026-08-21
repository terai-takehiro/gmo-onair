// 制作資料 (Qシート) — 共通時刻ユーティリティ (サーバー側コピー)
// ⚠️ shared/src/schedule/time.ts と構造を必ず一致させること。
// サーバーは server/src/ 外を import できないため意図的に複製している
// (scripts/check-collab-parity.mjs が乖離を検査する)。

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

// ============================================================
// docTotalSec — 台本 (sections) 全体の合計尺
// ============================================================
//
// 実装には向きが逆の2種類のフォールバックが既にある (どちらも既存挙動):
//   - 編集画面: ロール尺 (section.duration) が勝ち、無ければ行の合計
//   - 進行/ランダウン: 行の合計が勝ち、0 のときだけロール尺にフォールバック
// どちらの画面の表示結果も変えないため、呼び出し側が優先順位を選べるようにする。
export interface DocTotalSecRow {
  duration?: string | number | null;
}

export interface DocTotalSecSection {
  duration?: string | number | null;
  // _pageBreak のロールは rows を持たないため、必ず ?? [] で守る
  rows?: DocTotalSecRow[];
}

export interface DocTotalSecOptions {
  /** true: ロール尺 (section.duration) を優先し、無ければ行の合計へ。false: 行の合計を優先し、0 のときだけロール尺へ。 */
  preferRoleDuration: boolean;
}

export function docTotalSec(
  sections: DocTotalSecSection[] | null | undefined,
  opts: DocTotalSecOptions,
): number {
  if (!Array.isArray(sections)) return 0;
  let total = 0;
  for (const sec of sections) {
    if (!sec) continue;
    const rows = Array.isArray(sec.rows) ? sec.rows : [];
    const rowSum = rows.reduce((a, r) => a + parseDur(r?.duration), 0);
    const roleDur = parseDur(sec.duration);
    total += opts.preferRoleDuration ? roleDur || rowSum : rowSum || roleDur;
  }
  return total;
}
