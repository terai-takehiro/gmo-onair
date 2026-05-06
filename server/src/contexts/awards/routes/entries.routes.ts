import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// v2.8.95: パススコープを明示 (パス無し router.use は他 router 担当のリクエストにも
// 発火して 401 を返してしまうため)。
router.use(['/categories', '/entries'], requireAuth, requirePermission('awards'));

/** ポイント降順でランクを自動再計算し is_winner を更新する */
async function rerank(categoryId: number): Promise<void> {
  const entries = await queryAll(
    `SELECT id FROM awards_entries WHERE category_id=? ORDER BY points DESC NULLS LAST, id ASC`,
    [categoryId]
  );
  for (let i = 0; i < entries.length; i++) {
    const rank = i + 1;
    await execute(
      `UPDATE awards_entries SET rank=?, is_winner=?, updated_at=NOW() WHERE id=?`,
      [rank, rank === 1, entries[i].id]
    );
  }
}

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

  const { name, name_en, org, org_en, image_id, points, own_points } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  await queryOne(
    `INSERT INTO awards_entries (event_id, category_id, name, name_en, org, org_en, image_id, rank, points, own_points, is_winner)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, false)`,
    [cat.event_id, catId, name.trim(), name_en ?? null, org ?? null, org_en ?? null, image_id ?? null, points ?? null, own_points ?? null]
  );
  await rerank(catId);
  const rows = await queryAll(
    `SELECT * FROM awards_entries WHERE category_id=? ORDER BY rank NULLS LAST, id`,
    [catId]
  );
  res.status(201).json({ success: true, data: rows });
}));

// ── 更新 ────────────────────────────────────────────────────
router.put('/entries/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { name, name_en, org, org_en, image_id, points, own_points } = req.body;
  if (!name?.trim()) throw new AppError(400, 'BAD_REQUEST', 'name は必須です');

  const existing = await queryOne(`SELECT category_id FROM awards_entries WHERE id=?`, [id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エントリが見つかりません');

  await execute(
    `UPDATE awards_entries SET name=?, name_en=?, org=?, org_en=?, image_id=?, points=?, own_points=?, updated_at=NOW()
     WHERE id=?`,
    [name.trim(), name_en ?? null, org ?? null, org_en ?? null, image_id ?? null, points ?? null, own_points ?? null, id]
  );
  await rerank(existing.category_id as number);
  const row = await queryOne(`SELECT * FROM awards_entries WHERE id=?`, [id]);
  res.json({ success: true, data: row });
}));

// ── 削除 ────────────────────────────────────────────────────
router.delete('/entries/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = await queryOne(`SELECT category_id FROM awards_entries WHERE id=?`, [id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'エントリが見つかりません');

  await execute(`DELETE FROM awards_entries WHERE id=?`, [id]);
  await rerank(existing.category_id as number);
  res.json({ success: true });
}));

// ── ダミーポイント自動生成 ──────────────────────────────────
router.post('/categories/:categoryId/generate-dummy-points', wrap(async (req, res) => {
  const catId = parseInt(req.params.categoryId as string);
  const entries = await queryAll(
    `SELECT id FROM awards_entries WHERE category_id=? ORDER BY id`,
    [catId]
  );
  if (!entries.length) throw new AppError(404, 'NOT_FOUND', 'エントリが存在しません');

  // エントリ ID 順ではなくランダムなポイントを割り当てる（その後 rerank() でポイント順に並び替え）
  const minPoints = 500;
  const maxPoints = 5000;
  for (const entry of entries) {
    const points = minPoints + Math.floor(Math.random() * (maxPoints - minPoints + 1));
    const ownRatio = 0.20 + Math.random() * 0.20;
    const own_points = Math.round(points * ownRatio);
    await execute(
      `UPDATE awards_entries SET points=?, own_points=?, updated_at=NOW() WHERE id=?`,
      [points, own_points, entry.id]
    );
  }
  await rerank(catId);
  res.json({ success: true, message: `${entries.length} 件のポイントを生成しました` });
}));

export default router;
