import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { checkBooking, locationOfRooms, stampOutOfHours } from './business-hours.service';
import { checkPossibleDuplicate, stampPossibleDuplicate } from './booking-duplicate.service';
import { syncProjectEventDates } from './project-event-dates.service';
import { isReversedTimeRange } from '../../../shared/utils/timeRange';

/** from〜to (YYYY-MM-DD, 両端含む) の日付を昇順で列挙。UTC 基準で TZ ドリフトを回避。 */
function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d.getTime() <= end.getTime(); d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// スタジオ予約の参照・作成ロジック。studio.routes.ts のハンドラ本体を抽出したもので、
// HTTP ルート (UI) と MCP サーバーの両方から同じコードパスで呼ばれる。

export interface BookingListFilter {
  from?: string;      // ISO 日時 or YYYY-MM-DD (TEXT 列との文字列比較)
  to?: string;
  roomId?: string;
  projectId?: string;
  /** confirmed 確定 / tentative 仮押さえ (v4 カレンダー③)。**知らない値は素通しさせない** */
  status?: string;
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
    const { from, to, roomId, projectId, status } = filter;

    let where = 'WHERE b.deleted_at IS NULL';
    const params: unknown[] = [];
    if (from) { where += ' AND b.end_time >= ?'; params.push(from); }
    if (to) { where += ' AND b.start_time <= ?'; params.push(to); }
    if (projectId) { where += ' AND b.project_id = ?'; params.push(projectId); }
    // **知らない状態名で絞ると全件返る**（絞ったのに全部出ると気づけない）ので、
    // 知っている2つだけを通す。それ以外は絞らない
    if (status === 'confirmed' || status === 'tentative') { where += ' AND b.status = ?'; params.push(status); }
    // 部屋で絞る。⚠️ EXISTS で予約単位に絞ること — 下の rooms 取得側の WHERE に
    // room_id を入れると、その予約が同時に使う**他の部屋**まで落ちる
    if (roomId) {
      where += ' AND EXISTS (SELECT 1 FROM studio_booking_rooms br2 WHERE br2.booking_id = b.id AND br2.room_id = ?)';
      params.push(roomId);
    }

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
    // ⚠️ 対象の予約に絞って引く — 表は予約の履歴ぶん単調に増えるので、全行を
    // 引いて JS で捨てると週表示が年々遅くなる
    const bookingIds = bookings.map((b) => b.id);
    const allBookingRooms = bookingIds.length === 0 ? [] : await queryAll(
      /*
       * **拠点の名前と略称も返す**（migration 189）。案件詳細の会場は
       * 「用賀 WORLD STUDIO」と出すので、`location_id` だけでは足りない。
       * 略称は画面から直せる値で、**決めていなければ NULL**（画面が前置きを付けない）
       */
      `SELECT br.booking_id, br.room_id, br.occupant, br.usage_note,
              r.name as room_name, r.abbreviation as room_abbreviation,
              r.color as room_color, r.room_type, r.location_id,
              l.name as location_name, l.abbreviation as location_abbreviation,
              l.sort_order as location_sort_order, r.sort_order as room_sort_order
       FROM studio_booking_rooms br
       JOIN studio_rooms r ON r.id = br.room_id
       LEFT JOIN studio_locations l ON l.id = r.location_id
       WHERE br.booking_id = ANY(?::text[])
       ORDER BY l.sort_order NULLS LAST, r.sort_order, r.name`,
      [bookingIds]
    ) as any[];

    const roomsByBooking = new Map<string, any[]>();
    for (const br of allBookingRooms) {
      if (!roomsByBooking.has(br.booking_id)) roomsByBooking.set(br.booking_id, []);
      roomsByBooking.get(br.booking_id)!.push(br);
    }

