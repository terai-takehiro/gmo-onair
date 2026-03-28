import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// ============================================================
// Studio Locations & Rooms
// ============================================================

// GET /studios/locations — ロケーション＋部屋一覧
router.get('/locations', (_req, res) => {
  const locations = queryAll(
    `SELECT * FROM studio_locations WHERE deleted_at IS NULL ORDER BY sort_order`
  );
  const rooms = queryAll(
    `SELECT * FROM studio_rooms WHERE deleted_at IS NULL ORDER BY sort_order`
  );
  // Nest rooms under locations
  const result = (locations as any[]).map((loc) => ({
    ...loc,
    rooms: (rooms as any[]).filter((r) => r.location_id === loc.id),
  }));
  res.json({ success: true, data: result });
});

// POST /studios/locations — ロケーション追加
router.post('/locations', requireAuth, (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  const id = uuidv4();
  execute(`INSERT INTO studio_locations (id, name, sort_order) VALUES (?, ?, ?)`, [id, name, sort_order ?? 0]);
  const row = queryOne('SELECT * FROM studio_locations WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// POST /studios/rooms — 部屋追加
router.post('/rooms', requireAuth, (req, res) => {
  const { location_id, name, color, sort_order } = req.body;
  if (!location_id || !name) throw new AppError(400, 'VALIDATION_ERROR', 'ロケーションと名前は必須です');
  const id = uuidv4();
  execute(`INSERT INTO studio_rooms (id, location_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [id, location_id, name, color || '#3b82f6', sort_order ?? 0]);
  const row = queryOne('SELECT * FROM studio_rooms WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// ============================================================
// Bookings
// ============================================================

// GET /studios/bookings — 予約一覧(カレンダー用)
router.get('/bookings', (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const roomId = req.query.room_id as string;

  let where = 'WHERE b.deleted_at IS NULL';
  const params: unknown[] = [];
  if (from) { where += ' AND b.end_time >= ?'; params.push(from); }
  if (to) { where += ' AND b.start_time <= ?'; params.push(to); }

  const bookings = queryAll(
    `SELECT b.*, p.name as project_name, p.gls_number, e.episode_code
     FROM studio_bookings b
     LEFT JOIN projects p ON p.id = b.project_id
     LEFT JOIN episodes e ON e.id = b.episode_id
     ${where}
     ORDER BY b.start_time`,
    params
  ) as any[];

  // Attach rooms to each booking
  const allBookingRooms = queryAll(
    `SELECT br.booking_id, br.room_id, r.name as room_name, r.color as room_color, r.location_id
     FROM studio_booking_rooms br
     JOIN studio_rooms r ON r.id = br.room_id`
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

  // Filter by room_id if specified
  if (roomId) {
    result = result.filter((b) => b.rooms.some((r: any) => r.room_id === roomId));
  }

  res.json({ success: true, data: result });
});

// GET /studios/bookings/:id
router.get('/bookings/:id', (req, res) => {
  const booking = queryOne(
    `SELECT b.*, p.name as project_name, p.gls_number, e.episode_code
     FROM studio_bookings b
     LEFT JOIN projects p ON p.id = b.project_id
     LEFT JOIN episodes e ON e.id = b.episode_id
     WHERE b.id = ? AND b.deleted_at IS NULL`, [req.params.id]
  ) as any;
  if (!booking) throw new AppError(404, 'NOT_FOUND', '予約が見つかりません');

  const rooms = queryAll(
    `SELECT br.room_id, r.name as room_name, r.color as room_color, r.location_id
     FROM studio_booking_rooms br
     JOIN studio_rooms r ON r.id = br.room_id
     WHERE br.booking_id = ?`, [req.params.id]
  );
  booking.rooms = rooms;
  res.json({ success: true, data: booking });
});

// POST /studios/bookings — 予約作成
router.post('/bookings', requireAuth, (req, res) => {
  const { title, booking_type, project_id, episode_id, all_day, start_time, end_time, room_ids, location_note, notes } = req.body;
  if (!title || !start_time || !end_time) throw new AppError(400, 'VALIDATION_ERROR', 'タイトル・開始・終了は必須です');

  const id = uuidv4();
  execute(
    `INSERT INTO studio_bookings (id, title, booking_type, project_id, episode_id, all_day, start_time, end_time, location_note, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, booking_type || 'other', project_id || null, episode_id || null,
     all_day ? 1 : 0, start_time, end_time, location_note || null, notes || null, req.user!.id]
  );

  // Insert room associations
  if (Array.isArray(room_ids)) {
    for (const roomId of room_ids) {
      execute(`INSERT INTO studio_booking_rooms (booking_id, room_id) VALUES (?, ?)`, [id, roomId]);
    }
  }

  const row = queryOne('SELECT * FROM studio_bookings WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /studios/bookings/:id — 予約更新
router.put('/bookings/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM studio_bookings WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予約が見つかりません');

  const { title, booking_type, project_id, episode_id, all_day, start_time, end_time, room_ids, location_note, notes } = req.body;
  execute(
    `UPDATE studio_bookings SET title=?, booking_type=?, project_id=?, episode_id=?, all_day=?,
     start_time=?, end_time=?, location_note=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [title, booking_type || 'other', project_id || null, episode_id || null,
     all_day ? 1 : 0, start_time, end_time, location_note || null, notes || null, req.user!.id, req.params.id]
  );

  // Replace room associations
  if (Array.isArray(room_ids)) {
    execute('DELETE FROM studio_booking_rooms WHERE booking_id = ?', [req.params.id]);
    for (const roomId of room_ids) {
      execute(`INSERT INTO studio_booking_rooms (booking_id, room_id) VALUES (?, ?)`, [req.params.id, roomId]);
    }
  }

  const row = queryOne('SELECT * FROM studio_bookings WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /studios/bookings/:id
router.delete('/bookings/:id', requireAuth, (req, res) => {
  execute(`UPDATE studio_bookings SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
