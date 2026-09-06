import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateSgaBillingKey } from '../../../shared/services/billing-key.service';
import { buildSgaWhere, buildSgaWhereParts, buildSgaOrder } from '../list-query';
import { assertVendorCompanyId } from '../../../shared/services/company-directory.service';
import { CURRENT_ENTITY_CODE } from '../../../shared/constants/entity-default';
import { getLegalEntity } from '../../platform/services/legal-entity.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

// GET /sga - List with pagination, search, filters
router.get('/', async (req, res) => {
  const { page, limit, offset } = extractPagination(req);
  // 2026年10月の事業再編（P2 Round 1）: 会社（entity_code）で絞れるようにした。
  // **省略時は絞らない＝今までどおり全社ぶん**（`revenues.routes.ts` と同じ判断）
  const entityCode = req.query.entity_code as string | undefined;
  if (entityCode && !(await getLegalEntity(entityCode))) {
    throw new AppError(400, 'VALIDATION_ERROR', '不正な計上会社です');
  }
  const orderBy = buildSgaOrder(req.query);

  /*
   * ⚠️ **同じ表を5回走査していたのを1本にまとめた。**
   * 件数・合計・チップの件数・科目ごとの件数は、**同じ FROM・同じ WHERE**を
   * 何度も掛け直していただけだった（`buildSgaWhere` を2回呼んで、そのたびに
   * `sga_expenses` を頭から走査していた）。CTE を1本置いて `FILTER (WHERE …)` で
   * 数え分ければ、走査は1回で済む。
   *
   * ⚠️ **`hit` はチップの3つ（種別・出どころ・科目）だけを表す。**
   * チップの件数は「種別以外の絞り込みだけを掛けて数える」という決めごとなので、
   * CTE の WHERE には**チップ以外**を入れ、チップは列として持たせて数え分ける。
   * ここを混ぜると、**チップの数字と押した先の行数がずれる**（どちらもそれらしい
   * 数字なので画面を見ても気づけない）。
   *
   * ⚠️ **`?` の並びが命。** CTE の SELECT 句（チップ）が WHERE より前にあるので、
   * パラメータも「チップ → それ以外」の順で渡す。
   */
  const { base, chip } = buildSgaWhereParts(req.query);
  const aggSql = `
    WITH base AS (
      SELECT s.amount, s.expense_type, s.source, s.account_title_id, (${chip.sql}) AS hit
        FROM sga_expenses s
      ${base.where}
    )
    SELECT COUNT(*) FILTER (WHERE hit)                              AS total,
           COALESCE(SUM(s.amount) FILTER (WHERE hit), 0)            AS total_amount,
           COUNT(*) FILTER (WHERE s.expense_type = 'fixed')         AS fixed,
           COUNT(*) FILTER (WHERE s.expense_type = 'spot')          AS spot,
           COUNT(*) FILTER (WHERE s.source = 'staff')               AS staff,
           COUNT(*) FILTER (WHERE s.source = 'accounting')          AS accounting,
           COUNT(*)                                                 AS all,
           -- 科目ごとの件数。0 件のとき jsonb_object_agg は NULL を返すので
           -- COALESCE が要る（これまでの空オブジェクトと形を揃える）。
           -- COUNT(*) は BIGINT なので ::int にしないと jsonb で文字列になる
           COALESCE((SELECT jsonb_object_agg(k, n) FROM (
                       SELECT COALESCE(account_title_id, 'none') AS k, COUNT(*)::int AS n
                         FROM base GROUP BY 1) t), '{}'::jsonb)     AS account_title_counts
      FROM base s`;

  // 集計と行は互いに依存しないので同時に投げる。
  // ⚠️ **3本以上にしないこと** — 接続プールは 20 本で、財務ダッシュボードは
  // 1回の絞り込みで6つの API を同時に叩く（`connection.ts` のコメント参照）
  const { where, params } = buildSgaWhere(req.query);
  const [agg, rows] = await Promise.all([
    queryOne(aggSql, [...chip.params, ...base.params]) as Promise<Record<string, unknown> | undefined>,
    queryAll(
      `SELECT s.*, at.name AS account_title_name
         FROM sga_expenses s
         LEFT JOIN sga_account_titles at ON at.id = s.account_title_id
       ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
  ]);

  const total = Number(agg?.total ?? 0);
  const stateKeys = ['fixed', 'spot', 'staff', 'accounting', 'all'] as const;

  res.json({
    ...paginatedResponse(rows, total, page, limit),
    total_amount: Number(agg?.total_amount ?? 0),
    state_counts: Object.fromEntries(stateKeys.map((k) => [k, Number(agg?.[k] ?? 0)])),
    account_title_counts: (agg?.account_title_counts ?? {}) as Record<string, number>,
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
    expense_type, amortize_start, amortize_end, source, account_title_id, is_provisional
  } = req.body;

  if (!recognition_date) throw new AppError(400, 'VALIDATION_ERROR', '発生日は必須です');
  // `vendor_id` は任意項目（vendor_name の自由入力が正）。渡ってきたときだけ、
  // companies.id（Phase 3-2b）を直接指すため確かめる（`purchases.routes.ts` と同じ理由）
  if (vendor_id) await assertVendorCompanyId(vendor_id);

  const billing_key = generateSgaBillingKey(recognition_date, tax_category || 'tax10');
  const id = uuidv4();

  await execute(
    `INSERT INTO sga_expenses (id, entity_code, billing_key, vendor_name, vendor_id, settlement_method, settlement_number, settlement_url, description, notes, recognition_date, payment_due_date, tax_category, invoice_qualified, amount, expense_type, amortize_start, amortize_end, source, account_title_id, is_provisional, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, CURRENT_ENTITY_CODE, billing_key, vendor_name || null, vendor_id || null,
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
      // migration 268: 仮フラグ (purchases.is_provisional と同じ扱い)。既定 false
      is_provisional ? true : false,
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
    expense_type, amortize_start, amortize_end, source, account_title_id, is_provisional
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
    `UPDATE sga_expenses SET billing_key=?, vendor_name=?, vendor_id=?, settlement_method=?, settlement_number=?, settlement_url=?, description=?, notes=?, recognition_date=?, payment_due_date=?, tax_category=?, invoice_qualified=?, amount=?, expense_type=?, amortize_start=?, amortize_end=?, source=?, account_title_id=?, is_provisional=?, updated_at=NOW(), updated_by=? WHERE id=?`,
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
      // migration 268: 仮フラグ。渡さなければ既存値を保つ（上と同じ部分更新契約）
      is_provisional !== undefined ? !!is_provisional : existing.is_provisional,
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
