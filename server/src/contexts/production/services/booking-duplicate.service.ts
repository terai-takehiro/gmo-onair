/**
 * production/services/booking-duplicate.service.ts
 *
 * 重複疑い予約の DB 側の配線。判定そのもの（表記揺らぎ対応の類似度計算）は
 * `shared/services/bookingDuplicate.ts`（純粋関数）にあり、ここは
 * **DB から候補を読んで渡し、結果を印として書くだけ**
 * （`business-hours.service.ts` の checkBooking / stampOutOfHours と同型）。
 */
import { queryAll, execute } from '../../../shared/db/connection';
import {
  findDuplicateCandidate,
  type DuplicateCheckBooking,
  type DuplicateCandidate,
  type DuplicateResult,
} from '../../../shared/services/bookingDuplicate';

/**
 * 時間帯が近い既存予約（重複判定の候補）を集める。**日付ベースで粗く絞る**
 * （`getAvailability` と同じ substr 比較 — 時刻ぴったりの一致を要求すると、
 * 判定側 `findDuplicateCandidate` に渡す前に本当は重なっている組を取りこぼす）。
 */
export async function candidatesNear(
  startTime: string,
  endTime: string | null | undefined,
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const startDay = startTime.slice(0, 10);
  const endDay = (endTime && endTime.trim() ? endTime : startTime).slice(0, 10);
  const params: unknown[] = [startDay, endDay];
  if (excludeId) params.push(excludeId);
  const rows = (await queryAll(
    `SELECT id, title, project_id, start_time, end_time
       FROM studio_bookings
      WHERE deleted_at IS NULL
        AND substr(COALESCE(NULLIF(end_time, ''), start_time), 1, 10) >= ?
        AND substr(start_time, 1, 10) <= ?
        ${excludeId ? 'AND id != ?' : ''}`,
    params,
  )) as Array<{ id: string; title: string; project_id: string | null; start_time: string; end_time: string | null }>;
  if (rows.length === 0) return [];

  const roomRows = (await queryAll(
    `SELECT booking_id, room_id FROM studio_booking_rooms WHERE booking_id IN (${rows.map(() => '?').join(', ')})`,
    rows.map((r) => r.id),
  )) as Array<{ booking_id: string; room_id: string }>;
  const roomsByBooking = new Map<string, string[]>();
  for (const rr of roomRows) {
    if (!roomsByBooking.has(rr.booking_id)) roomsByBooking.set(rr.booking_id, []);
    roomsByBooking.get(rr.booking_id)!.push(rr.room_id);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    project_id: r.project_id,
    start_time: r.start_time,
    end_time: r.end_time,
    room_ids: roomsByBooking.get(r.id) ?? [],
  }));
}

/** 重複疑いを判定する（DB 読み込み込み）。見つからなければ null */
export async function checkPossibleDuplicate(input: DuplicateCheckBooking): Promise<DuplicateResult | null> {
  const candidates = await candidatesNear(input.start_time, input.end_time, input.id);
  return findDuplicateCandidate(input, candidates);
}

/** 予約に「重複疑い」の印を書く。**止めない** — あとから一覧で拾うための印（out_of_hours と同型） */
export async function stampPossibleDuplicate(bookingId: string, result: DuplicateResult | null): Promise<void> {
  await execute(
    `UPDATE studio_bookings SET possible_duplicate = ?, possible_duplicate_of = ?, possible_duplicate_reason = ? WHERE id = ?`,
    [!!result, result?.bookingId ?? null, result?.reason ?? null, bookingId],
  );
}
