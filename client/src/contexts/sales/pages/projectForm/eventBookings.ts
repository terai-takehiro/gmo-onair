/**
 * 「実施日を決めている予約」— 直す画面が日程の欄を隠してよいかの判定
 *
 * 直す画面は**予約が唯一のもとになったとき**だけ「スタジオの日程」を隠します
 * （`ScheduleSection.tsx` の冒頭）。もとになるのは**本番・リハーサル・仮押さえ**の
 * 3つだけで、サーバーもこの3つだけを数えて実施日を引き直します
 * （`server/src/contexts/production/services/project-event-dates.service.ts`）。
 *
 * ⚠️ **「予約が1件でもあれば隠す」にしてはいけません。** 相談（打合せ）の予約を
 * 1件入れただけで日程の欄が消え、**その相談は実施日を動かさない**ので、
 * その案件は**どこからも実施日を直せなくなります**（画面には何も出ません）。
 *
 * ⚠️ **サーバーと同じ組を二重に持っています。** サーバーは `shared/` を import
 * できない（`server/tsconfig.json` の `rootDir`）ため写しになりますが、
 * ずれると上の「直せない案件」が起きるので、
 * `shared/tests/projectEventDates.test.ts` が両方を読んで突き合わせています。
 */

/** 実施日として数える予約の種別。**サーバー側の同名の表と揃えること** */
export const EVENT_BOOKING_TYPES = ['performance', 'rehearsal', 'hold'] as const;

/** 実施日を決めている予約が1件でもあるか（＝日程の欄を隠してよいか） */
export function hasEventBooking(bookings: Array<{ booking_type: string }>): boolean {
  return bookings.some(
    (b) => (EVENT_BOOKING_TYPES as readonly string[]).includes(b.booking_type),
  );
}
