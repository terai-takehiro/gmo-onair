import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const projectId = req.query.project_id as string;
  let where = 'WHERE r.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (r.billing_key LIKE ? OR r.notes LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (projectId) { where += ` AND r.project_id = ?`; params.push(projectId); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM revenues r ${where}`, params) as any).c;
  const rows = queryAll(`SELECT r.*, p.name as project_name, p.gls_number, c.name as customer_name FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id ${where} ORDER BY r.recognition_date DESC, r.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne(`SELECT r.*, p.name as project_name, p.gls_number, c.name as customer_name FROM revenues r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN customers c ON c.id = r.customer_id WHERE r.id = ? AND r.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, (req, res) => {
  const { billing_key, project_id, customer_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes } = req.body;
  if (!project_id || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件と顧客は必須です');
  const id = uuidv4();
  execute(`INSERT INTO revenues (id, billing_key, project_id, customer_id, assigned_to, tax_category, amount, recognition_date, billing_date, payment_due_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, billing_key || null, project_id, customer_id, req.user!.id, tax_category || 'tax10', amount || 0, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, req.user!.id]);
  const row = queryOne('SELECT * FROM revenues WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM revenues WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  const { billing_key, project_id, customer_id, tax_category, amount, recognition_date, billing_date, payment_due_date, notes } = req.body;
  execute(`UPDATE revenues SET billing_key=?, project_id=?, customer_id=?, tax_category=?, amount=?, recognition_date=?, billing_date=?, payment_due_date=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [billing_key || null, project_id, customer_id, tax_category, amount, recognition_date || null, billing_date || null, payment_due_date || null, notes || null, req.user!.id, req.params.id]);
  const row = queryOne('SELECT * FROM revenues WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE revenues SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
