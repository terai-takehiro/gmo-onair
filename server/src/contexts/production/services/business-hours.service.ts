/**
 * 休日・営業時間（v4 設定 ⑥）
 *
 * ── 判定そのものは `shared/services/businessHours.ts` ────────
 *
 * ここは **DB から読んで渡すだけ**。境目の判定（20:00 までの日に 21:00 まで
 * 入れたら外か）は純粋関数側にあり、`shared/tests/` が固定しています。
 *
 * ── 休業日の重ね方 ──────────────────────────────────────────
 *
 * `closed_days.location_id IS NULL` = 全拠点。拠点ごとの行があればそちらが
 * 優先します。こうしないと祝日 16 日 × 拠点 4 = 64 行を毎年作ることになります。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import {
  checkHours, type DayHours, type ClosedDay, type HoursCheck,
} from '../../../shared/services/businessHours';

export async function hoursOf(locationId: string): Promise<DayHours[]> {
  return (await queryAll(
    `SELECT weekday, open_time, close_time, over_policy, note
       FROM business_hours WHERE location_id = ? ORDER BY weekday`,
    [locationId],
  )) as unknown as DayHours[];
}

/**
 * その拠点に効く休業日。**全社ぶん（`location_id IS NULL`）を含める。**
 * 同じ日に拠点の行と全社の行が両方あるときは**拠点を先に並べる** —
 * `checkHours` は最初に当たった行を採るので、これが優先順になる。
 */
export async function closedDaysOf(locationId: string | null): Promise<ClosedDay[]> {
  return (await queryAll(
    `SELECT from_date, to_date, name, availability
       FROM closed_days
      WHERE deleted_at IS NULL AND (location_id = ? OR location_id IS NULL)
      ORDER BY (location_id IS NULL), from_date`,
    [locationId],
  )) as unknown as ClosedDay[];
}

/** 予約が営業時間の外かを見る。**拠点が分からないときは止めない** */
export async function checkBooking(
  locationId: string | null,
  start: string,
  end: string | null,
): Promise<HoursCheck> {
  if (!locationId) return { outside: false, reason: '', policy: 'accept', closedDayName: null };
  return checkHours(start, end, await hoursOf(locationId), await closedDaysOf(locationId));
}

/**
 * 予約が使う部屋から拠点を割り出す。
 *
 * 部屋を複数押さえる予約もあるので**最初の1つ**を採ります。拠点をまたぐ予約は
 * いまの運用では作れないので（部屋の一覧が拠点ごと）、これで足ります。
 */
export async function locationOfBooking(bookingId: string): Promise<string | null> {
  const row = await queryOne(
    `SELECT r.location_id FROM studio_booking_rooms br
       JOIN studio_rooms r ON r.id = br.room_id
      WHERE br.booking_id = ? LIMIT 1`,
    [bookingId],
  ) as { location_id?: string } | null;
  return row?.location_id ?? null;
}

export async function locationOfRooms(roomIds: string[]): Promise<string | null> {
  if (roomIds.length === 0) return null;
  const row = await queryOne(
    `SELECT location_id FROM studio_rooms WHERE id = ? LIMIT 1`, [roomIds[0]],
  ) as { location_id?: string } | null;
  return row?.location_id ?? null;
}

/** 予約に「時間外」の印を書く。**止めない** — あとから一覧で拾うための印 */
export async function stampOutOfHours(bookingId: string, check: HoursCheck): Promise<void> {
  await execute(
    `UPDATE studio_bookings SET out_of_hours = ?, out_of_hours_reason = ? WHERE id = ?`,
    [check.outside, check.outside ? check.reason : null, bookingId],
  );
}

// ───────────────────────────────────────────────────────────
// 設定の読み書き
// ───────────────────────────────────────────────────────────

export async function listSettings(locationId: string) {
  const [hours, closed] = await Promise.all([
    hoursOf(locationId),
    queryAll(
      `SELECT id, location_id, from_date, to_date, name, kind, availability, estimated
         FROM closed_days
        WHERE deleted_at IS NULL AND (location_id = ? OR location_id IS NULL)
        ORDER BY from_date`,
      [locationId],
    ),
  ]);
  return { hours, closed };
}

export async function saveHours(
  locationId: string,
  rows: { weekday: number; open_time: string | null; close_time: string | null; over_policy: string; note: string | null }[],
): Promise<void> {
  for (const r of rows) {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6) continue;
    // **片方だけ入っている行を作らせない**（DB の CHECK と同じ約束を先に守る）
    const open = r.open_time || null;
    const close = r.close_time || null;
    const pair = open && close ? [open, close] : [null, null];
    await execute(
      `INSERT INTO business_hours (location_id, weekday, open_time, close_time, over_policy, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (location_id, weekday) DO UPDATE SET
         open_time = EXCLUDED.open_time, close_time = EXCLUDED.close_time,
         over_policy = EXCLUDED.over_policy, note = EXCLUDED.note, updated_at = NOW()`,
      [locationId, r.weekday, pair[0], pair[1],
       ['accept', 'consult', 'reject'].includes(r.over_policy) ? r.over_policy : 'accept',
       r.note || null],
    );
  }
}

export async function upsertClosedDay(input: {
  id?: string; location_id: string | null; from_date: string; to_date: string;
  name: string; kind?: string; availability?: string;
}): Promise<string> {
  const id = input.id || `cd-${uuidv4().slice(0, 8)}`;
  const kind = ['company', 'holiday', 'site'].includes(input.kind ?? '') ? input.kind! : 'company';
  const avail = ['open', 'none', 'consult', 'partial'].includes(input.availability ?? '')
    ? input.availability! : 'none';
  await execute(
    `INSERT INTO closed_days (id, location_id, from_date, to_date, name, kind, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       location_id = EXCLUDED.location_id, from_date = EXCLUDED.from_date,
       to_date = EXCLUDED.to_date, name = EXCLUDED.name,
       availability = EXCLUDED.availability, updated_at = NOW()`,
    [id, input.location_id, input.from_date, input.to_date, input.name.trim(), kind, avail],
  );
  return id;
}

/**
 * 休業日にすると重なる予約。**消しません** — 一覧で見せて個別に連絡する
 * （モックの指定:「動かす必要がある予約は一覧で確認して個別に連絡してください」）。
 */
export async function bookingsInRange(
  locationId: string | null, from: string, to: string,
): Promise<{ id: string; title: string; start_time: string; end_time: string }[]> {
  const params: unknown[] = [to, from];
  let roomFilter = '';
  if (locationId) {
    roomFilter = ` AND EXISTS (
      SELECT 1 FROM studio_booking_rooms br JOIN studio_rooms r ON r.id = br.room_id
       WHERE br.booking_id = b.id AND r.location_id = ?)`;
    params.push(locationId);
  }
  return (await queryAll(
    `SELECT b.id, b.title, b.start_time, b.end_time
       FROM studio_bookings b
      WHERE b.deleted_at IS NULL
        AND substr(b.start_time, 1, 10) <= ?
        AND substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10) >= ?
        ${roomFilter}
      ORDER BY b.start_time`,
    params,
  )) as unknown as { id: string; title: string; start_time: string; end_time: string }[];
}
