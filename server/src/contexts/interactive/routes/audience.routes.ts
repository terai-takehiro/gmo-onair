import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// 注意: 全て認証不要（QRコードからアクセス）

// ──────────────────────────────────────────────
// イベント情報取得 (視聴者向け)
// ──────────────────────────────────────────────
router.get('/events/:id', wrap(async (req, res) => {
  const channelId = req.query.ch as string | undefined;

  const row = await queryOne(
    `SELECT id, title, description, status, accepting,
            youtube_url, banner_url, admin_comment, survey_url
     FROM interactive_events WHERE id = ? AND deleted_at IS NULL`,
    [req.params.id]
  ) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  // チャンネル上書き
  let channel: any = null;
  try {
    if (channelId) {
      channel = await queryOne(
        'SELECT * FROM interactive_channels WHERE id = ? AND event_id = ? AND is_active = true',
        [channelId, req.params.id]
      );
    }
    if (!channel) {
      channel = await queryOne(
        'SELECT * FROM interactive_channels WHERE event_id = ? AND is_active = true ORDER BY sort_order LIMIT 1',
        [req.params.id]
      );
    }
  } catch { /* OK */ }

  const stamps = await queryAll(
    'SELECT id, label, emoji, color, animation, sort_order, image_url FROM interactive_stamps WHERE event_id = ? AND is_active = true ORDER BY sort_order',
    [req.params.id]
  );

  res.json({
    success: true,
    data: {
      title: row.title,
      status: row.status,
      accepting: row.accepting ?? false,
      youtube_url: channel?.youtube_url || row.youtube_url || null,
      banner_url: channel?.banner_url || row.banner_url || null,
      admin_comment: channel?.admin_comment || row.admin_comment || null,
      survey_url: channel?.survey_url || row.survey_url || null,
      stamps,
    },
  });
}));

// ──────────────────────────────────────────────
// セッション作成
// ──────────────────────────────────────────────
router.post('/events/:id/join', wrap(async (req, res) => {
  const event = await queryOne(
    'SELECT id, status, max_connections FROM interactive_events WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  ) as any;
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const sessionToken = crypto.randomBytes(32).toString('hex');
  await execute(
    `INSERT INTO interactive_sessions (id, event_id, session_token, user_agent)
     VALUES (gen_random_uuid(), ?, ?, ?)`,
    [req.params.id, sessionToken, String(req.headers['user-agent'] || '').slice(0, 500)]
  );

  res.status(201).json({ success: true, data: { session_token: sessionToken } });
}));

// ──────────────────────────────────────────────
// スタンプ送信 (HTTP fallback)
// ──────────────────────────────────────────────
router.post('/events/:id/stamp', wrap(async (req, res) => {
  const { stamp_id } = req.body;
  if (!stamp_id) throw new AppError(400, 'VALIDATION_ERROR', 'stamp_idは必須です');

  const bucketAt = new Date();
  bucketAt.setSeconds(0, 0);

  await execute(
    `INSERT INTO interactive_stamp_counts (id, stamp_id, event_id, count, bucket_at)
     VALUES (gen_random_uuid(), ?, ?, 1, ?)
     ON CONFLICT (stamp_id, bucket_at)
     DO UPDATE SET count = interactive_stamp_counts.count + 1`,
    [stamp_id, req.params.id, bucketAt.toISOString()]
  );

  res.json({ success: true });
}));

// ──────────────────────────────────────────────
// QRコード (認証不要 — imgタグで直接表示)
// ──────────────────────────────────────────────
router.get('/events/:id/qr', wrap(async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${clientUrl}/interactive/audience/${req.params.id}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
}));

router.get('/events/:id/channels/:channelId/qr', wrap(async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${clientUrl}/interactive/audience/${req.params.id}?ch=${req.params.channelId}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
}));

export default router;
