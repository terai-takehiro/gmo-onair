import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// GET /pricing/categories - List all categories with nested items
router.get('/categories', async (req, res) => {
  const categories = await queryAll(
    `SELECT id, name, sort_order, created_at, updated_at FROM pricing_categories WHERE deleted_at IS NULL ORDER BY sort_order, created_at`
  ) as any[];

  const items = await queryAll(
    `SELECT id, category_id, name, sub_label, unit_price, calc_type, sort_order, created_at, updated_at FROM pricing_items WHERE deleted_at IS NULL ORDER BY sort_order, created_at`
  ) as any[];

  const itemsByCategory: Record<string, any[]> = {};
  for (const item of items) {
    if (!itemsByCategory[item.category_id]) {
      itemsByCategory[item.category_id] = [];
    }
    itemsByCategory[item.category_id].push(item);
  }

  const data = categories.map((cat) => ({
    ...cat,
    items: itemsByCategory[cat.id] || [],
  }));

  res.json({ success: true, data });
});

// POST /pricing/categories - Create category
router.post('/categories', requirePermission('sales', 'editor'), async (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'カテゴリ名は必須です');
  const id = uuidv4();
  await execute(
    `INSERT INTO pricing_categories (id, name, sort_order, created_by) VALUES (?, ?, ?, ?)`,
    [id, name, sort_order ?? 0, req.user!.id]
  );
  const row = await queryOne('SELECT * FROM pricing_categories WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /pricing/categories/:id - Update category
router.put('/categories/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM pricing_categories WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'カテゴリが見つかりません');
  const { name, sort_order } = req.body;
  await execute(
    `UPDATE pricing_categories SET name=?, sort_order=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, sort_order ?? 0, req.user!.id, req.params.id]
  );
  const row = await queryOne('SELECT * FROM pricing_categories WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /pricing/categories/:id - Soft delete category
router.delete('/categories/:id', requirePermission('sales', 'member'), async (req, res) => {
  await execute(
    `UPDATE pricing_categories SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

// POST /pricing/items - Create item
router.post('/items', requirePermission('sales', 'editor'), async (req, res) => {
  const { category_id, name, sub_label, unit_price, calc_type, sort_order } = req.body;
  if (!category_id || !name || unit_price == null || !calc_type) {
    throw new AppError(400, 'VALIDATION_ERROR', 'カテゴリID、名前、単価、計算タイプは必須です');
  }
  const category = await queryOne('SELECT id FROM pricing_categories WHERE id = ? AND deleted_at IS NULL', [category_id]);
  if (!category) throw new AppError(404, 'NOT_FOUND', 'カテゴリが見つかりません');
  const id = uuidv4();
  await execute(
    `INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, calc_type, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, category_id, name, sub_label || null, unit_price, calc_type, sort_order ?? 0, req.user!.id]
  );
  const row = await queryOne('SELECT * FROM pricing_items WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /pricing/items/:id - Update item
router.put('/items/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM pricing_items WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '料金項目が見つかりません');
  const { name, sub_label, unit_price, calc_type, sort_order } = req.body;
  await execute(
    `UPDATE pricing_items SET name=?, sub_label=?, unit_price=?, calc_type=?, sort_order=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, sub_label || null, unit_price, calc_type, sort_order ?? 0, req.user!.id, req.params.id]
  );
  const row = await queryOne('SELECT * FROM pricing_items WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /pricing/items/:id - Soft delete item
router.delete('/items/:id', requirePermission('sales', 'member'), async (req, res) => {
  await execute(
    `UPDATE pricing_items SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
