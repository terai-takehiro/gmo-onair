import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { createVendorRecord } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('budget'));

/**
 * `companies`（`is_vendor = TRUE`）を正として読み書きする。
 *
 * Phase 3-3-7〜9（migration 205）: `vendors` テーブル自体を削除した。以前は
 * `budget:editor`（`sales:owner` を持たない経理担当）の編集を `vendors` だけに
 * 留め、`companies`（全社共有の取引先マスター）への反映は `sales:owner` を
 * 持つ人が保存したときだけに限っていた（PR #183 P2 の「権限の壁」）。
 * `vendors` テーブルが無くなり書き込み先が `companies` 1つしかなくなったため、
 * **この壁は作り直さず、`budget:editor` の編集がそのまま `companies` に反映される
 * 形にする**（ユーザー承認済みの設計判断・シンプルさを優先）。
 * 旧URL（移行前の `vendors.id`）互換のフォールバックも削除した（Phase 3-3-1 で
 * legacy URL の実利用が本番・検証とも0件だったことを確認済み）。
 */
router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const sgaPayeeOnly = req.query.sga_payee_only === 'true';
  let where = 'WHERE co.deleted_at IS NULL AND co.is_vendor = TRUE';
  const params: unknown[] = [];
  if (search) { where += ` AND (co.name ILIKE ? OR co.vendor_type ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  // 販管費支払先のみフィルタ (companies.is_sga_payee=TRUE に紐付いた vendor のみ)
  if (sgaPayeeOnly) { where += ` AND co.is_sga_payee = TRUE`; }
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM companies co ${where}`, params)) as any).c;
  /**
   * 今年度の取引額 (v4・モックの「取引額」列)。
   *
   * **期間は今年度（暦年）に決めた。** 決めずに「全期間」にすると、
   * 5年前に1回だけ使った相手が上に来て、いま使っている相手が埋もれる。
   * 切り替えは後から足せる（列の意味が変わるので、まず1つに決める）。
   *
   * 仕入 (`purchases`) と販管費 (`sga_expenses`) の**両方**を足す。
   * 仕入だけだと、家賃や通信費の相手が「取引ゼロ」に見える。
   */
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;
  const rows = await queryAll(
    `SELECT co.*,
            COALESCE(pu.amount, 0) + COALESCE(sg.amount, 0) AS ytd_amount,
            COALESCE(pu.n, 0) + COALESCE(sg.n, 0) AS ytd_count
       FROM companies co
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(p.amount), 0)::bigint AS amount, COUNT(*)::int AS n
           FROM purchases p
          WHERE p.vendor_id = co.id AND p.deleted_at IS NULL
            AND p.recognition_date BETWEEN ? AND ?
       ) pu ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(s.amount), 0)::bigint AS amount, COUNT(*)::int AS n
           FROM sga_expenses s
          WHERE s.vendor_id = co.id AND s.deleted_at IS NULL
            AND s.recognition_date BETWEEN ? AND ?
       ) sg ON TRUE
     ${where} ORDER BY co.name LIMIT ? OFFSET ?`,
    [yearStart, yearEnd, yearStart, yearEnd, ...params, limit, offset]
  );
  res.json({ ...paginatedResponse(rows, total, page, limit), ytd_year: new Date().getFullYear() });
});

router.get('/:id', async (req, res) => {
  const row = await queryOne(
    `SELECT co.* FROM companies co WHERE co.id = ? AND co.deleted_at IS NULL AND co.is_vendor = TRUE`,
    [req.params.id],
  ) as Record<string, unknown> | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requirePermission('budget', 'editor'), async (req, res) => {
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '仕入先名は必須です');
  // **`companies`（取引先マスター）に `is_vendor=TRUE` の行を作る**（`company-directory.service.ts`）。
  const companyId = await createVendorRecord(
    { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes },
    req.user!.id,
  );
  const row = await queryOne(`SELECT co.* FROM companies co WHERE co.id = ?`, [companyId]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM companies WHERE id = ? AND deleted_at IS NULL AND is_vendor = TRUE', [req.params.id],
  ) as { id: string } | null;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  await execute(
    `UPDATE companies SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?,
       invoice_registration_number=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, contact_name || null, email || null, phone || null, address || null, vendor_type || null,
     invoice_registration_number || null, notes || null, req.user!.id, existing.id]);
  const row = await queryOne(`SELECT co.* FROM companies co WHERE co.id = ?`, [existing.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('budget', 'manager'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id FROM companies WHERE id = ? AND deleted_at IS NULL AND is_vendor = TRUE', [req.params.id],
  ) as { id: string } | null;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  // 仕入先ロールだけを外す（会社そのもの・顧客ロールは触らない）
  await execute(
    `UPDATE companies SET is_vendor = FALSE, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [req.user!.id, existing.id],
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
