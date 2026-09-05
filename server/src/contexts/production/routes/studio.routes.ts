import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission, requireRole } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateICalFeed, ICalEvent } from '../../../shared/utils/ical';
import { studioBookingService, resolveAssigneeIds, replaceAssignees, fetchAssigneesByBookingIds } from '../services/studio-booking.service';
import { checkBooking, locationOfBooking, stampOutOfHours } from '../services/business-hours.service';
import { checkPossibleDuplicate, stampPossibleDuplicate } from '../services/booking-duplicate.service';
import { syncProjectEventDates } from '../services/project-event-dates.service';
import { isReversedTimeRange } from '../../../shared/utils/timeRange';
import { jstDate } from '../../../shared/utils/jst';
import type { HoursCheck } from '../../../shared/services/businessHours';
import type { DuplicateResult } from '../../../shared/services/bookingDuplicate';

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

/** カレンダーフィードの対象期間 (過去3ヶ月〜未来1年) を YYYY-MM-DD の文字列で返す。
 *  TEXT 列 (start_time/end_time) と文字列比較するため timestamptz 化しない。 */
function calendarWindow(): { fromDate: string; toDate: string } {
  const now = new Date();
  const from = new Date(now); from.setMonth(from.getMonth() - 3);
  const to = new Date(now); to.setFullYear(to.getFullYear() + 1);
  return { fromDate: from.toISOString().slice(0, 10), toDate: to.toISOString().slice(0, 10) };
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
    const { fromDate, toDate } = calendarWindow();
    const c = (await queryOne(
      `SELECT COUNT(*)::int AS c FROM studio_bookings
       WHERE deleted_at IS NULL
         AND substr(COALESCE(NULLIF(end_time, ''), start_time), 1, 10) >= ?
         AND substr(start_time, 1, 10) <= ?`,
      [fromDate, toDate],
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
  // start_time/end_time は TEXT (ISO 文字列) 列なので、timestamptz の NOW()-interval と
  // 直接比較すると Postgres が `operator does not exist: text >= timestamp with time zone`
  // で 500 になる (= カレンダーが全クライアントで登録できなかった根本原因)。
  // 日付先頭10桁 (YYYY-MM-DD) 同士の文字列比較にして型不一致とセパレータ差異を回避する。
  const { fromDate, toDate } = calendarWindow();
  const bookings = await queryAll(
    `SELECT b.id, b.title, b.booking_type, b.start_time, b.end_time, b.all_day,
            b.location_note, b.notes, b.created_at, b.updated_at,
            b.project_id, p.name as project_name, p.gls_number
     FROM studio_bookings b
     LEFT JOIN projects p ON p.id = b.project_id
     WHERE b.deleted_at IS NULL
       AND substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10) >= ?
       AND substr(b.start_time, 1, 10) <= ?
     ORDER BY b.start_time`,
    [fromDate, toDate],
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

  // 予約種別ラベル (StudioBookingDialog の bookingTypeOptions と一致させること)
  const BOOKING_TYPE_LABELS: Record<string, string> = {
    performance: '本番', rehearsal: 'リハーサル', hold: '仮押さえ', tour: '内覧',
    consultation: '相談', setup: '設営/準備', maintenance: 'メンテナンス',
    internal: '社内利用', other: 'その他',
  };
  const appBaseUrl = process.env.CLIENT_URL || 'https://gmo-onair.jp';

  const events: ICalEvent[] = bookings.map((b) => {
    const rooms = roomsByBooking.get(b.id) || [];
    const occupants = [...new Set(rooms.map((r) => r.occupant).filter(Boolean))];
    const usageNotes = [...new Set(rooms.map((r) => r.usage_note).filter(Boolean))];

    // タイトル: 【予約種別】タイトル (部屋の羅列は本文へ移して見やすく)
    const typeLabel = BOOKING_TYPE_LABELS[b.booking_type] || '';
    const summary = typeLabel ? `【${typeLabel}】${b.title || ''}`.trim() : (b.title || '');

    // 場所: 建物 (拠点) 名のみ。外現場等の手入力 (location_note) があればそれも併記。
    const buildings = [...new Set(rooms.map((r) => r.location_name).filter(Boolean))];
    const locationParts = [...buildings];
    if (b.location_note) locationParts.push(b.location_note);

    // 本文: 案件 (GLS + 案件ページURL) → 部屋の詳細 (1部屋1行) → 使用者/メモ/備考
    const parts: string[] = [];
    if (b.project_name) {
      parts.push(b.gls_number ? `[${b.gls_number}] ${b.project_name}` : b.project_name);
      if (b.project_id) parts.push(`案件ページ: ${appBaseUrl}/sales/projects/${b.project_id}`);
      parts.push('');
    }
    if (rooms.length) {
      parts.push('■ 使用する部屋');
      for (const r of rooms) {
        const detail = [r.occupant && `使用者: ${r.occupant}`, r.usage_note].filter(Boolean).join(' / ');
        parts.push(`・${r.location_name ? `${r.location_name} - ` : ''}${r.room_name}${detail ? `（${detail}）` : ''}`);
      }
      parts.push('');
    } else {
      if (occupants.length) parts.push(`使用者: ${occupants.join(', ')}`);
      if (usageNotes.length) parts.push(usageNotes.join('\n'));
    }
    if (b.location_note) parts.push(`場所メモ: ${b.location_note}`);
    if (b.notes) parts.push(b.notes);
    while (parts.length && parts[parts.length - 1] === '') parts.pop();

    return {
      uid: `booking-${b.id}@gmo-onair.jp`,
      summary,
      description: parts.join('\n') || undefined,
      location: locationParts.join(' / ') || undefined,
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
router.get('/rooms/feeds', requireAuth, requirePermission('sales'), async (_req, res) => {
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
router.use(requireAuth, requirePermission('sales'));

// ============================================================
// Studio Locations & Rooms
// ============================================================

// GET /studios/locations — ロケーション＋部屋一覧
router.get('/locations', async (_req, res) => {
  const result = await studioBookingService.listRooms();
  res.json({ success: true, data: result });
});

// ロケーション・部屋の追加/更新/削除は system_admin 専用
const adminOnly = requireRole('system_admin');

/** 略称は**空文字を保存しない**（NULL = 決めていない、と区別する。migration 189） */
const normalizeAbbr = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
};

// POST /studios/locations — ロケーション追加
router.post('/locations', adminOnly, async (req, res) => {
  const { name, sort_order, abbreviation } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  const id = uuidv4();
  await execute(
    `INSERT INTO studio_locations (id, name, sort_order, abbreviation) VALUES (?, ?, ?, ?)`,
    [id, name, sort_order ?? 0, normalizeAbbr(abbreviation)],
  );
  const row = await queryOne('SELECT * FROM studio_locations WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /studios/locations/:id
router.put('/locations/:id', adminOnly, async (req, res) => {
  const { name, sort_order, abbreviation } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
  /*
   * **`abbreviation` を渡さなければ今の値を保つ**（この製品の決めごと）。
   * 全置換にすると、**この欄を持たない古い呼び出しから拠点名を直すだけで
   * 略称が黙って消えます**（タグ・リード経路・グループ区分と同じ壊れ方）。
   * 消したいときは空文字を渡す＝ NULL になる
   */
  const sets = ['name = ?', 'sort_order = ?'];
  const params: unknown[] = [name, sort_order ?? 0];
  if (abbreviation !== undefined) { sets.push('abbreviation = ?'); params.push(normalizeAbbr(abbreviation)); }
  params.push(req.params.id);
  await execute(`UPDATE studio_locations SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, params);
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
  const result = await studioBookingService.listBookings({
    from: req.query.from as string,
    to: req.query.to as string,
    roomId: req.query.room_id as string,
    projectId: req.query.project_id as string,
    status: req.query.status as string,
  });
  res.json({ success: true, data: result });
});

// GET /studios/bookings/availability?from=&to=&room_id= — 空き照会 (部屋ごとの busy / 終日空き日)
// ※ /bookings/:id より前に定義すること (:id に "availability" が捕捉されないように)
router.get('/bookings/availability', async (req, res) => {
  const today = jstDate();
  const from = (req.query.from as string) || today;
  const to = (req.query.to as string) || from;
  const result = await studioBookingService.getAvailability({
    from, to, roomId: req.query.room_id as string,
  });
  res.json({ success: true, data: result });
});

// GET /studios/bookings/possible-duplicates/list — 重複疑いの一覧（あとから拾うため）
// ※ /bookings/:id より前に定義すること (:id に "possible-duplicates" が捕捉されないように)
router.get('/bookings/possible-duplicates/list', async (req, res) => {
  const from = String(req.query.from ?? '');
  const rows = await queryAll(
    `SELECT b.id, b.title, b.start_time, b.end_time, b.status, b.possible_duplicate_reason,
            b.project_id, p.name AS project_name, p.gls_number,
            o.id AS of_id, o.title AS of_title, o.start_time AS of_start_time, o.end_time AS of_end_time
       FROM studio_bookings b
       LEFT JOIN projects p ON p.id = b.project_id
       LEFT JOIN studio_bookings o ON o.id = b.possible_duplicate_of
      WHERE b.deleted_at IS NULL AND b.possible_duplicate = TRUE
        ${from ? 'AND substr(b.start_time, 1, 10) >= ?' : ''}
      ORDER BY b.start_time`,
    from ? [from] : [],
  );
  res.json({ success: true, data: rows });
});

// PATCH /studios/bookings/:id/dismiss-duplicate — 「重複ではない」と人が判断した印を外す
// （保存は止めていないので、確認した結果を消すためだけの専用口。他の項目は変えない）
router.patch('/bookings/:id/dismiss-duplicate', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM studio_bookings WHERE id = ? AND deleted_at IS NULL', [req.params.id],
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予約が見つかりません');
  await execute(
    `UPDATE studio_bookings
        SET possible_duplicate = FALSE, possible_duplicate_of = NULL, possible_duplicate_reason = NULL,
            updated_at = NOW(), updated_by = ?
      WHERE id = ?`,
    [req.user!.id, req.params.id],
  );
  res.json({ success: true, message: '重複の印を外しました' });
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
    // 一覧（`listBookings`）と**同じ項目**を返す。片方だけ持たせると、
    // 「一覧では拠点が出るのに1件だけ開くと出ない」という食い違いになる
    `SELECT br.room_id, br.occupant, br.usage_note,
            r.name as room_name, r.abbreviation as room_abbreviation,
            r.color as room_color, r.room_type, r.location_id,
            l.name as location_name, l.abbreviation as location_abbreviation
     FROM studio_booking_rooms br
     JOIN studio_rooms r ON r.id = br.room_id
     LEFT JOIN studio_locations l ON l.id = r.location_id
     WHERE br.booking_id = ?
     ORDER BY l.sort_order NULLS LAST, r.sort_order, r.name`, [req.params.id]
  );
  booking.rooms = rooms;
  booking.assignees = (await fetchAssigneesByBookingIds([req.params.id])).get(req.params.id) ?? [];
  res.json({ success: true, data: booking });
});

// POST /studios/bookings — 予約作成
router.post('/bookings', requirePermission('sales', 'editor'), async (req, res) => {
  const row = await studioBookingService.createBooking(req.body, req.user!.id);
  res.status(201).json({ success: true, data: row });
});

// PUT /studios/bookings/:id — 予約更新
router.put('/bookings/:id', requirePermission('sales', 'editor'), async (req, res) => {
  // **元の案件も控える。** 予約を別の案件に付け替えると、**元の案件と付け替え先の
  // 両方**の実施日が変わる（元の案件はその予約が無くなった期間で引き直す）
  const existing = await queryOne(
    'SELECT id, project_id, start_time, end_time FROM studio_bookings WHERE id = ? AND deleted_at IS NULL', [req.params.id],
  ) as { id: string; project_id: string | null; start_time: string; end_time: string } | undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予約が見つかりません');

  /**
   * **渡さなかった項目は今の値を保つ** (v4 カレンダー③)。
   *
   * ここは元は**全置換**でした。`{ status: 'confirmed' }` だけを送ると
   * 件名・日時・部屋が空で上書きされ、**予約が壊れます**
   * （`start_time` は NOT NULL なので運が良ければ 500、悪ければ空の予約が残る）。
   * 仮押さえの一覧から「確定にする」だけを送りたいので、部分更新にしました。
   * **全部を送っている既存の呼び出しは今までどおり動きます。**
   */
  const b = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col}=?`); params.push(v); };

  // **渡さなかった側は今の値のまま**で比べる — 「終了だけ延ばす」部分更新
  // （週表の下端ドラッグ）が既存の開始と比べずに通ってしまわないようにする
  const effectiveStart = b.start_time !== undefined ? String(b.start_time) : existing.start_time;
  const effectiveEnd = b.end_time !== undefined ? String(b.end_time) : existing.end_time;
  if (isReversedTimeRange(effectiveStart, effectiveEnd)) {
    throw new AppError(400, 'VALIDATION_ERROR', '終了は開始より後にしてください');
  }

  if (b.title !== undefined) set('title', b.title);
  if (b.booking_type !== undefined) set('booking_type', b.booking_type || 'other');
  if (b.project_id !== undefined) set('project_id', b.project_id || null);
  if (b.episode_id !== undefined) set('episode_id', b.episode_id || null);
  if (b.all_day !== undefined) set('all_day', b.all_day ? 1 : 0);
  if (b.start_time !== undefined) set('start_time', b.start_time);
  if (b.end_time !== undefined) set('end_time', b.end_time);
  if (b.location_note !== undefined) set('location_note', b.location_note || null);
  if (b.notes !== undefined) set('notes', b.notes || null);
  // **知らない状態名は素通しさせない**（黙って別の状態になるより、変わらないほうがよい）
  if (b.status === 'confirmed' || b.status === 'tentative') set('status', b.status);
  // 仮押さえの何番手か。明示の null / 0以下は「番手を決めていない（消す）」として NULL に落とす
  if (b.hold_rank !== undefined) {
    set('hold_rank', typeof b.hold_rank === 'number' && b.hold_rank > 0 ? b.hold_rank : null);
  }

  const { room_ids, room_details } = b as { room_ids?: unknown; room_details?: unknown };
  // 書き込みの前に検証する（無効な担当者IDで途中まで書いてしまわないように）
  const assigneeIds = await resolveAssigneeIds(b.assignee_user_ids);

  if (sets.length > 0) {
    sets.push('updated_at=NOW()');
    set('updated_by', req.user!.id);
    params.push(req.params.id);
    await execute(`UPDATE studio_bookings SET ${sets.join(', ')} WHERE id=?`, params);
  }

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

  await replaceAssignees(String(req.params.id), assigneeIds);

  /**
   * ⚠️ **時間外の印を付け直す**（レビューでの指摘 #63）。
   *
   * 印を書いていたのは**作るときだけ**でした。直したときに見直さないので:
   *
   * ・22:00 → 14:00 に**動かしても印が残り**、時間外の一覧に出続けます
   *   （連絡する必要が無いものを毎回확かめることになる）
   * ・**14:00 → 22:00 に動かしても印が付きません**。こちらが本命の壊れ方で、
   *   **時間外の一覧に一度も出ない** — 一覧は「あとから拾って個別に連絡する」
   *   ためのものなので、出ないものは**無いことになります**
   *
   * 部屋を替えると拠点が変わる（拠点ごとに営業時間が違う）ので、
   * **時刻を直したときと部屋を替えたときの両方**で見直します。
   * 拠点が分からない予約は今までどおり判定しません（`checkBooking` が false を返す）。
   */
  const timeChanged = b.start_time !== undefined || b.end_time !== undefined;
  const roomsChanged = Array.isArray(room_details) || Array.isArray(room_ids);
  const after = await queryOne(
    'SELECT * FROM studio_bookings WHERE id = ?', [req.params.id],
  ) as Record<string, unknown>;

  /*
   * **案件の実施日を引き直す**（`project-event-dates.service.ts`）。
   * 日付・種別・案件のどれを直しても期間が変わりうるので、**毎回**回す
   * （値が変わらなければ書かないので、保存し直しでは何も起きない）。
   * 付け替えたときは元の案件も引き直す（`existing.project_id`）。
   */
  await syncProjectEventDates(after.project_id as string | null, req.user!.id);
  if (existing.project_id && existing.project_id !== after.project_id) {
    await syncProjectEventDates(existing.project_id, req.user!.id);
  }

  let hoursCheck: HoursCheck | null = null;
  if (timeChanged || roomsChanged) {
    // **部屋を入れ替えたあとの拠点**を見る（入れ替えは上で済んでいる）
    const loc = await locationOfBooking(String(req.params.id));
    hoursCheck = await checkBooking(
      loc, String(after.start_time), after.end_time ? String(after.end_time) : null,
    );
    // **中に戻したときも書き直す。** `stampOutOfHours` は false も書くので印が外れる
    await stampOutOfHours(String(req.params.id), hoursCheck);
    after.out_of_hours = hoursCheck.outside;
    after.out_of_hours_reason = hoursCheck.outside ? hoursCheck.reason : null;
  }

  /**
   * ⚠️ **重複疑いの印も付け直す**（out_of_hours と同じ理由・レビューでの指摘 #63 を踏襲）。
   * 題名・時刻・部屋・案件のどれを直しても「重複しているように見えるか」は変わりうるので、
   * この4つのどれかが変わったときは毎回見直す。直して重複が解消したときも
   * `stampPossibleDuplicate` が false を書くので印が外れる。
   */
  const titleChanged = b.title !== undefined;
  const projectChanged = b.project_id !== undefined;
  let duplicateCheck: DuplicateResult | null = null;
  if (timeChanged || roomsChanged || titleChanged || projectChanged) {
    const roomIdsAfter = ((await queryAll(
      `SELECT room_id FROM studio_booking_rooms WHERE booking_id = ?`, [req.params.id],
    )) as Array<{ room_id: string }>).map((r) => r.room_id);
    duplicateCheck = await checkPossibleDuplicate({
      id: String(req.params.id),
      title: String(after.title),
      project_id: (after.project_id as string | null) ?? null,
      start_time: String(after.start_time),
      end_time: after.end_time ? String(after.end_time) : null,
      room_ids: roomIdsAfter,
    });
    await stampPossibleDuplicate(String(req.params.id), duplicateCheck);
    after.possible_duplicate = !!duplicateCheck;
    after.possible_duplicate_reason = duplicateCheck?.reason ?? null;
    after.possible_duplicate_of = duplicateCheck?.bookingId ?? null;
  }

  const assignees = (await fetchAssigneesByBookingIds([String(req.params.id)])).get(String(req.params.id)) ?? [];

  // 画面が注意を出せるように、判定の結果を**行とは別に**返す（作るときと同じ形）
  res.json({
    success: true,
    data: {
      ...after,
      assignees,
      ...(hoursCheck ? { hours_check: hoursCheck } : {}),
      ...(duplicateCheck !== null || timeChanged || roomsChanged || titleChanged || projectChanged
        ? { duplicate_check: duplicateCheck } : {}),
    },
  });
});

// DELETE /studios/bookings/:id
router.delete('/bookings/:id', requirePermission('sales', 'manager'), async (req, res) => {
  // 消す前に案件を控える（消したあとでは、どの案件を引き直すか分からない）
  const before = await queryOne(
    'SELECT project_id FROM studio_bookings WHERE id = ? AND deleted_at IS NULL', [req.params.id],
  ) as { project_id: string | null } | undefined;

  await execute(`UPDATE studio_bookings SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]);

  /*
   * **残った予約で実施日を引き直す。** ⚠️ 最後の1件を消したときは**触りません** —
   * 予約を消しただけで実施日まで空にすると、Excel 取込・MCP・案件作成で入れた
   * 日付が黙って消えます（`project-event-dates.service.ts` の冒頭）
   */
  await syncProjectEventDates(before?.project_id, req.user!.id);

  res.json({ success: true, message: '削除しました' });
});

export default router;
