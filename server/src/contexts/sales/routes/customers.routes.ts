import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (name ILIKE ? OR short_name ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM customers ${where}`, params)) as any).c;
  const rows = await queryAll(`SELECT * FROM customers ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const { name, short_name, contact_name, email, phone, address, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '顧客名は必須です');
  const id = uuidv4();
  await execute('INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, short_name || null, contact_name || null, email || null, phone || null, address || null, notes || null, req.user!.id]);
  const row = await queryOne('SELECT * FROM customers WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  const { name, short_name, contact_name, email, phone, address, notes } = req.body;
  await execute(`UPDATE customers SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, short_name || null, contact_name || null, email || null, phone || null, address || null, notes || null, req.user!.id, req.params.id]);
  const row = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(`UPDATE customers SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
