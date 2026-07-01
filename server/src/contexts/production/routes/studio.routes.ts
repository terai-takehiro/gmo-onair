import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission, requireRole } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateICalFeed, ICalEvent } from '../../../shared/utils/ical';

const router = Router();

// ============================================================
// iCal フィード (認証不要 — URLのtokenで認証)
// Google Calendar / Outlook から定期取得される
//
// v2.9.133+: フィードトークンは環境変数 (ICAL_FEED_TOKEN) の手動設定に依存していたが、
// 未設定のままだと全リクエストが 403 になり「カレンダー連携が機能しない」原因になっていた。
// DB (studio_calendar_settings, singleton) にトークンを永続化し、無ければ初回アクセス時に
// 自動発行する方式に変更 (運用者の手作業なしで必ず動く)。
// ============================================================

/** フィードトークンを取得。未生成なら自動発行して DB に保存する (singleton row, id=1) */
async function getOrCreateFeedToken(): Promise<string> {
  const row = await queryOne('SELECT feed_token FROM studio_calendar_settings WHERE id = 1') as any;
  if (row?.feed_token) return row.feed_token;
  const token = crypto.randomBytes(24).toString('hex');
  await execute(
    `INSERT INTO studio_calendar_settings (id, feed_token) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET feed_token = EXCLUDED.feed_token, updated_at = NOW()`,
    [token],
  );
  return token;
}

async function verifyFeedToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const current = await getOrCreateFeedToken();
  return token === current;
}

// カレンダー連携の自己診断 (認証不要・トークン不要)。
// 「カレンダーが全く登録できない」ときに、サーバー側フィードが生成できているか / トークンが
// 発行済みか / 予約件数 を ブラウザで確認できる。トークン値そのものは伏せる (末尾4桁のみ)。
router.get('/calendar-status', async (_req, res) => {
  const out: Record<string, unknown> = { ok: false };
  try {
    const t = await getOrCreateFeedToken();
    out.tokenConfigured = !!t;
    out.tokenTail = t ? t.slice(-4) : null;
  } catch (e) {
    out.tokenError = (e as Error).message;
  }
  try {
    const c = (await queryOne(
      `SELECT COUNT(*)::int AS c FROM studio_bookings
       WHERE deleted_at IS NULL AND end_time >= (NOW() - interval '3 months')
         AND start_time <= (NOW() + interval '1 year')`,
    )) as any;
    out.bookingCount = c?.c ?? 0;
  } catch (e) {
    out.bookingQueryError = (e as Error).message;
  }
  try {
    // フィードを実際に生成してみて例外が出ないか確認する (件数0でも成功扱い)
    const feed = generateICalFeed('診断', []);
    out.feedGenerates = feed.startsWith('BEGIN:VCALENDAR');
    out.ok = out.tokenConfigured === true && !out.tokenError && !out.bookingQueryError;
  } catch (e) {
    out.feedGenError = (e as Error).message;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(out.ok ? 200 : 500).send(JSON.stringify(out, null, 2));
});

// 全部屋を統合した単一カレンダーフィード (旧: 部屋ごとに個別URLだったものを1本化)
router.get('/calendar.ics', async (req, res) => {
 try {
  const token = req.query.token as string;
  if (!(await verifyFeedToken(token))) {
    res.status(403).type('text/plain; charset=utf-8').send('Invalid feed token (カレンダー連携ダイアログのURLを再取得してください)');
    return;
  }

  // 過去3ヶ月〜未来1年の予約 (全部屋)
  const bookings = await queryAll(
    `SELECT b.id, b.title, b.booking_type, b.start_time, b.end_time, b.all_day,
            b.location_note, b.notes, b.created_at, b.updated_at,
            p.name as project_name, p.gls_number
     FROM studio_bookings b
     LEFT JOIN projects p ON p.id = b.project_id
     WHERE b.deleted_at IS NULL
       AND b.end_time >= (NOW() - interval '3 months')
       AND b.start_time <= (NOW() + interval '1 year')
     ORDER BY b.start_time`,
  ) as any[];

  // 予約ごとの部屋一覧 (占有者/用途メモ込み) を取得しマージする
  const bookingRooms = await queryAll(
    `SELECT br.booking_id, br.occupant, br.usage_note, r.name as room_name, l.name as location_name
     FROM studio_booking_rooms br
     JOIN studio_rooms r ON r.id = br.room_id
     LEFT JOIN studio_locations l ON l.id = r.location_id
     ORDER BY l.sort_order, r.sort_order`,
  ) as any[];
  const roomsByBooking = new Map<string, typeof bookingRooms>();
  for (const br of bookingRooms) {
    if (!roomsByBooking.has(br.booking_id)) roomsByBooking.set(br.booking_id, []);
    roomsByBooking.get(br.booking_id)!.push(br);
  }

  const events: ICalEvent[] = bookings.map((b) => {
    const rooms = roomsByBooking.get(b.id) || [];
    const roomLabels = rooms.map((r) => (r.location_name ? `${r.location_name} - ${r.room_name}` : r.room_name));
    const occupants = [...new Set(rooms.map((r) => r.occupant).filter(Boolean))];
    const usageNotes = [...new Set(rooms.map((r) => r.usage_note).filter(Boolean))];

    const parts: string[] = [];
    if (b.project_name) parts.push(b.gls_number ? `[${b.gls_number}] ${b.project_name}` : b.project_name);
    if (occupants.length) parts.push(`使用者: ${occupants.join(', ')}`);
    if (usageNotes.length) parts.push(usageNotes.join('\n'));
    if (b.location_note) parts.push(b.location_note);
    if (b.notes) parts.push(b.notes);

    return {
      uid: `booking-${b.id}@gmo-onair.jp`,
      summary: roomLabels.length ? `${b.title}（${roomLabels.join(' / ')}）` : b.title,
      description: parts.join('\n') || undefined,
      location: roomLabels.join(' / ') || undefined,
      dtstart: b.start_time,
      dtend: b.end_time,
      allDay: !!b.all_day,
      created: b.created_at,
      lastModified: b.updated_at,
    };
  });

  const ical = generateICalFeed('GMO ONAiR スタジオ予約', events);

  // method=PUBLISH を Content-Type にも明示 (Outlook/Exchange のフェッチャが参照する)。
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8; method=PUBLISH');
  // ?download=1 のときは .ics ファイルとしてダウンロード (Outlook への手動インポート用フォールバック)。
  // 通常 (購読) は attachment を付けない — Content-Disposition があると一部の Outlook 版が
  // 「購読」ではなく「ダウンロード」扱いにして "後でもう一度お試しください" で失敗するため。
  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', 'attachment; filename="studio-bookings.ics"');
  }
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5分キャッシュ
  res.send(ical);
 } catch (err) {
  // 例外を握りつぶさず、原因を text/plain で返す (Google/Outlook は本文を無視するが、
  // ブラウザで直接開けば原因が分かる。従来は bare 500 で全クライアントが黙って失敗していた)。
  console.error('[calendar.ics] generation error:', err);
  res.status(500).type('text/plain; charset=utf-8')
    .send('calendar feed error: ' + (err as Error).message);
 }
});

