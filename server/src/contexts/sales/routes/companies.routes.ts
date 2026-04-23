import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

router.use(requireAuth);

// ─── 一覧 ────────────────────────────────────────────────────────────────────
router.get('/', requirePermission('sales'), async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const role = req.query.role as string; // 'customer' | 'vendor' | 'both'

  let where = 'WHERE co.deleted_at IS NULL';
  const params: unknown[] = [];

  if (search) {
    const s = String(search).slice(0, 100).replace(/[%_\\]/g, '\\$&');
    where += ` AND (co.name ILIKE ? ESCAPE '\\' OR co.short_name ILIKE ? ESCAPE '\\' OR co.contact_name ILIKE ? ESCAPE '\\')`;
    params.push(`%${s}%`, `%${s}%`, `%${s}%`);
  }
  if (role === 'customer') { where += ' AND co.is_customer = TRUE'; }
  else if (role === 'vendor') { where += ' AND co.is_vendor = TRUE'; }
  else if (role === 'both') { where += ' AND co.is_customer = TRUE AND co.is_vendor = TRUE'; }

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
  res.json(paginatedResponse(rows, total, page, limit));
});

// ─── 詳細 ────────────────────────────────────────────────────────────────────
router.get('/:id', requirePermission('sales'), async (req, res) => {
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
  res.json({ success: true, data: row });
});

// ─── 新規作成 ─────────────────────────────────────────────────────────────────
// is_customer=true の場合 customers レコードも自動生成
// is_vendor=true   の場合 vendors   レコードも自動生成
router.post('/', requirePermission('sales', 'owner'), async (req, res) => {
  const {
    name, short_name, contact_name, email, phone, address,
    is_customer, is_vendor, vendor_type, invoice_registration_number, notes,
  } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '取引先名は必須です');

  const id = uuidv4();
  await execute(
    `INSERT INTO companies (id, name, short_name, contact_name, email, phone, address,
       is_customer, is_vendor, vendor_type, invoice_registration_number, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, short_name || null, contact_name || null, email || null, phone || null,
     address || null, is_customer ? true : false, is_vendor ? true : false,
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
    is_customer, is_vendor, vendor_type, invoice_registration_number, notes,
  } = req.body;

  await execute(
    `UPDATE companies SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?,
       is_customer=?, is_vendor=?, vendor_type=?, invoice_registration_number=?, notes=?,
       updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, short_name || null, contact_name || null, email || null, phone || null,
     address || null, is_customer ? true : false, is_vendor ? true : false,
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
  await execute(
    `UPDATE vendors SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?,
       invoice_registration_number=?, notes=?, updated_at=NOW(), updated_by=?
       WHERE company_id=? AND deleted_at IS NULL`,
    [name, contact_name || null, email || null, phone || null, address || null,
     vendor_type || null, invoice_registration_number || null, notes || null,
     req.user!.id, req.params.id]
  );

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
  if (is_vendor) {
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
