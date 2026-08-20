import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { createVendorRecord, updateCompanyDirectory } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

/**
 * Phase 3-3-9（`vendors` テーブル削除）以降、この画面（財務の仕入先タブ）は
 * `companies`（`is_vendor = TRUE`）だけを正として読み書きする。
 * `vendors` テーブル自体・legacy id（移行前の `vendors.id`）の解決（旧
 * `resolveLegacyVendorId`/`findVendorRow` の legacy 分岐）は削除した — 互換確認
 * 期間（`docs/reviews/phase3-2-plan.md`）中、legacy id 経由のアクセスは
 * 観測期間中0件だったことを確認済み。
 *
 * ⚠️ **権限の壁の扱いが変わった**（`docs/reviews/phase3-2-plan.md` Phase 3-3
 * でやること#1）。以前は `budget:editor`（`sales:owner` 無し）が名前・連絡先を
 * 直しても `vendors` テーブルだけが更新され、取引先マスター（`companies`）には
 * 反映されなかった（非公開のまま保つ設計）。`vendors` が無くなり書き込む先が
 * `companies` しか無くなったため、**この画面の編集（PUT）は `sales:owner` を
 * 必須にした**（ユーザー判断・2026-08-19）。`budget:editor` 単独では一覧・詳細の
 * 閲覧のみで、名前・連絡先等の編集はできない（403）。作成（POST）は新規の会社を
 * 作るだけで既存の共有マスターを書き換えるわけではないため、従来どおり
 * `budget:editor` のままでよい。
 */
const VENDOR_FIELDS = `
     co.id, co.name, co.contact_name, co.email, co.phone, co.address, co.vendor_type,
     co.invoice_registration_number, co.notes,
     co.is_customer, co.is_vendor, co.is_sga_payee, co.is_gmo_group,
     co.customer_closing_day, co.customer_payment_months, co.customer_payment_day,
     co.vendor_payment_months, co.vendor_payment_day,
     co.created_at, co.updated_at, co.created_by, co.updated_by, co.deleted_at`;

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
    `SELECT ${VENDOR_FIELDS},
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

/** `companies.id`（正）で引く。`is_vendor = TRUE` かつ生きている行だけ返す。 */
async function findVendorRow(rawId: string): Promise<Record<string, unknown> | null> {
  return await queryOne(
    `SELECT ${VENDOR_FIELDS} FROM companies co
     WHERE co.id = ? AND co.deleted_at IS NULL AND co.is_vendor = TRUE`,
    [rawId],
  ) as Record<string, unknown> | null;
}

router.get('/:id', async (req, res) => {
  const row = await findVendorRow(req.params.id);
  if (!row) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  res.json({ success: true, data: row });
});

router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '仕入先名は必須です');
  // `companies`（取引先マスター）に行を作る（`company-directory.service.ts`）。
  // `createVendorRecord` は companies.id を返す（Phase 3-3-9 より前は vendors.id を
  // 返し、company_id を引き直していた）。
  const companyId = await createVendorRecord(
    { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes },
    req.user!.id,
  );
  const row = await queryOne(`SELECT ${VENDOR_FIELDS} FROM companies co WHERE co.id = ?`, [companyId]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('sales', 'editor'), requirePermission('sales', 'owner'), async (req, res) => {
  // :id は companies.id。Phase 3-3-9（`vendors` テーブル削除）以降、
  // このテーブルへの読み書きは一切ない — companies を直接引いて直接更新する。
  const existing = await queryOne(
    'SELECT id FROM companies WHERE id = ? AND is_vendor = TRUE AND deleted_at IS NULL', [req.params.id],
  ) as { id: string } | null;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  await updateCompanyDirectory(
    existing.id,
    { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes },
    req.user!.id,
  );
  const row = await queryOne(`SELECT ${VENDOR_FIELDS} FROM companies co WHERE co.id = ?`, [existing.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  // :id は companies.id。`vendors` テーブルが無くなったので、この画面（財務の
  // 仕入先タブ）の削除は `companies.is_vendor` を FALSE にするだけでよい
  // （companies 行自体・顧客ロールは触らない）。旧実装と同じく、対象が既に無い/
  // 削除済みでもエラーにはしない。
  await execute(
    `UPDATE companies SET is_vendor = FALSE, updated_at = NOW(), updated_by = ?
     WHERE id = ? AND is_vendor = TRUE AND deleted_at IS NULL`,
    [req.user!.id, req.params.id],
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
