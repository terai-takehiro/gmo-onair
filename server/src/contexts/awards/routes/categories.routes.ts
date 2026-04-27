import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('awards'));

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
  const { name, description } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const maxOrder = await queryOne(
    `SELECT COALESCE(MAX(display_order), 0) AS max FROM awards_categories WHERE event_id = ?`,
    [eventId]
  );
  const row = await queryOne(
    `INSERT INTO awards_categories (event_id, name, description, display_order)
     VALUES (?, ?, ?, ?) RETURNING *`,
    [eventId, name.trim(), description ?? null, ((maxOrder?.max as number) ?? 0) + 1]
  );
  res.status(201).json({ success: true, data: row });
}));

// ── 更新 ────────────────────────────────────────────────────
router.put('/categories/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, description, display_order } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const row = await queryOne(
    `UPDATE awards_categories SET name=?, description=?, display_order=COALESCE(?, display_order), updated_at=NOW()
     WHERE id=? RETURNING *`,
    [name.trim(), description ?? null, display_order ?? null, id]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'カテゴリが見つかりません');
  res.json({ success: true, data: row });
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
