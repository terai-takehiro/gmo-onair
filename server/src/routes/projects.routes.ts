import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { generateSequenceNumber } from '../services/sequence.service';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const status = req.query.status as string;
  const customerId = req.query.customer_id as string;
  let where = 'WHERE p.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (p.name LIKE ? OR p.gls_number LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (status) { where += ` AND p.status = ?`; params.push(status); }
  if (customerId) { where += ` AND p.customer_id = ?`; params.push(customerId); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM projects p ${where}`, params) as any).c;
  const rows = queryAll(`SELECT p.*, c.name as customer_name, (SELECT COUNT(*) FROM episodes WHERE project_id = p.id AND deleted_at IS NULL) as episode_count FROM projects p LEFT JOIN customers c ON c.id = p.customer_id ${where} ORDER BY COALESCE(p.event_start, p.created_at) DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne(`SELECT p.*, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ? AND p.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  res.json({ success: true, data: row });
});

router.get('/:id/summary', (req, res) => {
  const project = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  const rev = queryOne('SELECT COALESCE(SUM(amount), 0) as total FROM revenues WHERE project_id = ? AND deleted_at IS NULL', [req.params.id]);
  const pur = queryOne('SELECT COALESCE(SUM(amount), 0) as total FROM purchases WHERE project_id = ? AND deleted_at IS NULL', [req.params.id]);
  const totalRevenue = (rev?.total as number) || 0;
  const totalPurchase = (pur?.total as number) || 0;
  const grossProfit = totalRevenue - totalPurchase;
  const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;
  res.json({ success: true, data: { total_revenue: totalRevenue, total_purchase: totalPurchase, gross_profit: grossProfit, gross_margin: grossMargin } });
});

router.post('/', requireAuth, (req, res) => {
  const { name, customer_id, opportunity_id, rehearsal_start, rehearsal_end, event_start, event_end, status, broadcast_type, media_platform, notes } = req.body;
  if (!name || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件名と顧客は必須です');
  const id = uuidv4();
  const glsNumber = generateSequenceNumber('gls_number', 'GLS');
  execute(`INSERT INTO projects (id, gls_number, name, customer_id, opportunity_id, rehearsal_start, rehearsal_end, event_start, event_end, status, broadcast_type, media_platform, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, glsNumber, name, customer_id, opportunity_id || null, rehearsal_start || null, rehearsal_end || null, event_start || null, event_end || null, status || 'tentative', broadcast_type || null, media_platform || null, notes || null, req.user!.id]);
  const row = queryOne('SELECT p.*, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  const { name, customer_id, rehearsal_start, rehearsal_end, event_start, event_end, status, broadcast_type, media_platform, application_form, logo_permission, notes } = req.body;
  execute(`UPDATE projects SET name=?, customer_id=?, rehearsal_start=?, rehearsal_end=?, event_start=?, event_end=?, status=?, broadcast_type=?, media_platform=?, application_form=?, logo_permission=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [name, customer_id, rehearsal_start || null, rehearsal_end || null, event_start || null, event_end || null, status, broadcast_type || null, media_platform || null, application_form ? 1 : 0, logo_permission ? 1 : 0, notes || null, req.user!.id, req.params.id]);
  const row = queryOne('SELECT p.*, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE projects SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
