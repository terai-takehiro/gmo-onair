import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (name LIKE ? OR short_name LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = (queryOne(`SELECT COUNT(*) as c FROM customers ${where}`, params) as any).c;
  const rows = queryAll(`SELECT * FROM customers ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', (req, res) => {
  const row = queryOne('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, (req, res) => {
  const { name, short_name, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '顧客名は必須です');
  const id = uuidv4();
  execute('INSERT INTO customers (id, name, short_name, notes, created_by) VALUES (?, ?, ?, ?, ?)',
    [id, name, short_name || null, notes || null, req.user!.id]);
  const row = queryOne('SELECT * FROM customers WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  const { name, short_name, notes } = req.body;
  execute(`UPDATE customers SET name=?, short_name=?, notes=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [name, short_name || null, notes || null, req.user!.id, req.params.id]);
  const row = queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requireAuth, (req, res) => {
  execute(`UPDATE customers SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
