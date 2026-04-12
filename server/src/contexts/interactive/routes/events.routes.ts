import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
router.use(requireAuth, requirePermission('interactive'));

const VALID_STATUSES = ['draft', 'live', 'ended', 'archived'];

function sanitizeSearch(s: string): string {
  return String(s).slice(0, 100).replace(/[%_\\]/g, '\\$&');
}

// イベント一覧
router.get('/', async (req, res) => {
  console.log('[interactive/events] GET / — user:', req.user?.id, 'role:', req.user?.role, 'permissions:', JSON.stringify(req.user?.permissions));
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];

  if (search) {
    const safe = sanitizeSearch(search);
    where += ` AND (title ILIKE ? ESCAPE '\\')`;
    params.push(`%${safe}%`);
  }

  const status = req.query.status as string;
  if (status && VALID_STATUSES.includes(status)) {
    where += ' AND status = ?';
    params.push(status);
  }

  const total = Number(((await queryOne(`SELECT COUNT(*)::int as c FROM interactive_events ${where}`, params)) as any)?.c || 0);
  const rows = await queryAll(
    `SELECT e.*, p.name as project_name, p.gls_number, ep.episode_code,
     (SELECT COUNT(*)::int FROM interactive_stamps WHERE event_id = e.id) as stamp_count,
     (SELECT COUNT(*)::int FROM interactive_sessions WHERE event_id = e.id AND disconnected_at IS NULL) as active_connections
     FROM interactive_events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN episodes ep ON ep.id = e.episode_id
     ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(rows, total, page, limit));
});

// イベント詳細
router.get('/:id', async (req, res) => {
  const row = await queryOne(
    `SELECT e.*, p.name as project_name, p.gls_number, ep.episode_code
     FROM interactive_events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN episodes ep ON ep.id = e.episode_id
     WHERE e.id = ? AND e.deleted_at IS NULL`,
    [req.params.id]
  ) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  // スタンプ一覧を付与
  const stamps = await queryAll(
    'SELECT * FROM interactive_stamps WHERE event_id = ? ORDER BY sort_order',
    [req.params.id]
  );
  row.stamps = stamps;

  // チャンネル一覧を付与
  try {
    const channels = await queryAll(
      'SELECT * FROM interactive_channels WHERE event_id = ? ORDER BY sort_order, created_at',
      [req.params.id]
    );
    row.channels = channels;
  } catch { row.channels = []; }

  res.json({ success: true, data: row });
});

// イベント作成
router.post('/', requirePermission('interactive', 'editor'), async (req, res) => {
  const { title, description, project_id, episode_id, config, max_connections } = req.body;
  if (!title || String(title).trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');
  }

  const id = uuidv4();
  const safeTitle = String(title).slice(0, 500);
  const safeMaxConn = Math.min(Math.max(Number(max_connections) || 1000, 1), 10000);

  await execute(
    `INSERT INTO interactive_events (id, title, description, project_id, episode_id, config, max_connections, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, safeTitle, description || null, project_id || null, episode_id || null, JSON.stringify(config || {}), safeMaxConn, req.user!.id]
  );

  // Auto-create default channel
  await execute(
    `INSERT INTO interactive_channels (id, event_id, name, language_code, sort_order) VALUES (?, ?, 'メイン', 'ja', 0)`,
    [uuidv4(), id]
  ).catch(() => { /* channel table may not exist yet */ });

  const row = await queryOne('SELECT * FROM interactive_events WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// イベント更新
router.put('/:id', requirePermission('interactive', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM interactive_events WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const { title, description, project_id, episode_id, config, max_connections, status, youtube_url, banner_url, admin_comment, accepting } = req.body;

  const safeTitle = title ? String(title).slice(0, 500) : existing.title;
  const safeStatus = status && VALID_STATUSES.includes(status) ? status : existing.status;
  const safeMaxConn = max_connections ? Math.min(Math.max(Number(max_connections), 1), 10000) : existing.max_connections;
  const safeAccepting = accepting !== undefined ? !!accepting : existing.accepting;

  await execute(
    `UPDATE interactive_events SET title=?, description=?, project_id=?, episode_id=?, config=?, max_connections=?, status=?, youtube_url=?, banner_url=?, admin_comment=?, accepting=?, updated_by=?, updated_at=NOW() WHERE id=?`,
    [
      safeTitle,
      description !== undefined ? description : existing.description,
      project_id !== undefined ? (project_id || null) : existing.project_id,
      episode_id !== undefined ? (episode_id || null) : existing.episode_id,
      JSON.stringify(config || existing.config),
      safeMaxConn,
      safeStatus,
      youtube_url !== undefined ? (youtube_url || null) : existing.youtube_url,
      banner_url !== undefined ? (banner_url || null) : existing.banner_url,
      admin_comment !== undefined ? (admin_comment || null) : existing.admin_comment,
      safeAccepting,
      req.user!.id,
      req.params.id,
    ]
  );

  const row = await queryOne('SELECT * FROM interactive_events WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// イベント開始 (status → live)
router.post('/:id/start', requirePermission('interactive', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM interactive_events WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  if (existing.status === 'live') throw new AppError(400, 'ALREADY_LIVE', 'すでにライブ中です');

  await execute(
    `UPDATE interactive_events SET status='live', started_at=NOW(), updated_by=?, updated_at=NOW() WHERE id=?`,
    [req.user!.id, req.params.id]
  );

  const row = await queryOne('SELECT * FROM interactive_events WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// イベント終了 (status → ended)
router.post('/:id/stop', requirePermission('interactive', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM interactive_events WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  await execute(
    `UPDATE interactive_events SET status='ended', ended_at=NOW(), updated_by=?, updated_at=NOW() WHERE id=?`,
    [req.user!.id, req.params.id]
  );

  const row = await queryOne('SELECT * FROM interactive_events WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// QRコード生成
router.get('/:id/qr', async (req, res) => {
  const event = await queryOne('SELECT id FROM interactive_events WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const audienceUrl = `${clientUrl}/interactive/audience/${req.params.id}`;
  const svg = await QRCode.toString(audienceUrl, { type: 'svg', margin: 1, color: { dark: '#1a2332', light: '#ffffff' } });

  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

// チャンネル別QRコード
router.get('/:id/channels/:channelId/qr', async (req, res) => {
  const event = await queryOne('SELECT id FROM interactive_events WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const audienceUrl = `${clientUrl}/interactive/audience/${req.params.id}?ch=${req.params.channelId}`;
  const svg = await QRCode.toString(audienceUrl, { type: 'svg', margin: 1, color: { dark: '#1a2332', light: '#ffffff' } });

  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

// イベント削除
router.delete('/:id', requirePermission('interactive', 'manager'), async (req, res) => {
  await execute(
    `UPDATE interactive_events SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

// イベントの統計情報
router.get('/:id/stats', async (req, res) => {
  const eventId = req.params.id;
  const existing = await queryOne('SELECT id FROM interactive_events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  // スタンプ別合計
  const stampTotals = await queryAll(
    `SELECT s.id, s.label, s.emoji, s.color, COALESCE(SUM(sc.count), 0) as total
     FROM interactive_stamps s
     LEFT JOIN interactive_stamp_counts sc ON sc.stamp_id = s.id
     WHERE s.event_id = ?
     GROUP BY s.id, s.label, s.emoji, s.color
     ORDER BY s.sort_order`,
    [eventId]
  );

  // 時系列 (1分バケット)
  const timeline = await queryAll(
    `SELECT sc.stamp_id, sc.bucket_at, sc.count
     FROM interactive_stamp_counts sc
     WHERE sc.event_id = ?
     ORDER BY sc.bucket_at ASC
     LIMIT 1440`,
    [eventId]
  );

  // 接続数
  const sessionCount = await queryOne(
    `SELECT COUNT(*)::int as total, COUNT(*)::int FILTER (WHERE disconnected_at IS NULL) as active
     FROM interactive_sessions WHERE event_id = ?`,
    [eventId]
  ) as any;

  res.json({
    success: true,
    data: {
      stamps: stampTotals,
      timeline,
      sessions: { total: sessionCount?.total || 0, active: sessionCount?.active || 0 },
    },
  });
});

export default router;
