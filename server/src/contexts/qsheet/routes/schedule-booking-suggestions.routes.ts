/**
 * スケジュール表の「予約から列を入れる」（読み取り専用）。14-schedule-v2-plan.md §3 B9・§3-1。
 *
 * ⚠️ **自動で列を立てない理由は §3-1 に書いてある。** `studio_bookings` は
 * `hold_rank`／`possible_duplicate` を持つ「仮押さえを含む予約」で、その日の進行そのものではない。
 * この口が返すのは**その日の予約の一覧だけ**——列を作るかどうか・どれを作るかは
 * 人が選ぶ（`BookingColumnsDialog.tsx`）。ここは `POST columns` を一切呼ばない。
 *
 * なぜ新しい口が要るか: 既存の予約一覧 `GET /studios/bookings`
 * （`server/src/contexts/production/routes/studio.routes.ts`）は `requirePermission('sales')`
 * の下にあり、制作技術支援だけを使う技術・運営のアカウントには 403 になる。
 * `schedule-rooms.routes.ts`（会場の部屋一覧）とまったく同じ理由・同じ作法で、
 * qsheet の権限だけで同じ `studio_bookings` を読む口をここに足す（書き込みは一切しない）。
 *
 * ⚠️ **営業情報は返さない**（`projectContext.service.ts` と同じ規律）。金額・顧客連絡先・
 * 備考（`notes`／`location_note`）・使用者メモ（`occupant`／`usage_note`）は取ってこない。
 * 返すのは「列を作るのに要る事実」＋「仮か確定かを見分ける印」だけ——この経路は `sales`
 * 権限を要求しないので、返した時点で技術・運営の全アカウントに見える。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { canAccessSchedule } from '../access';
import { NotFoundError } from '../services/httpErrors';
import { wrap, p1 } from './wrap';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

interface BookingRoomRow {
  id: string;
  title: string;
  booking_type: string;
  status: string;
  hold_rank: number | null;
  possible_duplicate: boolean;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  room_id: string;
  room_name: string;
  room_color: string | null;
  location_id: string | null;
  location_name: string | null;
  location_abbreviation: string | null;
}

router.get('/schedules/:id/booking-suggestions', wrap(async (req: Request, res: Response) => {
  const scheduleId = p1(req.params.id);
  const sch = await queryOne(
    'SELECT id, service_date, project_id, created_by FROM qsheet_schedules WHERE id = ? AND deleted_at IS NULL',
    [scheduleId],
  );
  if (!sch || !(await canAccessSchedule(req.user!, scheduleId, (sch.created_by as string) ?? null))) {
    throw new NotFoundError('スケジュール表が見つかりません'); // 存在秘匿
  }
  const serviceDate = String(sch.service_date).slice(0, 10);
  const projectId = (sch.project_id as string) ?? null;

  /*
   * その日にかかる予約だけを拾う（`studio.routes.ts` の calendar.ics と同じ「日付先頭10桁の
   * 文字列比較」— start_time/end_time が TEXT 列のため）。複数日にまたがる予約
   * （前日仕込み〜撤収 等）も対象日に含まれていれば拾う。
   * 部屋を持たない予約（外現場のメモだけ）は列を作れないので INNER JOIN で自然に落ちる。
   */
  const rows = (await queryAll(
    `SELECT b.id, b.title, b.booking_type, b.status, b.hold_rank, b.possible_duplicate,
            b.project_id, p.name AS project_name, p.gls_number,
            br.room_id, r.name AS room_name, r.color AS room_color,
            r.location_id, l.name AS location_name, l.abbreviation AS location_abbreviation
       FROM studio_bookings b
       JOIN studio_booking_rooms br ON br.booking_id = b.id
       JOIN studio_rooms r ON r.id = br.room_id AND r.deleted_at IS NULL
       LEFT JOIN studio_locations l ON l.id = r.location_id AND l.deleted_at IS NULL
       LEFT JOIN projects p ON p.id = b.project_id AND p.deleted_at IS NULL
      WHERE b.deleted_at IS NULL
        AND substr(b.start_time, 1, 10) <= ?
        AND substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10) >= ?
      ORDER BY (b.project_id IS NOT DISTINCT FROM ?) DESC, l.sort_order NULLS LAST, r.sort_order, b.start_time`,
    [serviceDate, serviceDate, projectId],
  )) as unknown as BookingRoomRow[];

  // 予約単位にまとめる（1予約が複数部屋を持つことがある）
  const byBooking = new Map<string, {
    id: string; title: string; booking_type: string; status: string;
    hold_rank: number | null; possible_duplicate: boolean;
    project_id: string | null; project_name: string | null; gls_number: string | null;
    rooms: Array<{ room_id: string; room_name: string; room_color: string | null; location_id: string | null; location_name: string | null; location_abbreviation: string | null }>;
  }>();
  for (const r of rows) {
    if (!byBooking.has(r.id)) {
      byBooking.set(r.id, {
        id: r.id, title: r.title, booking_type: r.booking_type, status: r.status,
        hold_rank: r.hold_rank, possible_duplicate: r.possible_duplicate,
        project_id: r.project_id, project_name: r.project_name, gls_number: r.gls_number,
        rooms: [],
      });
    }
    byBooking.get(r.id)!.rooms.push({
      room_id: r.room_id, room_name: r.room_name, room_color: r.room_color,
      location_id: r.location_id, location_name: r.location_name, location_abbreviation: r.location_abbreviation,
    });
  }

  res.json({ success: true, data: [...byBooking.values()] });
}));

export default router;
