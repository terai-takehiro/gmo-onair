import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();

router.use(requireAuth, requirePermission('interactive'));

// チャンネル一覧
router.get('/events/:eventId/channels', async (req: Request, res: Response) => {
  const channels = await queryAll(
    'SELECT * FROM interactive_channels WHERE event_id = $1 ORDER BY sort_order, created_at',
    [req.params.eventId]
  );
  res.json({ success: true, data: channels });
});

// チャンネル作成
router.post('/events/:eventId/channels', async (req: Request, res: Response) => {
  const id = uuid();
  const { name, language_code, youtube_url, banner_url, admin_comment, survey_url } = req.body;

  const maxOrder = await queryOne(
    'SELECT COALESCE(MAX(sort_order), -1)::int + 1 as next FROM interactive_channels WHERE event_id = $1',
    [req.params.eventId]
  ) as any;

  await execute(
    `INSERT INTO interactive_channels (id, event_id, name, language_code, youtube_url, banner_url, admin_comment, survey_url, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, req.params.eventId, name || 'デフォルト', language_code || 'ja',
     youtube_url || null, banner_url || null, admin_comment || null, survey_url || null,
     maxOrder?.next || 0]
  );

  const row = await queryOne('SELECT * FROM interactive_channels WHERE id = $1', [id]);
  res.status(201).json({ success: true, data: row });
});

// チャンネル更新
router.put('/channels/:id', async (req: Request, res: Response) => {
  const { name, language_code, youtube_url, banner_url, admin_comment, survey_url, is_active } = req.body;

  await execute(
    `UPDATE interactive_channels
     SET name = COALESCE($1, name), language_code = COALESCE($2, language_code),
         youtube_url = $3, banner_url = $4, admin_comment = $5, survey_url = $6,
         is_active = COALESCE($7, is_active), updated_at = NOW()
     WHERE id = $8`,
    [name, language_code, youtube_url ?? null, banner_url ?? null,
     admin_comment ?? null, survey_url ?? null, is_active, req.params.id]
  );

  const row = await queryOne('SELECT * FROM interactive_channels WHERE id = $1', [req.params.id]);
  if (!row) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'チャンネルが見つかりません' } });
    return;
  }
  res.json({ success: true, data: row });
});

// チャンネル削除
router.delete('/channels/:id', async (req: Request, res: Response) => {
  await execute('DELETE FROM interactive_channels WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

export default router;
