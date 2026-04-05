import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('budget'));

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (name ILIKE ? OR vendor_type ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM vendors ${where}`, params)) as any).c;
  const rows = await queryAll(`SELECT * FROM vendors ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM vendors WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requirePermission('budget', 'editor'), async (req, res) => {
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '仕入先名は必須です');
  const id = uuidv4();
  await execute('INSERT INTO vendors (id, name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, contact_name || null, email || null, phone || null, address || null, vendor_type || null, invoice_registration_number || null, notes || null, req.user!.id]);
  const row = await queryOne('SELECT * FROM vendors WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM vendors WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  await execute(`UPDATE vendors SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?, invoice_registration_number=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, contact_name || null, email || null, phone || null, address || null, vendor_type || null, invoice_registration_number || null, notes || null, req.user!.id, req.params.id]);
  const row = await queryOne('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('budget', 'member'), async (req, res) => {
  await execute(`UPDATE vendors SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
