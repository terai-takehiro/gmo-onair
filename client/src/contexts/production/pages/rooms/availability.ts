/**
 * ② 部屋の空き — 帯の置き方（画面を持たない部分）
 *
 * 「何時から何時までを、横のどこに、どれだけの幅で置くか」は
 * 読み違えると**空いていない枠を空きに見せます**。素で試せる形にしてあります。
 *
 * ── この画面での「空いている」の意味 ────────────────────────
 *
 * **横の余白＝空き**です。だから「予約はあるのに帯が出ない」形を作ってはいけません。
 * 実際に2つ作ってしまい、レビューで指摘されて直しました:
 *
 *   ① **終日の予約を帯にしていなかった** — 部屋名の下に文字で出すだけだったので、
 *      丸1日押さえてある部屋が**14時間まるごと空きに見えて**いました
 *   ② **日をまたぐ予約をその日で切っていなかった** — 8/1 20:00〜8/2 10:00 の予約は
 *      8/2 を開いても返ってきます（サーバーは重なりで拾う）。時刻だけを見ていたので
 *      **8/2 の 20:00〜22:00 に帯を描き、本当に埋まっている 8:00〜10:00 を空きにして**いました
 */

/** 表示する時間帯。モックと同じ 8:00〜22:00 */
export const DAY_START_H = 8;
export const DAY_END_H = 22;

const DAY_MIN = 24 * 60;

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
  /** 終日。**帯は出すが見た目を分ける**（時間の幅を持たないものなので） */
  allDay: boolean;
}

export function isAllDay(b: AvailBooking): boolean {
  return b.all_day === 1;
}

/**
 * `2026-08-02T14:30` を、**見ている日**の 0:00 からの分に直す。
 *
 * **その日より前に始まっていれば 0、その日より後に終わるなら 24:00 に丸めます。**
 * 時刻だけを見ると、前の日の 20:00 が「その日の 20:00」になります。
 */
function minutesOnDay(iso: string, day: string, fallback: number): number {
  if (!iso) return fallback;
  const d = iso.slice(0, 10);
  if (d < day) return 0;
  if (d > day) return DAY_MIN;
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  if (!Number.isFinite(h)) return fallback;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function hhmm(iso: string): string {
  return iso.slice(11, 16) || '';
}

/**
 * 見ている日から見た、その予約の始まりと終わり（0:00 からの分）。
 * **終わりが始まり以前になったら、その日の終わりまで**として扱う
 * （壊れた値・終了なしの予約で幅が消えるのを避ける）。
 */
export function clipToDay(b: AvailBooking, day: string): { from: number; to: number } {
  if (isAllDay(b)) return { from: 0, to: DAY_MIN };
  const from = minutesOnDay(b.start_time, day, 0);
  const to = minutesOnDay(b.end_time, day, DAY_MIN);
  return { from, to: to > from ? to : DAY_MIN };
}

/**
 * 1つの部屋ぶんの帯。
 *
 * **表示の外にはみ出す予定を捨てない。** 7:00〜9:00 の予定を「8:00 より前だから無し」に
 * すると、朝から使っている部屋が空きに見えます。**端で切って必ず出します。**
 *
 * `day` は `YYYY-MM-DD`。**渡さないと日をまたぐ予約を置き違えます。**
 */
export function laneBlocks(bookings: AvailBooking[], roomId: string, day: string): AvailBlock[] {
  const winFrom = DAY_START_H * 60;
  const span = (DAY_END_H - DAY_START_H) * 60;
  const out: AvailBlock[] = [];
  for (const b of bookings) {
    if (!b.rooms?.some((r) => r.room_id === roomId)) continue;
    const { from, to } = clipToDay(b, day);
    const a = Math.max(0, Math.min(span, from - winFrom));
    const z = Math.max(0, Math.min(span, to - winFrom));
    if (z <= 0 || a >= span) continue;   // まるごと表示の外
    out.push({
      id: b.id,
      left: `${((a / span) * 100).toFixed(3)}%`,
      // **最低幅を持たせる。** 15分の予定が線になると、空いているのと見分けが付かない
      width: `${Math.max(3, ((z - a) / span) * 100).toFixed(3)}%`,
      title: b.title,
      timeLabel: isAllDay(b) ? '終日' : `${hhmm(b.start_time)}–${hhmm(b.end_time)}`,
      color: b.rooms.find((r) => r.room_id === roomId)?.room_color ?? null,
      tentative: b.status === 'tentative',
      allDay: isAllDay(b),
    });
  }
  return out.sort((x, y) => parseFloat(x.left) - parseFloat(y.left));
}
