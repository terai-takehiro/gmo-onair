import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('awards'));

// ── カテゴリ内エントリ一覧 ──────────────────────────────────
router.get('/categories/:categoryId/entries', wrap(async (req, res) => {
  const catId = parseInt(req.params.categoryId as string);
  const rows = await queryAll(
    `SELECT * FROM awards_entries WHERE category_id=? ORDER BY rank NULLS LAST, id`,
    [catId]
  );
  res.json({ success: true, data: rows });
}));

// ── 作成 ────────────────────────────────────────────────────
router.post('/categories/:categoryId/entries', wrap(async (req, res) => {
  const catId = parseInt(req.params.categoryId as string);
  const cat = await queryOne(
    `SELECT id, event_id FROM awards_categories WHERE id=?`, [catId]
  );
  if (!cat) throw new AppError(404, 'NOT_FOUND', 'カテゴリが見つかりません');

  const { name, org, rank, points, is_winner } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const row = await queryOne(
    `INSERT INTO awards_entries (event_id, category_id, name, org, rank, points, is_winner)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [cat.event_id, catId, name.trim(), org ?? null, rank ?? null, points ?? null, is_winner ?? false]
  );
  res.status(201).json({ success: true, data: row });
}));

// ── 更新 ────────────────────────────────────────────────────
router.put('/entries/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, org, rank, points, is_winner } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const row = await queryOne(
    `UPDATE awards_entries SET name=?, org=?, rank=?, points=?, is_winner=?, updated_at=NOW()
     WHERE id=? RETURNING *`,
    [name.trim(), org ?? null, rank ?? null, points ?? null, is_winner ?? false, id]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'エントリが見つかりません');
  res.json({ success: true, data: row });
}));

// ── 削除 ────────────────────────────────────────────────────
router.delete('/entries/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const row = await queryOne(`DELETE FROM awards_entries WHERE id=? RETURNING id`, [id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'エントリが見つかりません');
  res.json({ success: true });
}));

// ── ダミーポイント自動生成 ──────────────────────────────────
router.post('/categories/:categoryId/generate-dummy-points', wrap(async (req, res) => {
  const catId = parseInt(req.params.categoryId as string);
  const entries = await queryAll(
    `SELECT id, rank FROM awards_entries WHERE category_id=? ORDER BY rank NULLS LAST, id`,
    [catId]
  );
  if (!entries.length) throw new AppError(404, 'NOT_FOUND', 'エントリが存在しません');

  const basePoints = 5000;
  const step = 400;
  for (let i = 0; i < entries.length; i++) {
    const points = Math.max(500, basePoints - i * step + Math.floor(Math.random() * 200) - 100);
    await execute(
      `UPDATE awards_entries SET points=?, updated_at=NOW() WHERE id=?`,
      [points, entries[i].id]
    );
  }
  res.json({ success: true, message: `${entries.length} 件のポイントを生成しました` });
}));

export default router;
