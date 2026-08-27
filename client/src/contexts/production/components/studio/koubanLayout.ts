/**
 * 香盤（`KoubanView.tsx`）— 置き方の計算（画面を持たない部分）
 *
 * `calendarLayout.ts`（① 予定・週表）と同じ理由で切り出す。
 * 香盤は「部屋を縦に並べ、時間で横に置く」だけの単純な表に見えて、
 * 日またぎ・重なりを間違えると**予約が違う時間に見える／隠れて押せなくなる**。
 * 素の関数にしておけば、画面を見ずに間違いに気づける。
 */

export const SLOT_START = 0; // 00:00
export const SLOT_END = 24; // 24:00
export const SLOT_HEIGHT = 48; // px per 30min slot
export const SLOTS_PER_HOUR = 2;
export const TOTAL_SLOTS = (SLOT_END - SLOT_START) * SLOTS_PER_HOUR;

export function formatTime(hour: number, min: number): string {
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function extractDatePart(timeStr: string): string {
  // Handle both "2026-03-29" and "2026-03-29T10:00:00" formats
  return timeStr.split("T")[0];
}

/**
 * 表示している日 (`dateStr`) から見た分。**日をまたぐ予約を正しく置く。**
 *
 * 旧実装は時刻部分しか見ておらず、3/28 23:00〜3/29 02:00 の予約を 3/29 で開くと
 * 「23:00 の予約」として翌日側に誤描画されていた（本来は 0:00〜2:00）。
 * `calendarLayout.ts` の `minutesOnDay` と同じ考え方: 表示日より前に始まっていれば
 * 0 分、表示日より後まで続くなら 24:00 として扱う。
 */
export function minutesOnDate(iso: string, dateStr: string, fallback: number): number {
  const d = extractDatePart(iso);
  if (d < dateStr) return 0;
  if (d > dateStr) return 24 * 60;
  const timePart = iso.includes("T") ? iso.split("T")[1] : null;
  if (!timePart) return fallback;
  const [hh, mm] = timePart.split(":").map(Number);
  if (!Number.isFinite(hh)) return fallback;
  return hh * 60 + (Number.isFinite(mm) ? mm : 0);
}

/**
 * 分 → 30分刻みのスロット。**開始は切り捨て・終了は切り上げ**にすること
 * （四捨五入だと 10:15 開始が 10:30 の位置に描かれ、最大15分ずれる — 実際に踏んだ）。
 */
export function minutesToSlot(min: number, roundUp: boolean): number {
  const slot = roundUp ? Math.ceil(min / 30) : Math.floor(min / 30);
  return Math.max(0, Math.min(TOTAL_SLOTS, slot));
}

/**
 * 同室・同時間帯に重なる予約を横に列分けする（`calendarLayout.ts` の `placeDay` と
 * 同じ考え方）。**列分けが無いと後で描いた予約が前を完全に覆い、押せなくなる**
 * （実際に踏んだ — 同室同時刻の2件目が見えず開けなかった）。
 */
export function assignColumns<T extends { startSlot: number; endSlot: number }>(
  items: T[],
): Array<T & { col: number; cols: number }> {
  const spans = [...items].sort((a, b) => a.startSlot - b.startSlot || a.endSlot - b.endSlot);
  const out: Array<T & { col: number; cols: number }> = [];
  let group: typeof spans = [];
  let groupEnd = -1;
  const flush = () => {
    if (group.length === 0) return;
    const colEnd: number[] = [];
    const colOf = new Map<(typeof group)[number], number>();
    for (const s of group) {
      let c = colEnd.findIndex((e) => e <= s.startSlot);
      if (c === -1) { c = colEnd.length; colEnd.push(0); }
      colEnd[c] = s.endSlot;
      colOf.set(s, c);
    }
    const cols = colEnd.length;
    for (const s of group) out.push({ ...s, col: colOf.get(s) ?? 0, cols });
    group = [];
    groupEnd = -1;
  };
  for (const s of spans) {
    if (group.length > 0 && s.startSlot >= groupEnd) flush();
    group.push(s);
    groupEnd = Math.max(groupEnd, s.endSlot);
  }
  flush();
  return out;
}

export type LocationTab = "yoga" | "shibuya" | "aoyama" | "other";

export function getLocationTab(locationName: string): LocationTab {
  // 判定順が重要: 新名称「GMOサムライスタジオ用賀/青山」も「サムライ」を含むため、
  // 地名 (用賀/青山) を「サムライ」→渋谷 のフォールバックより先に判定する
  if (locationName.includes("用賀") || locationName.includes("グローバル")) return "yoga";
  if (locationName.includes("青山")) return "aoyama";
  if (locationName.includes("渋谷") || locationName.includes("サムライ")) return "shibuya";
  return "other";
}

export const bookingTypeColors: Record<string, string> = {
  project: "#3b82f6",
  maintenance: "#ef4444",
  tour: "#8b5cf6",
  internal: "#f59e0b",
  other: "#6b7280",
};
