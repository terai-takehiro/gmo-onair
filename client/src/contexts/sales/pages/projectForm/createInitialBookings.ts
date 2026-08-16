/**
 * 案件を**新しく作ったとき**に、入力されたスタジオ日程から予約を1度だけ作る
 *
 * ── なぜ別のファイルにしたか ────────────────────────────────
 *
 * `useProjectForm.ts` は 400 行ちょうどで、`npm run lint` の上限に張り付いています。
 * ここは**フォームの状態管理ではなく「保存の後始末」**なので、切り出すのが自然です
 * （中身は1行も変えていません。足したのは最後の読み直しだけ）。
 *
 * ── 直したこと ──────────────────────────────────────────────
 *
 * ⚠️ **作った予約のぶんを読み直していませんでした**（レビューでの指摘 #164・P1）。
 * サーバーは予約から案件の実施日を引き直すので
 * （`server/.../project-event-dates.service.ts`）、落とさないと
 * **いま作った案件の詳細が、リハーサルを含む前の実施日**を出します。
 * 保存の `onSuccess` は先に案件詳細へ移るので、**移った先が古い**という形になります
 * （`staleTime` は 60 秒・focus では読み直さない）。
 */
import api from '@/lib/api';
import { invalidateBookingQueries, type Invalidator } from '@/lib/bookingQueries';
import { formatShortDate } from '@/lib/format';

/** 予約を作るのに要る日程だけ（`useProjectSchedule` の戻り値の一部） */
export interface BookingSchedule {
  roomIds: string[];
  locationNote: string;
  productionStart: string;
  productionLastDay: string;
  hasRehearsal: boolean;
  rehearsalStart: string;
  rehearsalEnd: string;
  rehearsalMultiDay: boolean;
}

/**
 * **新規のときだけ呼ぶこと。** 直すときはこのフォームから作らない
 * （登録済みの予約 ＋ `StudioBookingDialog` で CRUD する）。
 */
export async function createInitialBookings(
  qc: Invalidator,
  projectName: string,
  projectId: string,
  schedule: BookingSchedule,
): Promise<void> {
  const note = schedule.locationNote.trim();
  try {
    await api.post('/studios/bookings', {
      title: `${projectName} (${formatShortDate(schedule.productionStart)})`,
      booking_type: 'performance',
      project_id: projectId,
      all_day: true,
      start_time: schedule.productionStart,
      end_time: schedule.productionLastDay || schedule.productionStart,
      room_ids: schedule.roomIds,
      location_note: note || null,
    });
    if (schedule.hasRehearsal && schedule.rehearsalStart) {
      const rehEnd = schedule.rehearsalMultiDay ? schedule.rehearsalEnd : schedule.rehearsalStart;
      await api.post('/studios/bookings', {
        title: `${projectName} (${formatShortDate(schedule.rehearsalStart)})`,
        booking_type: 'rehearsal',
        project_id: projectId,
        all_day: true,
        start_time: schedule.rehearsalStart,
        end_time: rehEnd || schedule.rehearsalStart,
        room_ids: schedule.roomIds,
        location_note: note || null,
      });
    }
  } catch { /* 予約に失敗しても案件の保存は成功している */ }

  /*
   * ⚠️ **失敗しても落とす。** 2件目（リハーサル）だけ失敗した回でも1件目のぶんは
   * 実施日に効いているので、`try` の中に置くと**部分的に入ったときだけ古いまま**になる
   */
  invalidateBookingQueries(qc);
}
