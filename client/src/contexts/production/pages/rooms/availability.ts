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
 *
 * ── 帯の色は「部屋」ではなく「種別」（承認済みモックで変えた）────
 *
 * 旧実装は帯を部屋の色で塗っていた。① 予定・③ 仮押さえはどちらも**種別**
 * （本番＝赤・リハーサル＝amber…）で塗っており、同じ予約がこの画面だけ
 * 別の色で見える食い違いがあった。`BOOKING_TYPE_COLORS`（`scheduleShared.tsx`）
 * を1本で読む。部屋名の横の小さな四角（`AvailRoom.color`）だけは今までどおり
 * 部屋の色 — 「どの部屋の行か」を示す目印で、帯の色とは役割が違う
 */
import { BOOKING_TYPE_COLORS } from '../../components/schedule/scheduleShared';
import type { CalEvent } from '../calendar/calendarLayout';

/** 表示する時間帯。モックと同じ 8:00〜22:00 */
export const DAY_START_H = 8;
export const DAY_END_H = 22;

const DAY_MIN = 24 * 60;

/**
 * 帯の中の文字色。**種別の色をそのまま文字に使うと、淡い帯地の上で読みにくい**
 * （amber #f59e0b は白地で 2:1 前後）。帯の枠・部屋名の四角は `BOOKING_TYPE_COLORS`
 * のまま、**帯の中の文字だけ**濃くする（承認済みモックの指定）。
 */
const KIND_TEXT_COLORS: Record<string, string> = {
  performance: '#991b1b',
  rehearsal: '#92400e',
  hold: '#1e40af',
  consultation: '#065f46',
  maintenance: '#374151',
  tour: '#5b21b6',
  internal: '#155e75',
  setup: '#78350f',
  other: '#374151',
};

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
  booking_type: string;
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
  /** 帯の枠・帯地の元になる色。種別の色（`BOOKING_TYPE_COLORS`） */
  color: string;
  /** 帯の中の文字色。**`color` をそのまま使わない**（コントラスト対策） */
  textColor: string;
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
 *
 * ── 「0時ちょうどに終わる」を丸1日にしない（レビューで直した）──
 *
 * 8/1 20:00〜8/2 0:00 の予約を 8/2 で見ると、始まりも終わりも 0 になります。
 * ここで「終わり ≦ 始まりなら その日の終わりまで」と畳んでいたため、
 * **前の晩に終わった予約が翌日を丸ごと埋めて**いました。
 * **0 は 0 のまま返し**、幅ゼロとして `laneBlocks` に捨てさせます。
 * その日の終わりまで伸ばすのは**値が壊れている／終了が無いとき**だけです。
 */
export function clipToDay(b: AvailBooking, day: string): { from: number; to: number } {
  if (isAllDay(b)) return { from: 0, to: DAY_MIN };
  const from = minutesOnDay(b.start_time, day, 0);
  // 終了が空・読めない → その日の終わりまで（幅が消えるのを避ける）
  const raw = (b.end_time ?? '').slice(11, 16);
  const broken = !b.end_time || !Number.isFinite(Number(raw.split(':')[0]));
  if (broken && b.end_time?.slice(0, 10) === day) return { from, to: DAY_MIN };
  const to = minutesOnDay(b.end_time, day, DAY_MIN);
  // 逆転しているとき（同じ日で終わりが始まりより前）だけ、その日の終わりまで
  return { from, to: to < from ? DAY_MIN : to };
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
    const color = BOOKING_TYPE_COLORS[b.booking_type] ?? BOOKING_TYPE_COLORS.other;
    out.push({
      id: b.id,
      left: `${((a / span) * 100).toFixed(3)}%`,
      // **最低幅を持たせる。** 15分の予定が線になると、空いているのと見分けが付かない
      width: `${Math.max(3, ((z - a) / span) * 100).toFixed(3)}%`,
      title: b.title,
      timeLabel: isAllDay(b) ? '終日' : `${hhmm(b.start_time)}–${hhmm(b.end_time)}`,
      color,
      textColor: KIND_TEXT_COLORS[b.booking_type] ?? KIND_TEXT_COLORS.other,
      tentative: b.status === 'tentative',
      allDay: isAllDay(b),
    });
  }
  return out.sort((x, y) => parseFloat(x.left) - parseFloat(y.left));
}

/**
 * ② 部屋の空き（スマホ）— 月表の点用に、予約を `CalEvent` の形へ畳んだもの。
 *
 * **月表の部品（`MobileMonthGrid`）は ① 予定と共用する**（作り直さない）。
 * その部品が読める形に合わせているだけで、この画面の帯とは別の計算。
 *
 * ── 色は種別。部屋ではない ─────────────────────────────────────
 *
 * 帯・部屋名の四角と同じ決めごと（`laneBlocks` の説明を参照）。ここだけ部屋の色にすると、
 * 月表の点と選んだ日の帯で同じ予約が違う色に見える。
 *
 * ── 絞り込みに連動させる ───────────────────────────────────────
 *
 * `roomIds` に1つも部屋が入っていない予約（拠点の絞り込みで外れている）は点にしない。
 * 入れてしまうと、拠点を選んでいるのに他拠点の忙しさが点として出て、
 * 「この日は埋まっている」と読み違える
 *
 * ── 複数の部屋にまたがる予約は点を1つだけ ─────────────────────
 *
 * 部屋ごとに点を足すと、2部屋を押さえた予約が同じ日に2つの点として出て、
 * 実際より忙しい日に見える
 */
export function monthDotEvents(bookings: AvailBooking[], roomIds: Set<string>): CalEvent[] {
  return bookings
    .filter((b) => b.rooms?.some((r) => roomIds.has(r.room_id)))
    .map((b) => ({
      key: `bk-${b.id}`,
      id: b.id,
      layer: 'studio',
      title: b.title,
      color: BOOKING_TYPE_COLORS[b.booking_type] ?? BOOKING_TYPE_COLORS.other,
      typeLabel: '',
      sub: '',
      source: '',
      allDay: isAllDay(b),
      start: b.start_time,
      end: b.end_time,
      tentative: b.status === 'tentative',
    }));
}
