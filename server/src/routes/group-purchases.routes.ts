import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// List group purchases for a group
router.get('/:groupId/purchases', (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const groupId = req.params.groupId;
  const group = queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [groupId]);
  if (!group) throw new AppError(404, 'NOT_FOUND', '案件グループが見つかりません');

  const total = (queryOne(
    `SELECT COUNT(*) as c FROM group_purchases WHERE group_id = ? AND deleted_at IS NULL`,
    [groupId]
  ) as any).c;

  const rows = queryAll(
    `SELECT gp.*, v.name as vendor_name,
      (SELECT COUNT(*) FROM group_purchase_allocations gpa WHERE gpa.group_purchase_id = gp.id) as allocation_count,
      (SELECT COALESCE(SUM(gpa.allocated_amount),0) FROM group_purchase_allocations gpa WHERE gpa.group_purchase_id = gp.id) as allocated_total
    FROM group_purchases gp
    LEFT JOIN vendors v ON v.id = gp.vendor_id
    WHERE gp.group_id = ? AND gp.deleted_at IS NULL
    ORDER BY gp.created_at DESC LIMIT ? OFFSET ?`,
    [groupId, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

// Create group purchase
router.post('/:groupId/purchases', requireAuth, (req, res) => {
  const groupId = req.params.groupId;
  const group = queryOne('SELECT id FROM project_groups WHERE id = ? AND deleted_at IS NULL', [groupId]);
  if (!group) throw new AppError(404, 'NOT_FOUND', '案件グループが見つかりません');

  const { vendor_id, amount, description, tax_category, purchase_date, notes } = req.body;
  if (!vendor_id || amount == null) throw new AppError(400, 'VALIDATION_ERROR', '仕入先と金額は必須です');

  const id = uuidv4();
  execute(
    `INSERT INTO group_purchases (id, group_id, vendor_id, amount, description, tax_category, purchase_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, groupId, vendor_id, amount, description || null, tax_category || null, purchase_date || null, notes || null, req.user!.id]
  );
  const row = queryOne(
    `SELECT gp.*, v.name as vendor_name FROM group_purchases gp LEFT JOIN vendors v ON v.id = gp.vendor_id WHERE gp.id = ?`,
    [id]
  );
  res.status(201).json({ success: true, data: row });
});

// Update group purchase
router.put('/:groupId/purchases/:id', requireAuth, (req, res) => {
  const existing = queryOne(
    'SELECT id FROM group_purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.groupId]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'グループ仕入が見つかりません');

  const { vendor_id, amount, description, tax_category, purchase_date, notes } = req.body;
  if (!vendor_id || amount == null) throw new AppError(400, 'VALIDATION_ERROR', '仕入先と金額は必須です');

  execute(
    `UPDATE group_purchases SET vendor_id=?, amount=?, description=?, tax_category=?, purchase_date=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [vendor_id, amount, description || null, tax_category || null, purchase_date || null, notes || null, req.user!.id, req.params.id]
  );
  const row = queryOne(
    `SELECT gp.*, v.name as vendor_name FROM group_purchases gp LEFT JOIN vendors v ON v.id = gp.vendor_id WHERE gp.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// Soft delete group purchase
router.delete('/:groupId/purchases/:id', requireAuth, (req, res) => {
  execute(
    `UPDATE group_purchases SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND group_id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id, req.params.groupId]
  );
  res.json({ success: true, message: '削除しました' });
});

// Auto-allocate (均等按分)
router.post('/:groupId/purchases/:id/allocate', requireAuth, (req, res) => {
  const purchase = queryOne(
    'SELECT id, amount FROM group_purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.groupId]
  ) as any;
  if (!purchase) throw new AppError(404, 'NOT_FOUND', 'グループ仕入が見つかりません');

  const projects = queryAll(
    'SELECT id FROM projects WHERE group_id = ? AND deleted_at IS NULL',
    [req.params.groupId]
  ) as any[];
  if (projects.length === 0) throw new AppError(400, 'VALIDATION_ERROR', 'グループに案件が存在しません');

  // Delete existing allocations
  execute('DELETE FROM group_purchase_allocations WHERE group_purchase_id = ?', [req.params.id]);

  const amount = purchase.amount as number;
  const perProject = Math.floor(amount / projects.length);
  const remainder = amount - perProject * projects.length;

  for (let i = 0; i < projects.length; i++) {
    const allocatedAmount = i === projects.length - 1 ? perProject + remainder : perProject;
    const allocId = uuidv4();
    execute(
      `INSERT INTO group_purchase_allocations (id, group_purchase_id, project_id, allocated_amount, created_by) VALUES (?, ?, ?, ?, ?)`,
      [allocId, req.params.id, projects[i].id, allocatedAmount, req.user!.id]
    );
  }

  const allocations = queryAll(
    `SELECT gpa.*, p.name as project_name, p.gls_number
    FROM group_purchase_allocations gpa
    LEFT JOIN projects p ON p.id = gpa.project_id
    WHERE gpa.group_purchase_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: allocations });
});

// Manual allocation adjustment
router.put('/:groupId/purchases/:id/allocations', requireAuth, (req, res) => {
  const purchase = queryOne(
    'SELECT id, amount FROM group_purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.groupId]
  );
  if (!purchase) throw new AppError(404, 'NOT_FOUND', 'グループ仕入が見つかりません');

  const { allocations } = req.body;
  if (!allocations || !Array.isArray(allocations)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'allocations配列は必須です');
  }

  // Delete existing allocations
  execute('DELETE FROM group_purchase_allocations WHERE group_purchase_id = ?', [req.params.id]);

  for (const alloc of allocations) {
    const allocId = uuidv4();
    execute(
      `INSERT INTO group_purchase_allocations (id, group_purchase_id, project_id, allocated_amount, created_by) VALUES (?, ?, ?, ?, ?)`,
      [allocId, req.params.id, alloc.project_id, alloc.allocated_amount, req.user!.id]
    );
  }

  const result = queryAll(
    `SELECT gpa.*, p.name as project_name, p.gls_number
    FROM group_purchase_allocations gpa
    LEFT JOIN projects p ON p.id = gpa.project_id
    WHERE gpa.group_purchase_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: result });
});

// Get allocations for a purchase
router.get('/:groupId/purchases/:id/allocations', (req, res) => {
  const purchase = queryOne(
    'SELECT id FROM group_purchases WHERE id = ? AND group_id = ? AND deleted_at IS NULL',
    [req.params.id, req.params.groupId]
  );
  if (!purchase) throw new AppError(404, 'NOT_FOUND', 'グループ仕入が見つかりません');

  const allocations = queryAll(
    `SELECT gpa.*, p.name as project_name, p.gls_number
    FROM group_purchase_allocations gpa
    LEFT JOIN projects p ON p.id = gpa.project_id
    WHERE gpa.group_purchase_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: allocations });
});

export default router;
