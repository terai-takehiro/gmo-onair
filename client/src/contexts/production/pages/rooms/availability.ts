/**
 * ② 部屋の空き — 帯の置き方（画面を持たない部分）
 *
 * 「何時から何時までを、横のどこに、どれだけの幅で置くか」は
 * 読み違えると**空いていない枠を空きに見せます**。素で試せる形にしてあります。
 */

/** 表示する時間帯。モックと同じ 8:00〜22:00 */
export const DAY_START_H = 8;
export const DAY_END_H = 22;

export interface AvailRoom {
  id: string;
  name: string;
  abbreviation?: string | null;
  color?: string | null;
  location_name?: string;
}

export interface AvailBooking {
  id: string;
  title: string;
  all_day: number;
  start_time: string;
  end_time: string;
  status?: string;
  rooms?: { room_id: string; room_color?: string | null }[];
}

export interface AvailBlock {
  id: string;
  left: string;
  width: string;
  title: string;
  timeLabel: string;
  color: string | null;
  tentative: boolean;
}

export function isAllDay(b: AvailBooking): boolean {
  return b.all_day === 1;
}

/** `2026-08-02T14:30` → 分。日付をまたぐ計算はここではしない */
function minutesOf(iso: string): number {
  const t = iso.slice(11, 16);
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return DAY_START_H * 60;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function hhmm(iso: string): string {
  return iso.slice(11, 16) || '';
}

/**
 * 1つの部屋ぶんの帯。
 *
 * **表示の外にはみ出す予定を捨てない。** 7:00〜9:00 の予定を「8:00 より前だから無し」に
 * すると、朝から使っている部屋が空きに見えます。**端で切って必ず出します。**
 */
export function laneBlocks(bookings: AvailBooking[], roomId: string): AvailBlock[] {
  const span = (DAY_END_H - DAY_START_H) * 60;
  const out: AvailBlock[] = [];
  for (const b of bookings) {
    if (!b.rooms?.some((r) => r.room_id === roomId)) continue;
    const s = minutesOf(b.start_time) - DAY_START_H * 60;
    const e = minutesOf(b.end_time) - DAY_START_H * 60;
    // 終わりが始まりより前（日をまたぐ）ときは、その日の終わりまでとして出す
    const end = e > s ? e : span;
    const a = Math.max(0, Math.min(span, s));
    const z = Math.max(0, Math.min(span, end));
    if (z <= 0 || a >= span) continue;   // まるごと表示の外
    out.push({
      id: b.id,
      left: `${((a / span) * 100).toFixed(3)}%`,
      // **最低幅を持たせる。** 15分の予定が線になると、空いているのと見分けが付かない
      width: `${Math.max(3, ((z - a) / span) * 100).toFixed(3)}%`,
      title: b.title,
      timeLabel: `${hhmm(b.start_time)}–${hhmm(b.end_time)}`,
      color: b.rooms.find((r) => r.room_id === roomId)?.room_color ?? null,
      tentative: b.status === 'tentative',
    });
  }
  return out.sort((x, y) => parseFloat(x.left) - parseFloat(y.left));
}
