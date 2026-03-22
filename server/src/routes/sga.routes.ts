import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../db/connection';
import { requireAuth } from '../middleware/auth';
import { extractPagination, paginatedResponse } from '../services/pagination';
import { AppError } from '../middleware/errorHandler';
import { generateSgaBillingKey } from '../services/billing-key.service';

const router = Router();

// GET /sga - List with pagination, search, filters
router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const dateFrom = req.query.date_from as string;
  const dateTo = req.query.date_to as string;

  let where = 'WHERE s.deleted_at IS NULL';
  const params: unknown[] = [];

  if (search) {
    where += ` AND (s.vendor_name LIKE ? OR s.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (dateFrom) {
    where += ` AND s.recognition_date >= ?`;
    params.push(dateFrom);
  }
  if (dateTo) {
    where += ` AND s.recognition_date <= ?`;
    params.push(dateTo);
  }

  const total = (queryOne(`SELECT COUNT(*) as c FROM sga_expenses s ${where}`, params) as any).c;
  const rows = queryAll(
    `SELECT s.* FROM sga_expenses s ${where} ORDER BY s.recognition_date DESC, s.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

// GET /sga/:id - Get single
router.get('/:id', (req, res) => {
  const row = queryOne('SELECT * FROM sga_expenses WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '販管費が見つかりません');
  res.json({ success: true, data: row });
});

// POST /sga - Create
router.post('/', requireAuth, (req, res) => {
  const {
    vendor_name, vendor_id, settlement_method, settlement_number, description, notes,
    recognition_date, payment_due_date, tax_category, invoice_qualified, amount
  } = req.body;

  if (!recognition_date) throw new AppError(400, 'VALIDATION_ERROR', '発生日は必須です');

  const billing_key = generateSgaBillingKey(recognition_date, tax_category || 'tax10');
  const id = uuidv4();

  execute(
    `INSERT INTO sga_expenses (id, billing_key, vendor_name, vendor_id, settlement_method, settlement_number, description, notes, recognition_date, payment_due_date, tax_category, invoice_qualified, amount, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, billing_key, vendor_name || null, vendor_id || null,
      settlement_method || null, settlement_number || null,
      description || null, notes || null,
      recognition_date, payment_due_date || null,
      tax_category || 'tax10',
      invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1,
      amount || 0, req.user!.id
    ]
  );

  const row = queryOne('SELECT * FROM sga_expenses WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /sga/:id - Update
router.put('/:id', requireAuth, (req, res) => {
  const existing = queryOne('SELECT * FROM sga_expenses WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '販管費が見つかりません');

  const {
    vendor_name, vendor_id, settlement_method, settlement_number, description, notes,
    recognition_date, payment_due_date, tax_category, invoice_qualified, amount
  } = req.body;

  // Regenerate billing_key if recognition_date or tax_category changed
  let billing_key = existing.billing_key;
  const newDate = recognition_date || existing.recognition_date;
  const newTax = tax_category || existing.tax_category;
  if (newDate !== existing.recognition_date || newTax !== existing.tax_category) {
    billing_key = generateSgaBillingKey(newDate, newTax);
  }

  execute(
    `UPDATE sga_expenses SET billing_key=?, vendor_name=?, vendor_id=?, settlement_method=?, settlement_number=?, description=?, notes=?, recognition_date=?, payment_due_date=?, tax_category=?, invoice_qualified=?, amount=?, updated_at=datetime('now'), updated_by=? WHERE id=?`,
    [
      billing_key, vendor_name || null, vendor_id || null,
      settlement_method || null, settlement_number || null,
      description || null, notes || null,
      recognition_date || existing.recognition_date,
      payment_due_date || null,
      tax_category || existing.tax_category,
      invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : existing.invoice_qualified,
      amount !== undefined ? amount : existing.amount,
      req.user!.id, req.params.id
    ]
  );

  const row = queryOne('SELECT * FROM sga_expenses WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /sga/:id - Soft delete
router.delete('/:id', requireAuth, (req, res) => {
  execute(
    `UPDATE sga_expenses SET deleted_at=datetime('now'), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