    return bookings.map((b) => ({
      ...b,
      rooms: roomsByBooking.get(b.id) ?? [],
    }));
  },

  /**
   * 空き照会。指定期間 [from, to] (YYYY-MM-DD, 両端含む) の各部屋について、
   * 期間に重なる予約 (busy) と、予約が1件も無い「終日空き」日 (free_days) を返す。
   *
   * start_time/end_time は TEXT のため、calendar.ics と同じく先頭10桁 (日付部分) の
   * 文字列比較で期間絞り込みする → 単日 (from===to) の時刻指定予約が漏れる境界バグを回避。
   * 複数日にまたがる予約は各日を busy 扱い (空きの過大報告より、busy の過大報告=安全側)。
   */
  async getAvailability(filter: { from: string; to: string; roomId?: string }): Promise<any> {
    const from = filter.from.slice(0, 10);
    const to = filter.to.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'from / to は YYYY-MM-DD 形式で指定してください');
    }
    if (from > to) throw new AppError(400, 'VALIDATION_ERROR', 'from は to 以前の日付にしてください');
    const allDates = enumerateDates(from, to);
    if (allDates.length > 92) throw new AppError(400, 'VALIDATION_ERROR', '照会期間は最大 92 日までです');

    // 部屋マスター (roomId 指定時は 1 部屋に絞る)
    const locations = await this.listRooms();
    let rooms: any[] = [];
    for (const loc of locations) {
      for (const r of loc.rooms) rooms.push({ ...r, location_name: loc.name, location_sort_order: loc.sort_order });
    }
    if (filter.roomId) rooms = rooms.filter((r) => r.id === filter.roomId);

    // 期間に重なる予約 (境界安全な substr 比較)。room 紐付けも取得。
    const bookings = await queryAll(
      `SELECT b.id, b.title, b.booking_type, b.status, b.all_day, b.start_time, b.end_time,
              b.location_note, b.project_id, p.name as project_name, p.gls_number, e.episode_code
       FROM studio_bookings b
       LEFT JOIN projects p ON p.id = b.project_id
       LEFT JOIN episodes e ON e.id = b.episode_id
       WHERE b.deleted_at IS NULL
         AND substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10) >= ?
         AND substr(b.start_time, 1, 10) <= ?
       ORDER BY b.start_time`,
      [from, to]
    ) as any[];

    // ⚠️ 期間内の予約に絞って引く（listBookings と同じ理由 — 全行を引くと年々遅くなる）
    const bookingIds = bookings.map((b) => b.id);
    const bookingRooms = bookingIds.length === 0 ? [] : await queryAll(
      `SELECT br.booking_id, br.room_id, br.occupant FROM studio_booking_rooms br
       WHERE br.booking_id = ANY(?::text[])`,
      [bookingIds]
    ) as any[];
    const roomsByBooking = new Map<string, string[]>();
    for (const br of bookingRooms) {
      if (!roomsByBooking.has(br.booking_id)) roomsByBooking.set(br.booking_id, []);
      roomsByBooking.get(br.booking_id)!.push(br.room_id);
    }

    // 各部屋の busy 予約 + 占有日集合
    const result = rooms.map((room) => {
      const busy = bookings.filter((b) => (roomsByBooking.get(b.id) ?? []).includes(room.id));
      const occupied = new Set<string>();
      for (const b of busy) {
        const s = String(b.start_time).slice(0, 10);
        const e = String(b.end_time || b.start_time).slice(0, 10);
        for (const d of enumerateDates(s < from ? from : s, e > to ? to : e)) occupied.add(d);
      }
      return {
        room_id: room.id,
        room_name: room.name,
        room_abbreviation: room.abbreviation,
        location_name: room.location_name,
        busy: busy.map((b) => ({
          id: b.id, title: b.title, booking_type: b.booking_type, status: b.status,
          all_day: b.all_day, start_time: b.start_time, end_time: b.end_time,
          project_id: b.project_id, gls_number: b.gls_number, project_name: b.project_name,
          episode_code: b.episode_code,
        })),
        free_days: allDates.filter((d) => !occupied.has(d)),
      };
    });

    return { from, to, days: allDates, rooms: result };
  },

  /** 予約作成。actorId は created_by に記録される (UI = ログインユーザー / MCP = sentinel) */
  async createBooking(input: CreateBookingInput, actorId: string): Promise<any> {
    const { title, booking_type, project_id, episode_id, all_day, start_time, end_time, room_ids, room_details, location_note, notes, status } = input;
    if (!title || !start_time || !end_time) throw new AppError(400, 'VALIDATION_ERROR', 'タイトル・開始・終了は必須です');
    if (isReversedTimeRange(start_time, end_time)) throw new AppError(400, 'VALIDATION_ERROR', '終了は開始より後にしてください');

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

    // 案件に紐づく本予約を登録したら、d_hold 遷移で自動生成された「仮押さえ」プレースホルダを
    // soft-delete して二重登録を防ぐ (ユーザーが手動で作った仮押さえ予約は notes が異なるため残る)。
    // 今作成した行 (id) は notes マーカー不一致で対象外だが、念のため id 除外も入れる。
    if (project_id) {
      await execute(
        `UPDATE studio_bookings
            SET deleted_at = NOW(), updated_at = NOW(), updated_by = ?
          WHERE project_id = ? AND id != ? AND booking_type = 'hold'
            AND notes = '案件ステージ移行で自動生成' AND deleted_at IS NULL`,
        [actorId, project_id, id]
      );
    }

    /*
     * **案件の実施日を引き直す**（`project-event-dates.service.ts`）。
     * カレンダーで押さえた日が案件詳細の「実施日」に出ないと、
     * 同じ案件が画面によって違う日を出す。仮押さえの掃除のあとに回すこと —
     * 先に回すと、消える予定の仮押さえまで数えた期間で一度書いてしまう。
     */
    await syncProjectEventDates(project_id, actorId);

    const roomIdsUsed = Array.isArray(room_details) && room_details.length > 0
      ? room_details.map((rd) => rd.room_id)
      : (room_ids ?? []);

    // ── 営業時間の外なら印を付ける（v4 設定 ⑥）────────────────
    //
    // **止めません**（ご判断）。当日いま入れたい予約が入らないと業務が止まる。
    // 印を残しておけば、あとから一覧で拾って個別に連絡できる。
    // 拠点が分からない予約（部屋を押さえない予定）は判定しない。
    const loc = await locationOfRooms(roomIdsUsed);
    const check = await checkBooking(loc, start_time, end_time);
    if (check.outside) await stampOutOfHours(id, check);

    // ── 重複の疑いがあれば印を付ける（複数経路からの予約の表記揺らぎ対策）───
    //
    // **こちらも止めません**（out_of_hours と同じ方針）。同じ枠を指す予約が
    // 案件ステージ自動生成・MCP・手入力の別経路から題名の言い回し違いで
    // 二重に入ることが多々あるため、正規化した題名の類似度で拾い、
    // あとから一覧（GET /studios/bookings/possible-duplicates/list）で確認できるようにする。
    const dup = await checkPossibleDuplicate({
      id, title, project_id: project_id || null, start_time, end_time, room_ids: roomIdsUsed,
    });
    if (dup) await stampPossibleDuplicate(id, dup);

    const row = await queryOne('SELECT * FROM studio_bookings WHERE id = ?', [id]) as Record<string, unknown>;
    // 画面が注意を出せるように、判定の結果を**行とは別に**返す
    // （列に入れた文言をそのまま出すと、設定を直しても古い文が残る）
    return { ...row, hours_check: check, duplicate_check: dup };
  },
};
