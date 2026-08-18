import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { createVendorRecord, syncCompanyFromVendor } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('budget'));

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const sgaPayeeOnly = req.query.sga_payee_only === 'true';
  let where = 'WHERE v.deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (v.name ILIKE ? OR v.vendor_type ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  // 販管費支払先のみフィルタ (companies.is_sga_payee=TRUE に紐付いた vendor のみ)
  const extraJoin = sgaPayeeOnly
    ? ` INNER JOIN companies c ON c.id = v.company_id AND c.is_sga_payee = TRUE AND c.deleted_at IS NULL`
    : '';
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM vendors v ${extraJoin} ${where}`, params)) as any).c;
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
    `SELECT v.*,
            COALESCE(pu.amount, 0) + COALESCE(sg.amount, 0) AS ytd_amount,
            COALESCE(pu.n, 0) + COALESCE(sg.n, 0) AS ytd_count
       FROM vendors v
       ${extraJoin}
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(p.amount), 0)::bigint AS amount, COUNT(*)::int AS n
           FROM purchases p
          WHERE p.vendor_id = v.id AND p.deleted_at IS NULL
            AND p.recognition_date BETWEEN ? AND ?
       ) pu ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(s.amount), 0)::bigint AS amount, COUNT(*)::int AS n
           FROM sga_expenses s
          WHERE s.vendor_id = v.id AND s.deleted_at IS NULL
            AND s.recognition_date BETWEEN ? AND ?
       ) sg ON TRUE
     ${where} ORDER BY v.name LIMIT ? OFFSET ?`,
    [yearStart, yearEnd, yearStart, yearEnd, ...params, limit, offset]
  );
  res.json({ ...paginatedResponse(rows, total, page, limit), ytd_year: new Date().getFullYear() });
});

router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM vendors WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requirePermission('budget', 'editor'), async (req, res) => {
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '仕入先名は必須です');
  /**
   * **`companies`（取引先マスター）にも同じ会社の行を作って紐づける**
   * （`company-directory.service.ts`）。ここで `vendors` だけに INSERT すると、
   * 取引先マスターに対応行の無い「孤立した仕入先」ができる。
   */
  const id = await createVendorRecord(
    { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes },
    req.user!.id,
  );
  const row = await queryOne('SELECT * FROM vendors WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT id FROM vendors WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  await execute(`UPDATE vendors SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?, invoice_registration_number=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, contact_name || null, email || null, phone || null, address || null, vendor_type || null, invoice_registration_number || null, notes || null, req.user!.id, req.params.id]);
  /**
   * **取引先マスター（`companies`）側にも写す。** 顧客側 (`syncCompanyFromCustomer`)
   * と同じ理由 — 片方だけ直ると社名・連絡先が画面によって食い違う。
   */
  await syncCompanyFromVendor(
    req.params.id as string,
    { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes },
    req.user!.id,
  );
  const row = await queryOne('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('budget', 'manager'), async (req, res) => {
  await execute(`UPDATE vendors SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
