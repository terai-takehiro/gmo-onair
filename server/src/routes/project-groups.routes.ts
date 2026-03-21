import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { AppError } from '../middleware/errorHandler';

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
      (SELECT COALESCE(SUM(gp.amount),0) FROM group_purchases gp WHERE gp.group_id = pg.id AND gp.deleted_at IS NULL) as total_group_purchase
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
      (SELECT COALESCE(SUM(gp.amount),0) FROM group_purchases gp WHERE gp.group_id = pg.id AND gp.deleted_at IS NULL) as total_group_purchase
    FROM project_groups pg WHERE pg.id = ? AND pg.deleted_at IS NULL`,
    [req.params.id]
  );
  if (!group) throw new AppError(404, 'NOT_FOUND', '案件グループが見つかりません');

  const projects = queryAll(
    `SELECT p.*, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.group_id = ? AND p.deleted_at IS NULL`,
    [req.params.id]
  );
  const purchases = queryAll(
    `SELECT gp.*, v.name as vendor_name FROM group_purchases gp LEFT JOIN vendors v ON v.id = gp.vendor_id WHERE gp.group_id = ? AND gp.deleted_at IS NULL`,
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

export default router;
