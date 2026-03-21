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
  const stage = req.query.stage as string;
  const assignedTo = req.query.assigned_to as string;
  let where = 'WHERE o.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (o.title LIKE ? OR o.opp_code LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (stage) { where += ` AND o.stage = ?`; params.push(stage); }
  if (assignedTo) { where += ` AND o.assigned_to = ?`; params.push(assignedTo); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM opportunities o ${where}`, params) as any).c;
  const rows = queryAll(`SELECT o.*, c.name as customer_name, u.name as assigned_to_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.assigned_to ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne(`SELECT o.*, c.name as customer_name, u.name as assigned_to_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN users u ON u.id = o.assigned_to WHERE o.id = ? AND o.deleted_at IS NULL`, [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, (req, res) => {
  const { title, customer_id, stage, probability, expected_amount, expected_date, assigned_to, notes } = req.body;
  if (!title || !customer_id) throw new AppError(400, 'VALIDATION_ERROR', '案件仮称と顧客は必須です');
  const id = uuidv4();
  const oppCode = generateSequenceNumber('opp_code', 'OPP');
  execute(`INSERT INTO opportunities (id, opp_code, title, customer_id, stage, probability, expected_amount, expected_date, assigned_to, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, oppCode, title, customer_id, stage || 'lead', probability || 0, expected_amount || 0, expected_date || null, assigned_to || req.user!.id, notes || null, req.user!.id]);
  const row = queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
  const { title, customer_id, stage, probability, expected_amount, expected_date, assigned_to, notes } = req.body;
  execute(`UPDATE opportunities SET title=?, customer_id=?, stage=?, probability=?, expected_amount=?, expected_date=?, assigned_to=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [title, customer_id, stage, probability, expected_amount, expected_date || null, assigned_to, notes || null, req.user!.id, req.params.id]);
  const row = queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.patch('/:id/stage', requireAuth, (req, res) => {
  const { stage } = req.body;
  if (!stage) throw new AppError(400, 'VALIDATION_ERROR', 'stageは必須です');
  const opp = queryOne('SELECT * FROM opportunities WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');
  execute(`UPDATE opportunities SET stage=?, updated_at=datetime('now'), updated_by=? WHERE id=?`, [stage, req.user!.id, req.params.id]);
  let project = null;
  if (stage === 'won' && !opp.project_id) {
    const projId = uuidv4();
    const glsNumber = generateSequenceNumber('gls_number', 'GLS');
    execute(`INSERT INTO projects (id, gls_number, name, customer_id, opportunity_id, status, created_by) VALUES (?, ?, ?, ?, ?, 'tentative', ?)`,
      [projId, glsNumber, opp.title, opp.customer_id, req.params.id, req.user!.id]);
    execute(`UPDATE opportunities SET project_id=?, updated_at=datetime('now') WHERE id=?`, [projId, req.params.id]);
    project = queryOne('SELECT * FROM projects WHERE id = ?', [projId]);
  }
  const updated = queryOne('SELECT o.*, c.name as customer_name FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?', [req.params.id]);
  res.json({ success: true, data: updated, project });
});

router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE opportunities SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
