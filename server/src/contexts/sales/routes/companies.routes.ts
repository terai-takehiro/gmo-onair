import { Router, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

router.use(requireAuth);

const permissionOrder = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 } as const;

async function hasPermission(
  req: Request,
  module: string,
  minLevel: keyof typeof permissionOrder = 'reader'
): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === 'system_admin') return true;

  let userLevel = req.user.permissions?.[module];

  if (!userLevel && req.user.permissions && Object.keys(req.user.permissions).length === 0) {
    const row = await queryOne(
      'SELECT access_level FROM user_permissions WHERE user_id = ? AND module = ?',
      [req.user.id, module]
    ) as { access_level?: string } | undefined;
    userLevel = row?.access_level;
  }

  return (permissionOrder[userLevel as keyof typeof permissionOrder] ?? 0) >= permissionOrder[minLevel];
}

// ─── 一覧 ────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('sales'), async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const role = req.query.role as string; // 'customer' | 'vendor' | 'both'
  const canReadBudget = await hasPermission(req, 'budget', 'reader');

  let where = 'WHERE co.deleted_at IS NULL';
  const params: unknown[] = [];

  if (search) {
    const s = String(search).slice(0, 100).replace(/[%_\\]/g, '\\$&');
    where += ` AND (co.name ILIKE ? ESCAPE '\\' OR co.short_name ILIKE ? ESCAPE '\\' OR co.contact_name ILIKE ? ESCAPE '\\')`;
    params.push(`%${s}%`, `%${s}%`, `%${s}%`);
  }
  if (role === 'customer') { where += ' AND co.is_customer = TRUE'; }
  else if (role === 'vendor') {
    if (!canReadBudget) throw new AppError(403, 'FORBIDDEN', '仕入先情報を表示する権限がありません');
    where += ' AND co.is_vendor = TRUE';
  }
  else if (role === 'sga_payee') { where += ' AND co.is_sga_payee = TRUE'; }
  else if (role === 'both') {
    if (!canReadBudget) throw new AppError(403, 'FORBIDDEN', '仕入先情報を表示する権限がありません');
    where += ' AND co.is_customer = TRUE AND co.is_vendor = TRUE';
  }
  else if (role === 'other') { where += ' AND co.is_customer = FALSE AND co.is_vendor = FALSE AND co.is_sga_payee = FALSE'; }

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM companies co ${where}`, params)) as any).c;
  const rows = await queryAll(
    `SELECT co.*,
       cu.id as customer_id,
       v.id  as vendor_id
     FROM companies co
     LEFT JOIN customers cu ON cu.company_id = co.id AND cu.deleted_at IS NULL
     LEFT JOIN vendors   v  ON v.company_id  = co.id AND v.deleted_at  IS NULL
     ${where}
     ORDER BY co.name
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const responseRows = canReadBudget
    ? rows
    : rows.map((row: any) => ({ ...row, vendor_id: null }));

  res.json(paginatedResponse(responseRows, total, page, limit));
});

// ─── 詳細 ────────────────────────────────────────────────────────────────────
router.get('/:id', requirePermission('sales'), async (req, res) => {
  const canReadBudget = await hasPermission(req, 'budget', 'reader');
  const row = await queryOne(
    `SELECT co.*,
       cu.id as customer_id,
       v.id  as vendor_id
     FROM companies co
     LEFT JOIN customers cu ON cu.company_id = co.id AND cu.deleted_at IS NULL
     LEFT JOIN vendors   v  ON v.company_id  = co.id AND v.deleted_at  IS NULL
     WHERE co.id = ? AND co.deleted_at IS NULL`,
    [req.params.id]
  ) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', '取引先が見つかりません');
  if (!canReadBudget) row.vendor_id = null;
  res.json({ success: true, data: row });
});