// サイネージ用データ (認証不要 — トークンで保護)
router.get('/rooms/:roomId/signage', async (req, res) => {
  const token = req.query.token as string;
  if (!(await verifyFeedToken(token))) {
    res.status(403).json({ success: false, error: { message: 'Invalid token' } });
    return;
  }

  const room = await queryOne(
    `SELECT r.id, r.name, r.room_type, l.name as location_name
     FROM studio_rooms r LEFT JOIN studio_locations l ON l.id = r.location_id
     WHERE r.id = ? AND r.deleted_at IS NULL`,
    [req.params.roomId],
  ) as any;
  if (!room) { res.status(404).json({ success: false, error: { message: 'Room not found' } }); return; }

  const now = new Date().toISOString();
  const todayStart = now.slice(0, 10) + 'T00:00:00';
  const todayEnd = now.slice(0, 10) + 'T23:59:59';

  // 現在使用中の予約
  const current = await queryOne(
    `SELECT b.title, b.start_time, b.end_time, br.occupant, br.usage_note
     FROM studio_bookings b
     JOIN studio_booking_rooms br ON br.booking_id = b.id AND br.room_id = ?
     WHERE b.deleted_at IS NULL AND b.start_time <= ? AND b.end_time >= ?
     ORDER BY b.start_time LIMIT 1`,
    [req.params.roomId, now, now],
  ) as any;

  // 本日の残りの予約
  const upcoming = await queryAll(
    `SELECT b.title, b.start_time, b.end_time, br.occupant, br.usage_note
     FROM studio_bookings b
     JOIN studio_booking_rooms br ON br.booking_id = b.id AND br.room_id = ?
     WHERE b.deleted_at IS NULL AND b.start_time > ? AND b.start_time <= ?
     ORDER BY b.start_time`,
    [req.params.roomId, now, todayEnd],
  ) as any[];

  res.json({
    success: true,
    data: {
      room: { name: room.name, location_name: room.location_name, room_type: room.room_type },
      current: current || null,
      upcoming,
    },
  });
});

