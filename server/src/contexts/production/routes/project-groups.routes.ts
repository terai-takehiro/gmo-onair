import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// List groups with project_count and total_group_purchase
router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE pg.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) {
    where += ` AND (pg.name LIKE ? OR pg.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  const total = (queryOne(`SELECT COUNT(*) as c FROM project_groups pg ${where}`, params) as any).c;
  const rows = queryAll(
    `SELECT pg.*,
      (SELECT COUNT(*) FROM projects p WHERE p.group_id = pg.id AND p.deleted_at IS NULL) as project_count,
      (SELECT COALESCE(SUM(pur.amount),0) FROM purchases pur WHERE pur.group_id = pg.id AND pur.deleted_at IS NULL) as total_group_purchase
    FROM project_groups pg ${where} ORDER BY pg.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

// Get single group with child projects and group purchases
router.get('/:id', (req, res) => {
  const group = queryOne(
    `SELECT pg.*,
      (SELECT COUNT(*) FROM projects p WHERE p.group_id = pg.id AND p.deleted_at IS NULL) as project_count,
      (SELECT COALESCE(SUM(pur.amount),0) FROM purchases pur WHERE pur.group_id = pg.id AND pur.deleted_at IS NULL) as total_group_purchase
    FROM project_groups pg WHERE pg.id = ? AND pg.deleted_at IS NULL`,
    [req.params.id]
  );
  if (!group) throw new AppError(404, 'NOT_FOUND', '案件グループが見つかりません');

  const projects = queryAll(
    `SELECT p.*, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.group_id = ? AND p.deleted_at IS NULL`,
    [req.params.id]
  );
  const purchases = queryAll(
    `SELECT pur.*, v.name as vendor_name FROM purchases pur LEFT JOIN vendors v ON v.id = pur.vendor_id WHERE pur.group_id = ? AND pur.deleted_at IS NULL`,
    [req.params.id]
  );

  res.json({ success: true, data: { ...group, projects, purchases } });
});

// Create group
router.post('/', requireAuth, (req, res) => {
  const { name, description, period_start, period_end } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'グループ名は必須です');
  const id = uuidv4();
  execute(
    `INSERT INTO project_groups (id, name, description, period_start, period_end, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, description || null, period_start || null, period_end || null, req.user!.id]
  );
  const row = queryOne('SELECT * FROM project_groups WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// Update group
router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '案件グループが見つかりません');
  const { name, description, period_start, period_end } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'グループ名は必須です');
  execute(
    `UPDATE project_groups SET name=?, description=?, period_start=?, period_end=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [name, description || null, period_start || null, period_end || null, req.user!.id, req.params.id]
  );
  const row = queryOne('SELECT * FROM project_groups WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// Soft delete group
router.delete('/:id', requireAuth, (req, res) => {
  execute(
    `UPDATE project_groups SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

// Add child projects to group
router.post('/:id/projects', requireAuth, (req, res) => {
  const group = queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!group) throw new AppError(404, 'NOT_FOUND', '案件グループが見つかりません');
  const { project_ids } = req.body;
  if (!project_ids || !Array.isArray(project_ids) || project_ids.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '案件IDの配列は必須です');
  }
  for (const projectId of project_ids) {
    execute(
      `UPDATE projects SET group_id=?, updated_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`,
      [req.params.id, req.user!.id, projectId]
    );
  }
  const projects = queryAll(
    `SELECT p.*, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.group_id = ? AND p.deleted_at IS NULL`,
    [req.params.id]
  );
  res.json({ success: true, data: projects });
});

// Remove project from group
router.delete('/:id/projects/:projectId', requireAuth, (req, res) => {
  execute(
    `UPDATE projects SET group_id=NULL, updated_at=datetime('now'), updated_by=? WHERE id=? AND group_id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.projectId, req.params.id]
  );
  res.json({ success: true, message: 'グループから案件を除外しました' });
});

// ==================== Group Purchase endpoints (now using purchases table) ====================

// List purchases for a group
router.get('/:groupId/purchases', (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const groupId = req.params.groupId;
  const group = queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [groupId]);
  if (!group) throw new AppError(404, 'NOT_FOUND', '案件グループが見つかりません');

  const total = (queryOne(
    `SELECT COUNT(*) as c FROM purchases WHERE group_id = ? AND deleted_at IS NULL`,
    [groupId]
  ) as any).c;

  const rows = queryAll(
    `SELECT p.*, v.name as vendor_name,
      (SELECT COUNT(*) FROM purchase_allocations pa WHERE pa.purchase_id = p.id) as allocation_count,
      (SELECT COALESCE(SUM(pa.allocated_amount),0) FROM purchase_allocations pa WHERE pa.purchase_id = p.id) as allocated_total
    FROM purchases p
    LEFT JOIN vendors v ON v.id = p.vendor_id
    WHERE p.group_id = ? AND p.deleted_at IS NULL
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [groupId, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

// Create purchase for group
router.post('/:groupId/purchases', requireAuth, (req, res) => {
  const groupId = req.params.groupId;
  const group = queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [groupId]);
  if (!group) throw new AppError(404, 'NOT_FOUND', '案件グループが見つかりません');

  const { vendor_id, amount, description, tax_category, purchase_date, notes } = req.body;
  if (!vendor_id || amount == null) throw new AppError(400, 'VALIDATION_ERROR', '仕入先と金額は必須です');

  const id = uuidv4();
  execute(
    `INSERT INTO purchases (id, group_id, vendor_id, amount, description, tax_category, purchase_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, groupId, vendor_id, amount, description || null, tax_category || null, purchase_date || null, notes || null, req.user!.id]
  );
  const row = queryOne(
    `SELECT p.*, v.name as vendor_name FROM purchases p LEFT JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ?`,
    [id]
  );
  res.status(201).json({ success: true, data: row });
});

// Update purchase for group
router.put('/:groupId/purchases/:id', requireAuth, (req, res) => {
  const existing = queryOne(
    'SELECT id FROM purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.groupId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'グループ仕入が見つかりません');

  const { vendor_id, amount, description, tax_category, purchase_date, notes } = req.body;
  if (!vendor_id || amount == null) throw new AppError(400, 'VALIDATION_ERROR', '仕入先と金額は必須です');

  execute(
    `UPDATE purchases SET vendor_id=?, amount=?, description=?, tax_category=?, purchase_date=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [vendor_id, amount, description || null, tax_category || null, purchase_date || null, notes || null, req.user!.id, req.params.id]
  );
  const row = queryOne(
    `SELECT p.*, v.name as vendor_name FROM purchases p LEFT JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Soft delete purchase for group
router.delete('/:groupId/purchases/:id', requireAuth, (req, res) => {
  execute(
    `UPDATE purchases SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND group_id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id, req.params.groupId]
  );
  res.json({ success: true, message: '削除しました' });
});

// Auto-allocate (均等按分)
router.post('/:groupId/purchases/:id/allocate', requireAuth, (req, res) => {
  const purchase = queryOne(
    'SELECT id, amount FROM purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.groupId]
  ) as any;
  if (!purchase) throw new AppError(404, 'NOT_FOUND', 'グループ仕入が見つかりません');

  const projects = queryAll(
    'SELECT id FROM projects WHERE group_id = ? AND deleted_at IS NULL',
    [req.params.groupId]
  ) as any[];
  if (projects.length === 0) throw new AppError(400, 'VALIDATION_ERROR', 'グループに案件が存在しません');

  // Delete existing allocations
  execute('DELETE FROM purchase_allocations WHERE purchase_id = ?', [req.params.id]);

  const amount = purchase.amount as number;
  const perProject = Math.floor(amount / projects.length);
  const remainder = amount - perProject * projects.length;

  for (let i = 0; i < projects.length; i++) {
    const allocatedAmount = i === projects.length - 1 ? perProject + remainder : perProject;
    const allocId = uuidv4();
    execute(
      `INSERT INTO purchase_allocations (id, purchase_id, project_id, allocated_amount, created_by) VALUES (?, ?, ?, ?, ?)`,
      [allocId, req.params.id, projects[i].id, allocatedAmount, req.user!.id]
    );
  }

  const allocations = queryAll(
    `SELECT pa.*, p.name as project_name, p.gls_number
    FROM purchase_allocations pa
    LEFT JOIN projects p ON p.id = pa.project_id
    WHERE pa.purchase_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: allocations });
});

// Manual allocation adjustment
router.put('/:groupId/purchases/:id/allocations', requireAuth, (req, res) => {
  const purchase = queryOne(
    'SELECT id, amount FROM purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.groupId]
  );
  if (!purchase) throw new AppError(404, 'NOT_FOUND', 'グループ仕入が見つかりません');

  const { allocations } = req.body;
  if (!allocations || !Array.isArray(allocations)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'allocations配列は必須です');
  }

  // Delete existing allocations
  execute('DELETE FROM purchase_allocations WHERE purchase_id = ?', [req.params.id]);

  for (const alloc of allocations) {
    const allocId = uuidv4();
    execute(
      `INSERT INTO purchase_allocations (id, purchase_id, project_id, allocated_amount, created_by) VALUES (?, ?, ?, ?, ?)`,
      [allocId, req.params.id, alloc.project_id, alloc.allocated_amount, req.user!.id]
    );
  }

  const result = queryAll(
    `SELECT pa.*, p.name as project_name, p.gls_number
    FROM purchase_allocations pa
    LEFT JOIN projects p ON p.id = pa.project_id
    WHERE pa.purchase_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: result });
});

// Get allocations for a purchase
router.get('/:groupId/purchases/:id/allocations', (req, res) => {
  const purchase = queryOne(
    'SELECT id FROM purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.groupId]
  );
  if (!purchase) throw new AppError(404, 'NOT_FOUND', 'グループ仕入が見つかりません');

  const allocations = queryAll(
    `SELECT pa.*, p.name as project_name, p.gls_number
    FROM purchase_allocations pa
    LEFT JOIN projects p ON p.id = pa.project_id
    WHERE pa.purchase_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: allocations });
});

export default router;
