import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateSgaBillingKey } from '../../../shared/services/billing-key.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('budget'));

// GET /sga - List with pagination, search, filters
router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const dateFrom = req.query.date_from as string;
  const dateTo = req.query.date_to as string;
  const source = req.query.source as string;
  const recognitionMonth = req.query.recognition_month as string;

  let where = 'WHERE s.deleted_at IS NULL';
  const params: unknown[] = [];

  if (source && (source === 'staff' || source === 'accounting')) {
    where += ` AND s.source = ?`;
    params.push(source);
  }
  if (search) {
    where += ` AND (s.vendor_name ILIKE ? OR s.description ILIKE ?)`;
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
  if (recognitionMonth) {
    // recognition_date は TEXT (YYYY-MM-DD) のため前方一致
    where += ` AND s.recognition_date LIKE ?`;
    params.push(`${recognitionMonth}-%`);
  }

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM sga_expenses s ${where}`, params)) as any).c;
  const rows = await queryAll(
    `SELECT s.* FROM sga_expenses s ${where} ORDER BY s.recognition_date DESC, s.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

// GET /sga/:id - Get single
router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM sga_expenses WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '販管費が見つかりません');
  res.json({ success: true, data: row });
});

// POST /sga - Create
router.post('/', requirePermission('budget', 'editor'), async (req, res) => {
  const {
    vendor_name, vendor_id, settlement_method, settlement_number, settlement_url, description, notes,
    recognition_date, payment_due_date, tax_category, invoice_qualified, amount,
    expense_type, amortize_start, amortize_end, source
  } = req.body;

  if (!recognition_date) throw new AppError(400, 'VALIDATION_ERROR', '発生日は必須です');

  const billing_key = generateSgaBillingKey(recognition_date, tax_category || 'tax10');
  const id = uuidv4();

  await execute(
    `INSERT INTO sga_expenses (id, billing_key, vendor_name, vendor_id, settlement_method, settlement_number, settlement_url, description, notes, recognition_date, payment_due_date, tax_category, invoice_qualified, amount, expense_type, amortize_start, amortize_end, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, billing_key, vendor_name || null, vendor_id || null,
      settlement_method || null, settlement_number || null, settlement_url || null,
      description || null, notes || null,
      recognition_date, payment_due_date || null,
      tax_category || 'tax10',
      invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : 1,
      amount || 0,
      expense_type || 'spot',
      amortize_start || null, amortize_end || null,
      source || 'staff',
      req.user!.id
    ]
  );

  const row = await queryOne('SELECT * FROM sga_expenses WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /sga/:id - Update
router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM sga_expenses WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '販管費が見つかりません');

  const {
    vendor_name, vendor_id, settlement_method, settlement_number, settlement_url, description, notes,
    recognition_date, payment_due_date, tax_category, invoice_qualified, amount,
    expense_type, amortize_start, amortize_end, source
  } = req.body;

  // Regenerate billing_key if recognition_date or tax_category changed
  let billing_key = existing.billing_key;
  const newDate = recognition_date || existing.recognition_date;
  const newTax = tax_category || existing.tax_category;
  if (newDate !== existing.recognition_date || newTax !== existing.tax_category) {
    billing_key = generateSgaBillingKey(newDate, newTax);
  }

  await execute(
    `UPDATE sga_expenses SET billing_key=?, vendor_name=?, vendor_id=?, settlement_method=?, settlement_number=?, settlement_url=?, description=?, notes=?, recognition_date=?, payment_due_date=?, tax_category=?, invoice_qualified=?, amount=?, expense_type=?, amortize_start=?, amortize_end=?, source=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [
      billing_key, vendor_name || null, vendor_id || null,
      settlement_method || null, settlement_number || null, settlement_url || null,
      description || null, notes || null,
      recognition_date || existing.recognition_date,
      payment_due_date || null,
      tax_category || existing.tax_category,
      invoice_qualified !== undefined ? (invoice_qualified ? 1 : 0) : existing.invoice_qualified,
      amount !== undefined ? amount : existing.amount,
      expense_type !== undefined ? expense_type : existing.expense_type,
      amortize_start !== undefined ? (amortize_start || null) : existing.amortize_start,
      amortize_end !== undefined ? (amortize_end || null) : existing.amortize_end,
      source || existing.source || 'staff',
      req.user!.id, req.params.id
    ]
  );

  const row = await queryOne('SELECT * FROM sga_expenses WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /sga/:id - Soft delete
router.delete('/:id', requirePermission('budget', 'manager'), async (req, res) => {
  await execute(
    `UPDATE sga_expenses SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