// カレンダー連携情報 (認証必要 — 管理画面で表示用)
// v2.9.133+: 部屋ごとに個別だったカレンダーフィードURLを全部屋共通の1本に統合。
// サイネージURL (物理ディスプレイ設置用) は部屋固有のため従来どおり部屋ごとに一覧表示する。
router.get('/rooms/feeds', requireAuth, requirePermission('studio'), async (_req, res) => {
  const token = await getOrCreateFeedToken();
  const baseUrl = process.env.CLIENT_URL || 'https://gmo-onair.jp';

  const rooms = await queryAll(
    `SELECT r.id, r.name, r.room_type, l.name as location_name
     FROM studio_rooms r
     LEFT JOIN studio_locations l ON l.id = r.location_id
     WHERE r.deleted_at IS NULL
     ORDER BY l.sort_order, r.sort_order`,
  ) as any[];

  res.json({
    success: true,
    data: {
      calendar_feed_url: `${baseUrl}/api/v1/internal/studios/calendar.ics?token=${token}`,
      rooms: rooms.map((r) => ({
        room_id: r.id,
        room_name: r.name,
        location_name: r.location_name,
        room_type: r.room_type,
        signage_url: `${baseUrl}/signage/${r.id}?token=${token}`,
      })),
    },
  });
});

// フィードトークン再生成 (DB に永続化。既発行の全URL・サイネージ表示は無効化される点に注意)
router.post('/rooms/feeds/regenerate-token', requireAuth, requireRole('system_admin'), async (_req, res) => {
  const newToken = crypto.randomBytes(24).toString('hex');
  await execute(
    `INSERT INTO studio_calendar_settings (id, feed_token) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET feed_token = EXCLUDED.feed_token, updated_at = NOW()`,
    [newToken],
  );
  res.json({
    success: true,
    message: 'フィードトークンを再生成しました。既存のカレンダー登録・サイネージURLは無効になります。',
    data: { token: newToken },
  });
});

// ============================================================
// 以下、認証必須のAPI
// ============================================================

// Apply auth + permission middleware to all routes below
router.use(requireAuth, requirePermission('studio'));

// ============================================================
// Studio Locations & Rooms
// ============================================================

// GET /studios/locations — ロケーション＋部屋一覧
router.get('/locations', async (_req, res) => {
  const locations = await queryAll(
    `SELECT * FROM studio_locations WHERE deleted_at IS NULL ORDER BY sort_order`
  );
  const rooms = await queryAll(
    `SELECT * FROM studio_rooms WHERE deleted_at IS NULL ORDER BY sort_order`
  );
  // Nest rooms under locations
  const result = (locations as any[]).map((loc) => ({
    ...loc,
    rooms: (rooms as any[]).filter((r) => r.location_id === loc.id),
  }));
  res.json({ success: true, data: result });
});

// ロケーション・部屋の追加/更新/削除は system_admin 専用
const adminOnly = requireRole('system_admin');

