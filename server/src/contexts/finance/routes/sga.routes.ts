import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateSgaBillingKey } from '../../../shared/services/billing-key.service';
import { buildSgaWhere, buildSgaOrder } from '../list-query';
import { assertVendorCompanyId } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// GET /sga - List with pagination, search, filters
router.get('/', async (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  const { where, params } = buildSgaWhere(req.query);
  const orderBy = buildSgaOrder(req.query);

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM sga_expenses s ${where}`, params)) as any).c;
  const rows = await queryAll(
    `SELECT s.*, at.name AS account_title_name
       FROM sga_expenses s
       LEFT JOIN sga_account_titles at ON at.id = s.account_title_id
     ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  // 一覧の下に出す合計。**表示中のページではなく絞り込み全体**
  const sum = (await queryOne(
    `SELECT COALESCE(SUM(s.amount), 0) as s FROM sga_expenses s ${where}`, params)) as { s: string } | null;

  // 絞り込みチップの件数。**種別以外の絞り込みだけ**を掛けて数える
  const { expense_type: _t, source: _s, account_title_id: _a, ...restQuery } = req.query as Record<string, unknown>;
  const base = buildSgaWhere(restQuery as typeof req.query);
  const counts = (await queryOne(
    `SELECT COUNT(*) FILTER (WHERE s.expense_type = 'fixed') as fixed,
            COUNT(*) FILTER (WHERE s.expense_type = 'spot') as spot,
            COUNT(*) FILTER (WHERE s.source = 'staff') as staff,
            COUNT(*) FILTER (WHERE s.source = 'accounting') as accounting,
            COUNT(*) as all
     FROM sga_expenses s ${base.where}`, base.params)) as Record<string, string>;

  /**
   * 勘定科目ごとの件数 (migration 166)。**科目以外の絞り込みだけ**を掛けて数える。
   * `none` は「科目が入っていない行」— 166 より前の行はここに入る
   */
  const titleCounts = await queryAll(
    `SELECT COALESCE(s.account_title_id, 'none') AS key, COUNT(*)::int AS n
       FROM sga_expenses s ${base.where}
      GROUP BY COALESCE(s.account_title_id, 'none')`, base.params) as { key: string; n: number }[];

  res.json({
    ...paginatedResponse(rows, total, page, limit),
    total_amount: Number(sum?.s ?? 0),
    state_counts: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, Number(v)])),
    account_title_counts: Object.fromEntries(titleCounts.map((t) => [t.key, t.n])),
  });
});

/**
 * 勘定科目のマスター (migration 166)。
 *
 * **`/sga/:id` より前に置くこと** — 後ろに置くと `:id = 'account-titles'` として
 * 拾われ、404 になる。
 */
router.get('/account-titles', async (_req, res) => {
  const rows = await queryAll(
    `SELECT id, name, sort_order, is_active FROM sga_account_titles
      WHERE is_active = TRUE ORDER BY sort_order, name`);
  res.json({ success: true, data: rows });
});

// GET /sga/:id - Get single
router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM sga_expenses WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '販管費が見つかりません');
  res.json({ success: true, data: row });
});

// POST /sga - Create
router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const {
    vendor_name, vendor_id, settlement_method, settlement_number, settlement_url, description, notes,
    recognition_date, payment_due_date, tax_category, invoice_qualified, amount,
    expense_type, amortize_start, amortize_end, source, account_title_id
  } = req.body;

  if (!recognition_date) throw new AppError(400, 'VALIDATION_ERROR', '発生日は必須です');
  // `vendor_id` は任意項目（vendor_name の自由入力が正）。渡ってきたときだけ、
  // companies.id（Phase 3-2b）を直接指すため確かめる（`purchases.routes.ts` と同じ理由）
  if (vendor_id) await assertVendorCompanyId(vendor_id);

  const billing_key = generateSgaBillingKey(recognition_date, tax_category || 'tax10');
  const id = uuidv4();

  await execute(
    `INSERT INTO sga_expenses (id, billing_key, vendor_name, vendor_id, settlement_method, settlement_number, settlement_url, description, notes, recognition_date, payment_due_date, tax_category, invoice_qualified, amount, expense_type, amortize_start, amortize_end, source, account_title_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      account_title_id || null,
      req.user!.id
    ]
  );

  const row = await queryOne('SELECT * FROM sga_expenses WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// PUT /sga/:id - Update
router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM sga_expenses WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '販管費が見つかりません');

  const {
    vendor_name, vendor_id, settlement_method, settlement_number, settlement_url, description, notes,
    recognition_date, payment_due_date, tax_category, invoice_qualified, amount,
    expense_type, amortize_start, amortize_end, source, account_title_id
  } = req.body;
  // 新しく渡された vendor_id だけ確かめる（POST と同じ理由。既存値は再検証しない）
  if (vendor_id) await assertVendorCompanyId(vendor_id);

  // Regenerate billing_key if recognition_date or tax_category changed
  let billing_key = existing.billing_key;
  const newDate = recognition_date || existing.recognition_date;
  const newTax = tax_category || existing.tax_category;
  if (newDate !== existing.recognition_date || newTax !== existing.tax_category) {
    billing_key = generateSgaBillingKey(newDate, newTax);
  }

  await execute(
    `UPDATE sga_expenses SET billing_key=?, vendor_name=?, vendor_id=?, settlement_method=?, settlement_number=?, settlement_url=?, description=?, notes=?, recognition_date=?, payment_due_date=?, tax_category=?, invoice_qualified=?, amount=?, expense_type=?, amortize_start=?, amortize_end=?, source=?, account_title_id=?, updated_at=NOW(), updated_by=? WHERE id=?`,
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
      /**
       * **渡さなければ今の値を保つ。** 画面に欄が無いときに消えないようにする。
       *
       * この UPDATE の**他の列は渡さないと null になります** (`vendor_id || null` など)。
       * 画面のダイアログは毎回すべて送るのでいまは実害が出ていませんが、
       * **一部だけ送る呼び方をすると送らなかった列が消えます**。
       * 部分更新を足すときは、まずここを `!== undefined` の形に揃えてから。
       */
      account_title_id !== undefined ? (account_title_id || null) : existing.account_title_id,
      req.user!.id, req.params.id
    ]
  );

  const row = await queryOne('SELECT * FROM sga_expenses WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// DELETE /sga/:id - Soft delete
router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(
    `UPDATE sga_expenses SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
