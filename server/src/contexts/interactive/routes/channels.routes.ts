import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('interactive'));

// チャンネル一覧
router.get('/events/:eventId/channels', wrap(async (req, res) => {
  const channels = await queryAll(
    'SELECT * FROM interactive_channels WHERE event_id = ? ORDER BY sort_order, created_at',
    [req.params.eventId]
  );
  res.json({ success: true, data: channels });
}));

// チャンネル作成
router.post('/events/:eventId/channels', wrap(async (req, res) => {
  const id = uuid();
  const { name, language_code, youtube_url, banner_url, admin_comment, survey_url } = req.body;

  const maxOrder = await queryOne(
    'SELECT COALESCE(MAX(sort_order), -1)::int + 1 as next FROM interactive_channels WHERE event_id = ?',
    [req.params.eventId]
  ) as any;

  await execute(
    `INSERT INTO interactive_channels (id, event_id, name, language_code, youtube_url, banner_url, admin_comment, survey_url, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.eventId, name || 'デフォルト', language_code || 'ja',
     youtube_url || null, banner_url || null, admin_comment || null, survey_url || null,
     maxOrder?.next || 0]
  );

  const row = await queryOne('SELECT * FROM interactive_channels WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
}));

// チャンネル更新
router.put('/channels/:id', wrap(async (req, res) => {
  const b = req.body;
  await execute(
    `UPDATE interactive_channels SET
       name = COALESCE(?, name), language_code = COALESCE(?, language_code),
       youtube_url = ?, banner_url = ?, admin_comment = ?, survey_url = ?,
       is_active = COALESCE(?, is_active), updated_at = NOW()
     WHERE id = ?`,
    [b.name || null, b.language_code || null,
     b.youtube_url ?? null, b.banner_url ?? null, b.admin_comment ?? null, b.survey_url ?? null,
     b.is_active !== undefined ? b.is_active : null, req.params.id]
  );

  const row = await queryOne('SELECT * FROM interactive_channels WHERE id = ?', [req.params.id]);
  if (!row) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'チャンネルが見つかりません' } });
    return;
  }
  res.json({ success: true, data: row });
}));

// チャンネル削除
router.delete('/channels/:id', wrap(async (req, res) => {
  await execute('DELETE FROM interactive_channels WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));

export default router;