// POST /studios/locations — ロケーション追加
router.post('/locations', adminOnly, async (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  const id = uuidv4();
  await execute(`INSERT INTO studio_locations (id, name, sort_order) VALUES (?, ?, ?)`, [id, name, sort_order ?? 0]);
  const row = await queryOne('SELECT * FROM studio_locations WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /studios/locations/:id
router.put('/locations/:id', adminOnly, async (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  await execute(`UPDATE studio_locations SET name = ?, sort_order = ? WHERE id = ? AND deleted_at IS NULL`,
    [name, sort_order ?? 0, req.params.id]);
  const row = await queryOne('SELECT * FROM studio_locations WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /studios/locations/:id — 論理削除
router.delete('/locations/:id', adminOnly, async (req, res) => {
  await execute(`UPDATE studio_locations SET deleted_at = NOW() WHERE id = ?`, [req.params.id]);
  await execute(`UPDATE studio_rooms SET deleted_at = NOW() WHERE location_id = ? AND deleted_at IS NULL`, [req.params.id]);
  res.json({ success: true });
});

// POST /studios/rooms — 部屋追加
router.post('/rooms', adminOnly, async (req, res) => {
  const { location_id, name, abbreviation, room_type, color, sort_order } = req.body;
  if (!location_id || !name) throw new AppError(400, 'VALIDATION_ERROR', 'ロケーションと名前は必須です');
  const id = uuidv4();
  await execute(
    `INSERT INTO studio_rooms (id, location_id, name, abbreviation, room_type, color, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, location_id, name, abbreviation?.trim() || null, room_type || 'studio', color || '#3b82f6', sort_order ?? 0],
  );
  const row = await queryOne('SELECT * FROM studio_rooms WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /studios/rooms/:id
router.put('/rooms/:id', adminOnly, async (req, res) => {
  const { name, abbreviation, room_type, color, sort_order } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  await execute(
    `UPDATE studio_rooms SET name = ?, abbreviation = ?, room_type = ?, color = ?, sort_order = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [name, abbreviation?.trim() || null, room_type || 'studio', color || '#3b82f6', sort_order ?? 0, req.params.id],
  );
  const row = await queryOne('SELECT * FROM studio_rooms WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /studios/rooms/:id — 論理削除
router.delete('/rooms/:id', adminOnly, async (req, res) => {
  await execute(`UPDATE studio_rooms SET deleted_at = NOW() WHERE id = ?`, [req.params.id]);
  res.json({ success: true });
});

// ============================================================
// Bookings
// ============================================================

// GET /studios/bookings — 予約一覧(カレンダー用)
router.get('/bookings', async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const roomId = req.query.room_id as string;
  const projectId = req.query.project_id as string;

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

  // Filter by room_id if specified
  if (roomId) {
    result = result.filter((b) => b.rooms.some((r: any) => r.room_id === roomId));
  }

  res.json({ success: true, data: result });
});

// GET /studios/bookings/:id
router.get('/bookings/:id', async (req, res) => {
  const booking = await queryOne(
    `SELECT b.*, p.name as project_name, p.gls_number, e.episode_code
     FROM studio_bookings b
     LEFT JOIN projects p ON p.id = b.project_id
     LEFT JOIN episodes e ON e.id = b.episode_id
     WHERE b.id = ? AND b.deleted_at IS NULL`, [req.params.id]
  ) as any;
  if (!booking) throw new AppError(404, 'NOT_FOUND', '予約が見つかりません');

  const rooms = await queryAll(
    `SELECT br.room_id, br.occupant, br.usage_note,
            r.name as room_name, r.abbreviation as room_abbreviation,
            r.color as room_color, r.room_type, r.location_id
     FROM studio_booking_rooms br
     JOIN studio_rooms r ON r.id = br.room_id
     LEFT JOIN studio_locations l ON l.id = r.location_id
     WHERE br.booking_id = ?
     ORDER BY l.sort_order NULLS LAST, r.sort_order, r.name`, [req.params.id]
  );
  booking.rooms = rooms;
  res.json({ success: true, data: booking });
});

// POST /studios/bookings — 予約作成
router.post('/bookings', requirePermission('studio', 'editor'), async (req, res) => {
  const { title, booking_type, project_id, episode_id, all_day, start_time, end_time, room_ids, room_details, location_note, notes, status } = req.body;
  if (!title || !start_time || !end_time) throw new AppError(400, 'VALIDATION_ERROR', 'タイトル・開始・終了は必須です');

  const bookingStatus = ['confirmed', 'tentative'].includes(status) ? status : 'tentative';
  const id = uuidv4();
  await execute(
    `INSERT INTO studio_bookings (id, title, booking_type, project_id, episode_id, all_day, start_time, end_time, location_note, notes, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, booking_type || 'other', project_id || null, episode_id || null,
     all_day ? 1 : 0, start_time, end_time, location_note || null, notes || null, bookingStatus, req.user!.id]
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

  const row = await queryOne('SELECT * FROM studio_bookings WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /studios/bookings/:id — 予約更新
router.put('/bookings/:id', requirePermission('studio', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM studio_bookings WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予約が見つかりません');

  const { title, booking_type, project_id, episode_id, all_day, start_time, end_time, room_ids, room_details, location_note, notes, status } = req.body;
  const bookingStatus = ['confirmed', 'tentative'].includes(status) ? status : undefined;
  await execute(
    `UPDATE studio_bookings SET title=?, booking_type=?, project_id=?, episode_id=?, all_day=?,
     start_time=?, end_time=?, location_note=?, notes=?,
     ${bookingStatus ? 'status=?,' : ''} updated_at=NOW(), updated_by=? WHERE id=?`,
    bookingStatus
      ? [title, booking_type || 'other', project_id || null, episode_id || null,
         all_day ? 1 : 0, start_time, end_time, location_note || null, notes || null, bookingStatus, req.user!.id, req.params.id]
      : [title, booking_type || 'other', project_id || null, episode_id || null,
         all_day ? 1 : 0, start_time, end_time, location_note || null, notes || null, req.user!.id, req.params.id]
  );

  // Replace room associations
  if (Array.isArray(room_details) || Array.isArray(room_ids)) {
    await execute('DELETE FROM studio_booking_rooms WHERE booking_id = ?', [req.params.id]);
    if (Array.isArray(room_details) && room_details.length > 0) {
      for (const rd of room_details) {
        await execute(`INSERT INTO studio_booking_rooms (booking_id, room_id, occupant, usage_note) VALUES (?, ?, ?, ?)`,
          [req.params.id, rd.room_id, rd.occupant || null, rd.usage_note || null]);
      }
    } else if (Array.isArray(room_ids)) {
      for (const roomId of room_ids) {
        await execute(`INSERT INTO studio_booking_rooms (booking_id, room_id) VALUES (?, ?)`, [req.params.id, roomId]);
      }
    }
  }

  const row = await queryOne('SELECT * FROM studio_bookings WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /studios/bookings/:id
router.delete('/bookings/:id', requirePermission('studio', 'manager'), async (req, res) => {
  await execute(`UPDATE studio_bookings SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