// ─── 取引先別 収支サマリー ─────────────────────────────────────────────────────
// 売上 (customer_id 経由)、仕入 (vendor_id 経由)、販管費 (vendor_id 経由) の合計を返す
router.get('/:id/summary', requirePermission('sales'), async (req, res) => {
  const company = await queryOne(
    `SELECT co.id,
       cu.id as customer_id,
       v.id  as vendor_id
     FROM companies co
     LEFT JOIN customers cu ON cu.company_id = co.id AND cu.deleted_at IS NULL
     LEFT JOIN vendors   v  ON v.company_id  = co.id AND v.deleted_at  IS NULL
     WHERE co.id = ? AND co.deleted_at IS NULL`,
    [req.params.id]
  ) as any;
  if (!company) throw new AppError(404, 'NOT_FOUND', '取引先が見つかりません');

  const [revRow, purRow, sgaRow] = await Promise.all([
    company.customer_id
      ? queryOne(
          `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
           FROM revenues
           WHERE customer_id = ? AND deleted_at IS NULL AND status = 'confirmed'`,
          [company.customer_id]
        ) as Promise<any>
      : Promise.resolve({ total: 0, count: 0 }),
    company.vendor_id
      ? queryOne(
          `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
           FROM purchases
           WHERE vendor_id = ? AND deleted_at IS NULL`,
          [company.vendor_id]
        ) as Promise<any>
      : Promise.resolve({ total: 0, count: 0 }),
    company.vendor_id
      ? queryOne(
          `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
           FROM sga_expenses
           WHERE vendor_id = ? AND deleted_at IS NULL`,
          [company.vendor_id]
        ) as Promise<any>
      : Promise.resolve({ total: 0, count: 0 }),
  ]);

  res.json({
    success: true,
    data: {
      company_id: req.params.id,
      revenue: { total: Number(revRow?.total ?? 0), count: Number(revRow?.count ?? 0) },
      purchase: { total: Number(purRow?.total ?? 0), count: Number(purRow?.count ?? 0) },
      sga: { total: Number(sgaRow?.total ?? 0), count: Number(sgaRow?.count ?? 0) },
    },
  });
});

