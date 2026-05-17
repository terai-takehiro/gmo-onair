import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// v2.8.95: パススコープを明示 (パス無し router.use は他 router 担当のリクエストにも
// 発火して 401 を返してしまうため)。
router.use(['/events', '/categories'], requireAuth, requirePermission('awards'));

// ── 一覧 ────────────────────────────────────────────────────
router.get('/events/:eventId/categories', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const rows = await queryAll(
    `SELECT c.*, COUNT(e.id)::int AS entry_count
     FROM awards_categories c
     LEFT JOIN awards_entries e ON e.category_id = c.id
     WHERE c.event_id = ?
     GROUP BY c.id
     ORDER BY c.display_order, c.id`,
    [eventId]
  );
  res.json({ success: true, data: rows });
}));

// ── 作成 ────────────────────────────────────────────────────
router.post('/events/:eventId/categories', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const { name, name_en, description, description_en } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const maxOrder = await queryOne(
    `SELECT COALESCE(MAX(display_order), 0) AS max FROM awards_categories WHERE event_id = ?`,
    [eventId]
  );
  const row = await queryOne(
    `INSERT INTO awards_categories (event_id, name, name_en, description, description_en, display_order)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    [
      eventId,
      name.trim(),
      name_en?.trim() || null,
      description ?? null,
      description_en?.trim() || null,
      ((maxOrder?.max as number) ?? 0) + 1,
    ]
  );
  res.status(201).json({ success: true, data: row });
}));

// ── 更新 ────────────────────────────────────────────────────
router.put('/categories/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, name_en, description, description_en, display_order,
          award_pattern, poll_title, poll_title_en, poll_question, poll_question_en } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const pattern = award_pattern === 'vote' ? 'vote' : (award_pattern === 'direct' ? 'direct' : null);

  const row = await queryOne(
    `UPDATE awards_categories
       SET name=?, name_en=?, description=?, description_en=?,
           display_order=COALESCE(?, display_order),
           award_pattern=COALESCE(?, award_pattern),
           poll_title=?, poll_title_en=?, poll_question=?, poll_question_en=?,
           updated_at=NOW()
     WHERE id=? RETURNING *`,
    [
      name.trim(),
      name_en?.trim() || null,
      description ?? null,
      description_en?.trim() || null,
      display_order ?? null,
      pattern,
      poll_title?.trim?.() || null,
      poll_title_en?.trim?.() || null,
      poll_question?.trim?.() || null,
      poll_question_en?.trim?.() || null,
      id,
    ]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'カテゴリが見つかりません');
  res.json({ success: true, data: row });
}));

// ── 投票数の一括更新 (vote-reveal 用) ────────────────────────
router.put('/categories/:id/vote-counts', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { counts } = req.body as { counts: { entryId: number; voteCount: number }[] };
  if (!Array.isArray(counts)) throw new AppError(400, 'BAD_REQUEST', 'counts は配列です');

  for (const c of counts) {
    if (typeof c.entryId !== 'number') continue;
    const vc = Math.max(0, Math.floor(Number(c.voteCount) || 0));
    await execute(
      `UPDATE awards_entries SET vote_count=?, updated_at=NOW() WHERE id=? AND category_id=?`,
      [vc, c.entryId, id]
    );
  }

  const rows = await queryAll(
    `SELECT id, vote_count FROM awards_entries WHERE category_id=? ORDER BY id`,
    [id]
  );
  res.json({ success: true, data: rows });
}));

// ── 並び替え ────────────────────────────────────────────────
router.put('/events/:eventId/categories/reorder', wrap(async (req, res) => {
  const { order } = req.body as { order: { id: number; displayOrder: number }[] };
  if (!Array.isArray(order)) throw new AppError(400, 'BAD_REQUEST', 'order が必要です');

  for (const item of order) {
    await execute(
      `UPDATE awards_categories SET display_order=?, updated_at=NOW() WHERE id=?`,
      [item.displayOrder, item.id]
    );
  }
  res.json({ success: true });
}));

// ── 削除 ────────────────────────────────────────────────────
router.delete('/categories/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const row = await queryOne(`DELETE FROM awards_categories WHERE id=? RETURNING id`, [id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'カテゴリが見つかりません');
  res.json({ success: true });
}));

export default router;
