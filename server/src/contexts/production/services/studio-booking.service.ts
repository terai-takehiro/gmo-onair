import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// スタジオ予約の参照・作成ロジック。studio.routes.ts のハンドラ本体を抽出したもので、
// HTTP ルート (UI) と MCP サーバーの両方から同じコードパスで呼ばれる。

export interface BookingListFilter {
  from?: string;      // ISO 日時 or YYYY-MM-DD (TEXT 列との文字列比較)
  to?: string;
  roomId?: string;
  projectId?: string;
}

export interface CreateBookingInput {
  title?: string;
  booking_type?: string;
  project_id?: string | null;
  episode_id?: string | null;
  all_day?: boolean | number;
  start_time?: string;
  end_time?: string;
  room_ids?: string[];
  room_details?: Array<{ room_id: string; occupant?: string | null; usage_note?: string | null }>;
  location_note?: string | null;
  notes?: string | null;
  status?: string;
}

export const studioBookingService = {
  /** 拠点 + 部屋一覧 (部屋を拠点ごとにネスト) */
  async listRooms(): Promise<any[]> {
    const locations = await queryAll(
      `SELECT * FROM studio_locations WHERE deleted_at IS NULL ORDER BY sort_order`
    );
    const rooms = await queryAll(
      `SELECT * FROM studio_rooms WHERE deleted_at IS NULL ORDER BY sort_order`
    );
    return (locations as any[]).map((loc) => ({
      ...loc,
      rooms: (rooms as any[]).filter((r) => r.location_id === loc.id),
    }));
  },

  /** 予約一覧 (rooms[] 付き)。from/to は TEXT の start_time/end_time と文字列比較 */
  async listBookings(filter: BookingListFilter): Promise<any[]> {
    const { from, to, roomId, projectId } = filter;

    let where = 'WHERE b.deleted_at IS NULL';
    const params: unknown[] = [];
    if (from) { where += ' AND b.end_time >= ?'; params.push(from); }
    if (to) { where += ' AND b.start_time <= ?'; params.push(to); }
    if (projectId) { where += ' AND b.project_id = ?'; params.push(projectId); }

    const bookings = await queryAll(
      `SELECT b.*, p.name as project_name, p.gls_number, p.event_end as project_event_end, e.episode_code
       FROM studio_bookings b
       LEFT JOIN projects p ON p.id = b.project_id
       LEFT JOIN episodes e ON e.id = b.episode_id
       ${where}
       ORDER BY b.start_time`,
      params
    ) as any[];

    // Attach rooms (with occupant info) to each booking
    // ロケーションの sort_order → 部屋の sort_order の順でソートし、マスターの並びと一致させる
    const allBookingRooms = await queryAll(
      `SELECT br.booking_id, br.room_id, br.occupant, br.usage_note,
              r.name as room_name, r.abbreviation as room_abbreviation,
              r.color as room_color, r.room_type, r.location_id,
              l.sort_order as location_sort_order, r.sort_order as room_sort_order
       FROM studio_booking_rooms br
       JOIN studio_rooms r ON r.id = br.room_id
       LEFT JOIN studio_locations l ON l.id = r.location_id
       ORDER BY l.sort_order NULLS LAST, r.sort_order, r.name`
    ) as any[];

    const roomsByBooking = new Map<string, any[]>();
    for (const br of allBookingRooms) {
      if (!roomsByBooking.has(br.booking_id)) roomsByBooking.set(br.booking_id, []);
      roomsByBooking.get(br.booking_id)!.push(br);
    }

    let result = bookings.map((b) => ({
      ...b,
      rooms: roomsByBooking.get(b.id) ?? [],
    }));

    if (roomId) {
      result = result.filter((b) => b.rooms.some((r: any) => r.room_id === roomId));
    }

    return result;
  },

  /** 予約作成。actorId は created_by に記録される (UI = ログインユーザー / MCP = sentinel) */
  async createBooking(input: CreateBookingInput, actorId: string): Promise<any> {
    const { title, booking_type, project_id, episode_id, all_day, start_time, end_time, room_ids, room_details, location_note, notes, status } = input;
    if (!title || !start_time || !end_time) throw new AppError(400, 'VALIDATION_ERROR', 'タイトル・開始・終了は必須です');

    const bookingStatus = ['confirmed', 'tentative'].includes(status ?? '') ? status : 'tentative';
    const id = uuidv4();
    await execute(
      `INSERT INTO studio_bookings (id, title, booking_type, project_id, episode_id, all_day, start_time, end_time, location_note, notes, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, booking_type || 'other', project_id || null, episode_id || null,
       all_day ? 1 : 0, start_time, end_time, location_note || null, notes || null, bookingStatus, actorId]
    );

    // Insert room associations (with optional occupant/usage_note)
    if (Array.isArray(room_details) && room_details.length > 0) {
      for (const rd of room_details) {
        await execute(`INSERT INTO studio_booking_rooms (booking_id, room_id, occupant, usage_note) VALUES (?, ?, ?, ?)`,
          [id, rd.room_id, rd.occupant || null, rd.usage_note || null]);
      }
    } else if (Array.isArray(room_ids)) {
      for (const roomId of room_ids) {
        await execute(`INSERT INTO studio_booking_rooms (booking_id, room_id) VALUES (?, ?)`, [id, roomId]);
      }
    }

    return queryOne('SELECT * FROM studio_bookings WHERE id = ?', [id]);
  },
};
