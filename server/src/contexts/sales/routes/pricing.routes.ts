import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { pricingLocationService } from '../services/pricing-location.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

/**
 * 場所の一覧 (v4 大③・migration 172)。
 *
 * **料金が0件の場所も出します** — 「渋谷はまだ入れていない」が読み取れないと、
 * 用賀の値段をそのまま渋谷の案件に使ってしまいます。
 */
router.get('/locations', async (_req, res) => {
  res.json({ success: true, data: await pricingLocationService.list() });
});

/** この案件はどの場所の料金表を見るべきか。**推測した理由も返す**（画面が出す） */
router.get('/locations/resolve', async (req, res) => {
  const projectId = req.query.project_id ? String(req.query.project_id) : null;
  res.json({ success: true, data: await pricingLocationService.resolveForProject(projectId) });
});

/**
 * ほかの場所の料金表を丸ごと写す（モックの「用賀の料金表をコピー」）。
 * **空の場所にしか写しません**（2回押すと同じ品目が2つ並ぶ）。
 */
router.post('/locations/:id/copy-from', requirePermission('sales', 'owner'), async (req, res) => {
  const from = String((req.body ?? {}).from_location_id ?? '');
  if (!from) throw new AppError(400, 'VALIDATION_ERROR', '写す元の場所を指定してください');
  const result = await pricingLocationService.copyTable(from, String(req.params.id), req.user!.id);
  res.status(201).json({ success: true, data: result });
});

// GET /pricing/categories - List all categories with nested items
// `location_id` を渡すとその場所の表だけ。**渡さないと全部**（旧来の呼び出しを壊さない）
router.get('/categories', async (req, res) => {
  const locationId = req.query.location_id ? String(req.query.location_id) : null;
  const categories = await queryAll(
    `SELECT id, name, sort_order, location_id, created_at, updated_at FROM pricing_categories
      WHERE deleted_at IS NULL ${locationId ? 'AND location_id = ?' : ''}
      ORDER BY sort_order, created_at`,
    locationId ? [locationId] : [],
  ) as any[];

  const items = await queryAll(
    `SELECT i.id, i.category_id, i.name, i.sub_label, i.unit_price, i.group_price, i.calc_type,
            i.sort_order, i.created_at, i.updated_at
       FROM pricing_items i
       JOIN pricing_categories c ON c.id = i.category_id AND c.deleted_at IS NULL
      WHERE i.deleted_at IS NULL ${locationId ? 'AND c.location_id = ?' : ''}
      ORDER BY i.sort_order, i.created_at`,
    locationId ? [locationId] : [],
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
router.post('/categories', requirePermission('sales', 'owner'), async (req, res) => {
  const { name, sort_order, location_id } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'カテゴリ名は必須です');
  // **場所を省略させない。** 省略を許すとどのタブにも出ない分類ができる
  if (!location_id) throw new AppError(400, 'VALIDATION_ERROR', 'どの場所の料金表かを指定してください');
  const loc = await queryOne('SELECT id FROM studio_locations WHERE id = ? AND deleted_at IS NULL', [location_id]);
  if (!loc) throw new AppError(404, 'NOT_FOUND', '場所が見つかりません');
  const id = uuidv4();
  await execute(
    `INSERT INTO pricing_categories (id, name, sort_order, location_id, created_by) VALUES (?, ?, ?, ?, ?)`,
    [id, name, sort_order ?? 0, location_id, req.user!.id]
  );
  const row = await queryOne('SELECT * FROM pricing_categories WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /pricing/categories/:id - Update category
router.put('/categories/:id', requirePermission('sales', 'owner'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM pricing_categories WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'カテゴリが見つかりません');
  // **`location_id` はここでは変えられない。** 分類を別の場所へ移すと、
  // その分類を使った過去の見積が「別の場所の表から選んだ」ことになる。
  // 引っ越しが要るなら写して消す（何が起きるかが目に見える）
  const { name, sort_order } = req.body;
  await execute(
    `UPDATE pricing_categories SET name=?, sort_order=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, sort_order ?? 0, req.user!.id, req.params.id]
  );
  const row = await queryOne('SELECT * FROM pricing_categories WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /pricing/categories/:id - Soft delete category
router.delete('/categories/:id', requirePermission('sales', 'owner'), async (req, res) => {
  await execute(
    `UPDATE pricing_categories SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

// POST /pricing/items - Create item
router.post('/items', requirePermission('sales', 'editor'), async (req, res) => {
  const { category_id, name, sub_label, unit_price, group_price, calc_type, sort_order } = req.body;
  if (!category_id || !name || !calc_type) {
    throw new AppError(400, 'VALIDATION_ERROR', 'カテゴリID、名前、計算タイプは必須です');
  }
  const category = await queryOne('SELECT id FROM pricing_categories WHERE id = ? AND deleted_at IS NULL', [category_id]);
  if (!category) throw new AppError(404, 'NOT_FOUND', 'カテゴリが見つかりません');
  const id = uuidv4();
  await execute(
    `INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, category_id, name, sub_label || null, unit_price ?? null, group_price ?? null, calc_type, sort_order ?? 0, req.user!.id]
  );
  const row = await queryOne('SELECT * FROM pricing_items WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /pricing/items/:id - Update item
router.put('/items/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM pricing_items WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '料金項目が見つかりません');
  const { name, sub_label, unit_price, group_price, calc_type, sort_order } = req.body;
  await execute(
    `UPDATE pricing_items SET name=?, sub_label=?, unit_price=?, group_price=?, calc_type=?, sort_order=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, sub_label || null, unit_price ?? null, group_price ?? null, calc_type, sort_order ?? 0, req.user!.id, req.params.id]
  );
  const row = await queryOne('SELECT * FROM pricing_items WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /pricing/items/:id - Soft delete item
router.delete('/items/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(
    `UPDATE pricing_items SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
