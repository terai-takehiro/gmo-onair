import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Async wrapper
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// 全ルートに認証 + interactive権限
router.use(requireAuth, requirePermission('interactive'));

// ──────────────────────────────────────────────
// イベント一覧
// ──────────────────────────────────────────────
router.get('/', wrap(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '');
  const params: unknown[] = [];
  let where = 'WHERE e.deleted_at IS NULL';

  if (search) {
    params.push(`%${search}%`);
    where += ` AND e.title ILIKE ?`;
  }
  if (['draft', 'live', 'ended', 'archived'].includes(status)) {
    params.push(status);
    where += ' AND e.status = ?';
  }

  const rows = await queryAll(
    `SELECT e.id, e.title, e.description, e.status, e.project_id, e.episode_id,
            e.max_connections, e.accepting, e.created_at,
            p.name as project_name, p.gls_number,
            (SELECT COUNT(*)::int FROM interactive_stamps s WHERE s.event_id = e.id) as stamp_count
     FROM interactive_events e
     LEFT JOIN projects p ON p.id = e.project_id
     ${where}
     ORDER BY e.created_at DESC
     LIMIT 100`,
    params
  );

  res.json({ success: true, data: rows });
}));

// ──────────────────────────────────────────────
// イベント詳細
// ──────────────────────────────────────────────
router.get('/:id', wrap(async (req, res) => {
  const row = await queryOne(
    `SELECT e.*, p.name as project_name, p.gls_number
     FROM interactive_events e
     LEFT JOIN projects p ON p.id = e.project_id
     WHERE e.id = ? AND e.deleted_at IS NULL`,
    [req.params.id]
  ) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const stamps = await queryAll(
    'SELECT * FROM interactive_stamps WHERE event_id = ? ORDER BY sort_order',
    [req.params.id]
  );
  row.stamps = stamps;

  let channels: any[] = [];
  try {
    channels = await queryAll(
      'SELECT * FROM interactive_channels WHERE event_id = ? ORDER BY sort_order, created_at',
      [req.params.id]
    );
  } catch { /* table may not exist */ }
  row.channels = channels;

  res.json({ success: true, data: row });
}));

// ──────────────────────────────────────────────
// イベント作成
// ──────────────────────────────────────────────
router.post('/', wrap(async (req, res) => {
  const { title, description, project_id, episode_id, max_connections } = req.body;
  if (!title?.trim()) throw new AppError(400, 'VALIDATION_ERROR', 'タイトルは必須です');

  const id = uuidv4();
  await execute(
    `INSERT INTO interactive_events (id, title, description, project_id, episode_id, max_connections, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, String(title).slice(0, 500), description || null, project_id || null, episode_id || null,
     Math.min(Math.max(Number(max_connections) || 1000, 1), 10000), req.user!.id]
  );

  // デフォルトチャンネル作成
  try {
    await execute(
      'INSERT INTO interactive_channels (id, event_id, name, language_code, sort_order) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), id, 'メイン', 'ja', 0]
    );
  } catch { /* OK */ }

  const row = await queryOne('SELECT * FROM interactive_events WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
}));

// ──────────────────────────────────────────────
// イベント更新
// ──────────────────────────────────────────────
router.put('/:id', wrap(async (req, res) => {
  const existing = await queryOne(
    'SELECT * FROM interactive_events WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  ) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const b = req.body;
  await execute(
    `UPDATE interactive_events SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       project_id = COALESCE(?, project_id),
       episode_id = COALESCE(?, episode_id),
       max_connections = COALESCE(?, max_connections),
       youtube_url = COALESCE(?, youtube_url),
       banner_url = COALESCE(?, banner_url),
       admin_comment = COALESCE(?, admin_comment),
       survey_url = COALESCE(?, survey_url),
       accepting = COALESCE(?, accepting),
       updated_by = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      b.title || null, b.description !== undefined ? b.description : null,
      b.project_id !== undefined ? b.project_id : null,
      b.episode_id !== undefined ? b.episode_id : null,
      b.max_connections ? Number(b.max_connections) : null,
      b.youtube_url !== undefined ? b.youtube_url : null,
      b.banner_url !== undefined ? b.banner_url : null,
      b.admin_comment !== undefined ? b.admin_comment : null,
      b.survey_url !== undefined ? b.survey_url : null,
      b.accepting !== undefined ? b.accepting : null,
      req.user!.id, req.params.id,
    ]
  );

  const row = await queryOne('SELECT * FROM interactive_events WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
}));

// ──────────────────────────────────────────────
// イベント開始 (draft → live)
// ──────────────────────────────────────────────
router.post('/:id/start', wrap(async (req, res) => {
  await execute(
    `UPDATE interactive_events SET status = 'live', accepting = true, started_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [req.params.id]
  );
  res.json({ success: true });
}));

// ──────────────────────────────────────────────
// イベント終了 (live → ended)
// ──────────────────────────────────────────────
router.post('/:id/stop', wrap(async (req, res) => {
  await execute(
    `UPDATE interactive_events SET status = 'ended', accepting = false, ended_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [req.params.id]
  );
  res.json({ success: true });
}));

// ──────────────────────────────────────────────
// イベント削除 (soft delete)
// ──────────────────────────────────────────────
router.delete('/:id', wrap(async (req, res) => {
  await execute(
    'UPDATE interactive_events SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  );
  res.json({ success: true });
}));

// ──────────────────────────────────────────────
// 統計
// ──────────────────────────────────────────────
router.get('/:id/stats', wrap(async (req, res) => {
  const stamps = await queryAll(
    `SELECT s.id, s.label, s.emoji, s.color, COALESCE(SUM(sc.count)::int, 0) as total
     FROM interactive_stamps s
     LEFT JOIN interactive_stamp_counts sc ON sc.stamp_id = s.id
     WHERE s.event_id = ?
     GROUP BY s.id, s.label, s.emoji, s.color
     ORDER BY s.sort_order`,
    [req.params.id]
  );

  const sessions = await queryOne(
    `SELECT COUNT(*)::int as total, COUNT(CASE WHEN disconnected_at IS NULL THEN 1 END)::int as active
     FROM interactive_sessions WHERE event_id = ?`,
    [req.params.id]
  ) as any;

  res.json({ success: true, data: { stamps, sessions: sessions || { total: 0, active: 0 } } });
}));

// ──────────────────────────────────────────────
// QRコード
// ──────────────────────────────────────────────
router.get('/:id/qr', wrap(async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${clientUrl}/interactive/audience/${req.params.id}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
}));

router.get('/:id/channels/:channelId/qr', wrap(async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${clientUrl}/interactive/audience/${req.params.id}?ch=${req.params.channelId}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
}));

export default router;
