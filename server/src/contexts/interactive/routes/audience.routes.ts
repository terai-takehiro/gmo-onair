import { Router } from 'express';
import crypto from 'crypto';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// 注意: 視聴者APIは認証不要（QRコードからアクセス）

// イベント情報取得 (視聴者向け・限定情報のみ)
router.get('/events/:id', async (req, res) => {
  const row = await queryOne(
    `SELECT id, title, description, status, config FROM interactive_events WHERE id = ? AND deleted_at IS NULL`,
    [req.params.id]
  ) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  if (row.status !== 'live' && row.status !== 'draft') {
    throw new AppError(403, 'EVENT_ENDED', 'このイベントは終了しました');
  }

  const stamps = await queryAll(
    'SELECT id, label, emoji, color, animation, sort_order FROM interactive_stamps WHERE event_id = ? AND is_active = true ORDER BY sort_order',
    [req.params.id]
  );

  res.json({ success: true, data: { ...row, stamps } });
});

// セッション作成 (視聴者が接続)
router.post('/events/:id/join', async (req, res) => {
  const eventId = req.params.id;
  const event = await queryOne(
    'SELECT id, status, max_connections FROM interactive_events WHERE id = ? AND deleted_at IS NULL',
    [eventId]
  ) as any;
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  // 同時接続数チェック
  const activeCount = ((await queryOne(
    'SELECT COUNT(*) as c FROM interactive_sessions WHERE event_id = ? AND disconnected_at IS NULL',
    [eventId]
  )) as any).c;
  if (activeCount >= event.max_connections) {
    throw new AppError(429, 'MAX_CONNECTIONS', '接続数の上限に達しました');
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const { nickname } = req.body;
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);

  await execute(
    `INSERT INTO interactive_sessions (id, event_id, session_token, nickname, user_agent) VALUES (gen_random_uuid(), ?, ?, ?, ?)`,
    [eventId, sessionToken, nickname ? String(nickname).slice(0, 50) : null, userAgent]
  );

  res.status(201).json({ success: true, data: { session_token: sessionToken } });
});

// スタンプ送信 (HTTP fallback — Socket.IOが使えない場合)
router.post('/events/:id/stamp', async (req, res) => {
  const { stamp_id, session_token } = req.body;
  if (!stamp_id || !session_token) {
    throw new AppError(400, 'VALIDATION_ERROR', 'stamp_idとsession_tokenは必須です');
  }

  // セッション検証
  const session = await queryOne(
    'SELECT id FROM interactive_sessions WHERE session_token = ? AND event_id = ? AND disconnected_at IS NULL',
    [session_token, req.params.id]
  );
  if (!session) throw new AppError(403, 'INVALID_SESSION', '無効なセッションです');

  // スタンプ存在チェック
  const stamp = await queryOne(
    'SELECT id FROM interactive_stamps WHERE id = ? AND event_id = ? AND is_active = true',
    [stamp_id, req.params.id]
  );
  if (!stamp) throw new AppError(404, 'NOT_FOUND', 'スタンプが見つかりません');

  // 1分バケットに集計 (UPSERT)
  const bucketAt = new Date();
  bucketAt.setSeconds(0, 0);

  await execute(
    `INSERT INTO interactive_stamp_counts (id, stamp_id, event_id, count, bucket_at)
     VALUES (gen_random_uuid(), ?, ?, 1, ?)
     ON CONFLICT ON CONSTRAINT interactive_stamp_counts_bucket_unique
     DO UPDATE SET count = interactive_stamp_counts.count + 1`,
    [stamp_id, req.params.id, bucketAt.toISOString()]
  );

  res.json({ success: true });
});

// セッション切断
router.post('/events/:id/leave', async (req, res) => {
  const { session_token } = req.body;
  if (!session_token) throw new AppError(400, 'VALIDATION_ERROR', 'session_tokenは必須です');

  await execute(
    'UPDATE interactive_sessions SET disconnected_at = NOW() WHERE session_token = ? AND event_id = ?',
    [session_token, req.params.id]
  );

  res.json({ success: true });
});

export default router;
