import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  INTERACTIVE_EVENT_STATUS,
  INTERACTIVE_QUESTION_STATUS,
} from '../../../shared/constants/statuses';

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
  if ((Object.values(INTERACTIVE_EVENT_STATUS) as string[]).includes(status)) {
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
  // undefinedのフィールドは既存値を保持、空文字列はNULLとして扱う
  const val = (key: string, fallback: any) => {
    if (b[key] === undefined) return fallback;
    if (b[key] === '' || b[key] === null) return null;
    return b[key];
  };

  await execute(
    `UPDATE interactive_events SET
       title = ?, description = ?, project_id = ?, episode_id = ?,
       max_connections = ?, youtube_url = ?, banner_url = ?,
       admin_comment = ?, survey_url = ?, accepting = ?,
       waiting_message = ?, ended_message = ?,
       updated_by = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      b.title || existing.title,
      val('description', existing.description),
      val('project_id', existing.project_id),
      val('episode_id', existing.episode_id),
      b.max_connections ? Number(b.max_connections) : existing.max_connections,
      val('youtube_url', existing.youtube_url),
      val('banner_url', existing.banner_url),
      val('admin_comment', existing.admin_comment),
      val('survey_url', existing.survey_url),
      b.accepting !== undefined ? b.accepting : existing.accepting,
      val('waiting_message', existing.waiting_message),
      val('ended_message', existing.ended_message),
      req.user!.id, req.params.id,
    ]
  );

  const row = await queryOne('SELECT * FROM interactive_events WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
}));

// ──────────────────────────────────────────────
// リハーサル開始 (draft → rehearsal)
// スタンプ・クイズが動作するが、本番データとして扱わない
// ──────────────────────────────────────────────
router.post('/:id/rehearsal', wrap(async (req, res) => {
  await execute(
    `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.REHEARSAL}', accepting = true, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [req.params.id]
  );
  res.json({ success: true });
}));

// ──────────────────────────────────────────────
// リハーサルリセット (rehearsal → draft, 統計クリア)
// ──────────────────────────────────────────────
router.post('/:id/rehearsal-reset', wrap(async (req, res) => {
  const eventId = req.params.id;
  // スタンプ集計をクリア
  await execute('DELETE FROM interactive_stamp_counts WHERE event_id = ?', [eventId]);
  // セッションをクリア
  await execute('DELETE FROM interactive_sessions WHERE event_id = ?', [eventId]);
  // クイズ回答をクリア + 問題をdraftに戻す
  const qs = await queryAll('SELECT id FROM interactive_questions WHERE event_id = ?', [eventId]);
  for (const q of qs) {
    await execute('DELETE FROM interactive_answers WHERE question_id = ?', [q.id]);
    await execute(`UPDATE interactive_questions SET status = '${INTERACTIVE_QUESTION_STATUS.DRAFT}', activated_at = NULL, closed_at = NULL WHERE id = ?`, [q.id]);
  }
  // イベントをdraftに戻す
  await execute(
    `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.DRAFT}', accepting = false, started_at = NULL, ended_at = NULL, updated_at = NOW() WHERE id = ?`,
    [eventId]
  );
  res.json({ success: true, message: 'リハーサルデータをリセットしました' });
}));

// ──────────────────────────────────────────────
// 本番開始 (draft/rehearsal → live)
// ──────────────────────────────────────────────
router.post('/:id/start', wrap(async (req, res) => {
  const eventId = req.params.id;
  // リハーサルからの場合、統計をクリアしてから開始
  const ev = await queryOne('SELECT status FROM interactive_events WHERE id = ? AND deleted_at IS NULL', [eventId]) as any;
  if (ev?.status === INTERACTIVE_EVENT_STATUS.REHEARSAL) {
    await execute('DELETE FROM interactive_stamp_counts WHERE event_id = ?', [eventId]);
    await execute('DELETE FROM interactive_sessions WHERE event_id = ?', [eventId]);
    const qs = await queryAll('SELECT id FROM interactive_questions WHERE event_id = ?', [eventId]);
    for (const q of qs) {
      await execute('DELETE FROM interactive_answers WHERE question_id = ?', [q.id]);
      await execute(`UPDATE interactive_questions SET status = '${INTERACTIVE_QUESTION_STATUS.DRAFT}', activated_at = NULL, closed_at = NULL WHERE id = ?`, [q.id]);
    }
  }
  await execute(
    `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.LIVE}', accepting = true, started_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [eventId]
  );
  res.json({ success: true });
}));

// ──────────────────────────────────────────────
// 配信終了 (live → ended)
// ──────────────────────────────────────────────
router.post('/:id/stop', wrap(async (req, res) => {
  await execute(
    `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.ENDED}', accepting = false, ended_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [req.params.id]
  );
  res.json({ success: true });
}));

// ──────────────────────────────────────────────
// 再利用 (ended → draft, 統計リセット)
// ──────────────────────────────────────────────
router.post('/:id/reuse', wrap(async (req, res) => {
  const eventId = req.params.id;
  // 統計クリア
  await execute('DELETE FROM interactive_stamp_counts WHERE event_id = ?', [eventId]);
  await execute('DELETE FROM interactive_sessions WHERE event_id = ?', [eventId]);
  // クイズ回答クリア + 問題をdraftに戻す
  const qs = await queryAll('SELECT id FROM interactive_questions WHERE event_id = ?', [eventId]);
  for (const q of qs) {
    await execute('DELETE FROM interactive_answers WHERE question_id = ?', [q.id]);
    await execute(`UPDATE interactive_questions SET status = '${INTERACTIVE_QUESTION_STATUS.DRAFT}', activated_at = NULL, closed_at = NULL WHERE id = ?`, [q.id]);
  }
  // イベントをdraftに戻す
  await execute(
    `UPDATE interactive_events SET status = '${INTERACTIVE_EVENT_STATUS.DRAFT}', accepting = false, started_at = NULL, ended_at = NULL, updated_at = NOW() WHERE id = ?`,
    [eventId]
  );
  res.json({ success: true, message: 'イベントを再利用可能にしました' });
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

export default router;