// ─── 新規作成 ─────────────────────────────────────────────────────────────────
// is_customer=true の場合 customers レコードも自動生成
// is_vendor=true   の場合 vendors   レコードも自動生成
router.post('/', requirePermission('sales', 'owner'), async (req, res) => {
  const {
    name, short_name, contact_name, email, phone, address,
    is_customer, is_vendor, is_sga_payee, vendor_type, invoice_registration_number, notes,
  } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '取引先名は必須です');
  const canEditBudget = await hasPermission(req, 'budget', 'editor');
  if (is_vendor && !canEditBudget) {
    throw new AppError(403, 'FORBIDDEN', '仕入先情報を登録する権限がありません');
  }

  const id = uuidv4();
  await execute(
    `INSERT INTO companies (id, name, short_name, contact_name, email, phone, address,
       is_customer, is_vendor, is_sga_payee, vendor_type, invoice_registration_number, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, short_name || null, contact_name || null, email || null, phone || null,
     address || null, is_customer ? true : false, is_vendor ? true : false,
     is_sga_payee ? true : false,
     vendor_type || null, invoice_registration_number || null, notes || null, req.user!.id]
  );

  // 顧客ロールあり → customers レコード自動生成
  if (is_customer) {
    const cid = uuidv4();
    await execute(
      `INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes, company_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid, name, short_name || null, contact_name || null, email || null, phone || null,
       address || null, notes || null, id, req.user!.id]
    );
  }

  // 仕入先ロールあり → vendors レコード自動生成
  if (is_vendor) {
    const vid = uuidv4();
    await execute(
      `INSERT INTO vendors (id, name, contact_name, email, phone, address, vendor_type,
         invoice_registration_number, notes, company_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [vid, name, contact_name || null, email || null, phone || null, address || null,
       vendor_type || null, invoice_registration_number || null, notes || null, id, req.user!.id]
    );
  }

  const row = await queryOne(
    `SELECT co.*, cu.id as customer_id, v.id as vendor_id
     FROM companies co
     LEFT JOIN customers cu ON cu.company_id = co.id AND cu.deleted_at IS NULL
     LEFT JOIN vendors   v  ON v.company_id  = co.id AND v.deleted_at  IS NULL
     WHERE co.id = ?`,
    [id]
  );
  res.status(201).json({ success: true, data: row });
});

// ─── 更新 ─────────────────────────────────────────────────────────────────────
// companies レコードを更新し、紐付いた customers / vendors も連動更新
router.put('/:id', requirePermission('sales', 'owner'), async (req, res) => {
  const existing = await queryOne(
    'SELECT * FROM companies WHERE id = ? AND deleted_at IS NULL', [req.params.id]
  ) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '取引先が見つかりません');

  const {
    name, short_name, contact_name, email, phone, address,
    is_customer, is_vendor, is_sga_payee, vendor_type, invoice_registration_number, notes,
  } = req.body;
  const canEditBudget = await hasPermission(req, 'budget', 'editor');
  if (!canEditBudget && (existing.is_vendor || is_vendor || vendor_type !== undefined || invoice_registration_number !== undefined)) {
    throw new AppError(403, 'FORBIDDEN', '仕入先情報を更新する権限がありません');
  }

  await execute(
    `UPDATE companies SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?,
       is_customer=?, is_vendor=?, is_sga_payee=?, vendor_type=?, invoice_registration_number=?, notes=?,
       updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, short_name || null, contact_name || null, email || null, phone || null,
     address || null, is_customer ? true : false, is_vendor ? true : false,
     is_sga_payee ? true : false,
     vendor_type || null, invoice_registration_number || null, notes || null,
     req.user!.id, req.params.id]
  );

  // 紐付き customers / vendors の基本情報も同期
  await execute(
    `UPDATE customers SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?,
       notes=?, updated_at=NOW(), updated_by=? WHERE company_id=? AND deleted_at IS NULL`,
    [name, short_name || null, contact_name || null, email || null, phone || null,
     address || null, notes || null, req.user!.id, req.params.id]
  );
  if (canEditBudget) {
    await execute(
      `UPDATE vendors SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?,
         invoice_registration_number=?, notes=?, updated_at=NOW(), updated_by=?
         WHERE company_id=? AND deleted_at IS NULL`,
      [name, contact_name || null, email || null, phone || null, address || null,
       vendor_type || null, invoice_registration_number || null, notes || null,
       req.user!.id, req.params.id]
    );
  }

  // ロール追加時: 対応する子レコードがなければ生成
  if (is_customer) {
    const linked = await queryOne(
      'SELECT id FROM customers WHERE company_id=? AND deleted_at IS NULL', [req.params.id]
    );
    if (!linked) {
      const cid = uuidv4();
      await execute(
        `INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes, company_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cid, name, short_name || null, contact_name || null, email || null, phone || null,
         address || null, notes || null, req.params.id, req.user!.id]
      );
    }
  }
  if (is_vendor && canEditBudget) {
    const linked = await queryOne(
      'SELECT id FROM vendors WHERE company_id=? AND deleted_at IS NULL', [req.params.id]
    );
    if (!linked) {
      const vid = uuidv4();
      await execute(
        `INSERT INTO vendors (id, name, contact_name, email, phone, address, vendor_type,
           invoice_registration_number, notes, company_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vid, name, contact_name || null, email || null, phone || null, address || null,
         vendor_type || null, invoice_registration_number || null, notes || null,
         req.params.id, req.user!.id]
      );
    }
  }

  const row = await queryOne(
    `SELECT co.*, cu.id as customer_id, v.id as vendor_id
     FROM companies co
     LEFT JOIN customers cu ON cu.company_id = co.id AND cu.deleted_at IS NULL
     LEFT JOIN vendors   v  ON v.company_id  = co.id AND v.deleted_at  IS NULL
     WHERE co.id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: row });
});

// ─── 削除（ソフト）─────────────────────────────────────────────────────────────
router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(
    `UPDATE companies SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
