import { Router, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { looksLikeGmoGroup } from '../../../shared/services/gmo-group';

const router = Router();

router.use(requireAuth);

const permissionOrder = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 } as const;

type PaymentTermKey =
  | 'customer_closing_day' | 'customer_payment_day' | 'vendor_payment_day'
  | 'customer_payment_months' | 'vendor_payment_months';

/**
 * `v` が「整数として書かれた値」かを見る。**空文字列・小数・NaN・真偽値はここで弾く**
 * （レビュー指摘・PR #190 P2）。`Number('')` は `0`、`Number(false)` も `0`、
 * `Number('1.5')` は範囲内の小数になり、そのまま範囲チェックだけ通すと
 * INTEGER 列への INSERT で Postgres が例外を返し、意図した 400 ではなく
 * 素の 500 になる。**数値と数字の文字列だけ**を受け付ける
 */
function toValidInt(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/**
 * 支払条件の例外を保存前に検査し、**書き込みに使う正規化済みの値**を返す
 * （レビュー指摘・PR #188 P2 / #190 P2）。
 *
 * DB の CHECK 制約（migration 196/198）と**同じ範囲**を先に見て、範囲外なら
 * 分かりやすい 400 で止める。ここを素通しすると `dueDateOf` に負数や
 * 極端に大きい月数が渡り、壊れた期日（1月に -1 か月で 0 月目のような日付）を
 * 作ってしまう。DB の CHECK は「アプリを経由しない書き込み」への最後の壁として残す
 * （2つの守りを同じ範囲に揃えないと、片方だけ緩い側で穴になる）。
 *
 * ⚠️ **検査を通しただけの生の値を書き込みに使わないこと。** `toValidInt` が
 * 受け付けても元の値（文字列 "3" 等）をそのまま params に渡すと、検査と
 * 実際に保存される値がずれる。ここで返した数値だけを使う
 */
function validatePaymentTerms(body: Record<string, unknown>): Record<PaymentTermKey, number | null | undefined> {
  const dayKeys: PaymentTermKey[] = ['customer_closing_day', 'customer_payment_day', 'vendor_payment_day'];
  const monthKeys: PaymentTermKey[] = ['customer_payment_months', 'vendor_payment_months'];
  const out = {} as Record<PaymentTermKey, number | null | undefined>;

  for (const key of dayKeys) {
    const v = body[key];
    if (v === undefined) { out[key] = undefined; continue; }
    if (v === null) { out[key] = null; continue; }
    const n = toValidInt(v);
    if (n === null || n < 1 || n > 31) {
      throw new AppError(400, 'VALIDATION_ERROR', `${key} は 1〜31 の整数にしてください`);
    }
    out[key] = n;
  }
  for (const key of monthKeys) {
    const v = body[key];
    if (v === undefined) { out[key] = undefined; continue; }
    if (v === null) { out[key] = null; continue; }
    const n = toValidInt(v);
    if (n === null || n < 0 || n > 6) {
      throw new AppError(400, 'VALIDATION_ERROR', `${key} は 0〜6 の整数にしてください`);
    }
    out[key] = n;
  }
  return out;
}

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
// 売上 (customer_id 経由。Phase 3-2a 以降 revenues.customer_id は companies.id を直接指す)、
// 仕入・販管費 (vendor_id 経由。Phase 3-2b 以降 purchases/sga_expenses.vendor_id も
// companies.id を直接指す) の合計を返す
router.get('/:id/summary', requirePermission('sales'), async (req, res) => {
  const company = await queryOne(
    `SELECT co.id FROM companies co WHERE co.id = ? AND co.deleted_at IS NULL`,
    [req.params.id]
  ) as any;
  if (!company) throw new AppError(404, 'NOT_FOUND', '取引先が見つかりません');

  // ⚠️ `is_customer` / `is_vendor` では絞らない（レビュー指摘・PR #199 P2 と同じ理由）。
  // Phase 3-2a/3-2b 以降 customer_id / vendor_id は companies.id を直接指すので、
  // あとでロールのチェックを外しても過去の売上・仕入・販管費行はこの会社を
  // 指したまま残る。ここでロールの列を見ると「ロールを外した瞬間に実績がゼロになる」
  // ことになる
  const [revRow, purRow, sgaRow] = await Promise.all([
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM revenues
       WHERE customer_id = ? AND deleted_at IS NULL AND status = 'confirmed'`,
      [company.id]
    ) as Promise<any>,
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM purchases
       WHERE vendor_id = ? AND deleted_at IS NULL`,
      [company.id]
    ) as Promise<any>,
    queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
       FROM sga_expenses
       WHERE vendor_id = ? AND deleted_at IS NULL`,
      [company.id]
    ) as Promise<any>,
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
    is_gmo_group,
  } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '取引先名は必須です');
  // **検査を通した正規化済みの値を使う**（生の req.body の値は使わない・レビュー指摘 PR #190 P2）
  const {
    customer_closing_day, customer_payment_months, customer_payment_day,
    vendor_payment_months, vendor_payment_day,
  } = validatePaymentTerms(req.body ?? {});
  const canEditBudget = await hasPermission(req, 'budget', 'editor');
  if (is_vendor && !canEditBudget) {
    throw new AppError(403, 'FORBIDDEN', '仕入先情報を登録する権限がありません');
  }

  /**
   * **グループ会社の印**（migration 192）。渡してこない道（MCP・取込）では
   * 社名から見立てる（ご指示: GMO とついているものはすべてグループ）。
   * **渡してきたらそちらが正** — 画面のチェックボックスで外せます。
   */
  const groupFlag = is_gmo_group === undefined ? looksLikeGmoGroup(name) : is_gmo_group === true;

  const id = uuidv4();
  await execute(
    `INSERT INTO companies (id, name, short_name, contact_name, email, phone, address,
       is_customer, is_vendor, is_sga_payee, vendor_type, invoice_registration_number, notes,
       is_gmo_group, customer_closing_day, customer_payment_months, customer_payment_day,
       vendor_payment_months, vendor_payment_day, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, short_name || null, contact_name || null, email || null, phone || null,
     address || null, is_customer ? true : false, is_vendor ? true : false,
     is_sga_payee ? true : false,
     vendor_type || null, invoice_registration_number || null, notes || null,
     groupFlag,
     // **お金のルール ⑤ と同じ決めごと**（migration 175/196）: NULL = 会社のルールに従う。
     // 0 を既定値として入れないこと（「決めていない」と「0か月後」を区別できなくなる）
     customer_closing_day ?? null, customer_payment_months ?? null, customer_payment_day ?? null,
     vendor_payment_months ?? null, vendor_payment_day ?? null,
     req.user!.id]
  );

  // 顧客ロールあり → customers レコード自動生成
  // **印も一緒に渡す。** 案件のグループ区分は `customers` 側を見るので、
  // ここで落とすと取引先マスターでチェックを付けても案件に効きません
  if (is_customer) {
    const cid = uuidv4();
    await execute(
      // Phase 3-3-4: 支払条件の例外は companies だけに書く（上の INSERT INTO companies）。
      // 以前は customers 側にも写していた（旧イメージへ戻すロールバックの間、旧コードが
      // customers.closing_day 等を直接読むための保険）が、migration 200/201 以降
      // イメージだけを戻すロールバックは既に使えなくなっており（本番を戻す手段は
      // DBバックアップからの復元のみ）、customers.closing_day/payment_months/payment_day を
      // 読むコードも現存しない。customers テーブル削除（Phase 3-3-5）前にこの書き込みを
      // 止めておかないと、列削除（Phase 3-3-6）で undefined_column になる
      `INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes,
         is_gmo_group, company_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid, name, short_name || null, contact_name || null, email || null, phone || null,
       address || null, notes || null, groupFlag,
       id, req.user!.id]
    );
  }

  // 仕入先ロールあり → vendors レコード自動生成
  if (is_vendor) {
    const vid = uuidv4();
    await execute(
      // Phase 3-3-4: 支払条件の例外は companies だけに書く（顧客側と同じ理由・上記コメント参照）
      `INSERT INTO vendors (id, name, contact_name, email, phone, address, vendor_type,
         invoice_registration_number, notes, company_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [vid, name, contact_name || null, email || null, phone || null, address || null,
       vendor_type || null, invoice_registration_number || null, notes || null,
       id, req.user!.id]
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
  // **検査を通した正規化済みの値を使う**（生の req.body の値は使わない・レビュー指摘 PR #190 P2）
  const {
    customer_closing_day, customer_payment_months, customer_payment_day,
    vendor_payment_months, vendor_payment_day,
  } = validatePaymentTerms(req.body ?? {});

  const {
    name, short_name, contact_name, email, phone, address,
    is_customer, is_vendor, is_sga_payee, vendor_type, invoice_registration_number, notes,
    is_gmo_group,
  } = req.body;
  const canEditBudget = await hasPermission(req, 'budget', 'editor');
  if (!canEditBudget && (existing.is_vendor || is_vendor || vendor_type !== undefined || invoice_registration_number !== undefined)) {
    throw new AppError(403, 'FORBIDDEN', '仕入先情報を更新する権限がありません');
  }

  /**
   * **渡されなければ今の値を保つ**（`customers.routes` と同じ守り方）。
   * この UPDATE は送られた値でそのまま上書きするので、欄を持たない古い画面から
   * 保存されるだけで**グループの印が黙って外れます** — 印が外れると、その会社の
   * 案件が次に保存されたときグループ外になり、見積に定価が並びます。
   * **社名から見立て直しません** — 一度外した印が保存のたびに戻ると、
   * 外した人には「直したのに直らない」としか見えません。
   * 支払条件の例外5列も同じ守り方（欄を持たない呼び出しから黙って消えない）。
   */
  const groupFlag = is_gmo_group === undefined
    ? existing.is_gmo_group === true
    : is_gmo_group === true;
  const keep = (v: unknown, existingVal: unknown) => (v === undefined ? existingVal : (v ?? null));

  // **`keep()` した後の値を companies と customers/vendors の両方に書く**
  // （レビュー指摘・PR #190 P2）。ロールバックの間、旧コードは
  // customers/vendors 側の列だけを読むので、companies にしか書かないと
  // 「直したのに、旧イメージへ戻すと元の値に戻る」ことになる
  const resolvedCustomerClosingDay    = keep(customer_closing_day, existing.customer_closing_day);
  const resolvedCustomerPaymentMonths = keep(customer_payment_months, existing.customer_payment_months);
  const resolvedCustomerPaymentDay    = keep(customer_payment_day, existing.customer_payment_day);
  const resolvedVendorPaymentMonths   = keep(vendor_payment_months, existing.vendor_payment_months);
  const resolvedVendorPaymentDay      = keep(vendor_payment_day, existing.vendor_payment_day);

  await execute(
    `UPDATE companies SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?,
       is_customer=?, is_vendor=?, is_sga_payee=?, vendor_type=?, invoice_registration_number=?, notes=?,
       is_gmo_group=?, customer_closing_day=?, customer_payment_months=?, customer_payment_day=?,
       vendor_payment_months=?, vendor_payment_day=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, short_name || null, contact_name || null, email || null, phone || null,
     address || null, is_customer ? true : false, is_vendor ? true : false,
     is_sga_payee ? true : false,
     vendor_type || null, invoice_registration_number || null, notes || null,
     groupFlag,
     resolvedCustomerClosingDay, resolvedCustomerPaymentMonths, resolvedCustomerPaymentDay,
     resolvedVendorPaymentMonths, resolvedVendorPaymentDay,
     req.user!.id, req.params.id]
  );

  // 紐付き customers / vendors の基本情報も同期
  // **印もここで写す**（正は `customers` 側。写さないと画面のチェックが案件に効かない）
  // Phase 3-3-4: 支払条件の例外（closing_day/payment_months/payment_day）は
  // companies だけに書く（上の UPDATE companies）。理由は POST 側と同じ
  // （customers/vendors の同列を読むコードは無く、旧イメージへ戻すロールバックも
  // migration 200/201 以降使えない）
  await execute(
    `UPDATE customers SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?,
       notes=?, is_gmo_group=?,
       updated_at=NOW(), updated_by=? WHERE company_id=? AND deleted_at IS NULL`,
    [name, short_name || null, contact_name || null, email || null, phone || null,
     address || null, notes || null, groupFlag,
     req.user!.id, req.params.id]
  );
  if (canEditBudget) {
    await execute(
      `UPDATE vendors SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?,
         invoice_registration_number=?, notes=?,
         updated_at=NOW(), updated_by=?
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
      // Phase 3-3-4: 支払条件の例外は companies 側にのみ既に入っている（上の UPDATE companies）
      await execute(
        `INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes,
           is_gmo_group, company_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cid, name, short_name || null, contact_name || null, email || null, phone || null,
         address || null, notes || null, groupFlag,
         req.params.id, req.user!.id]
      );
    }
  }
  if (is_vendor && canEditBudget) {
    const linked = await queryOne(
      'SELECT id FROM vendors WHERE company_id=? AND deleted_at IS NULL', [req.params.id]
    );
    if (!linked) {
      const vid = uuidv4();
      // Phase 3-3-4: 支払条件の例外は companies 側にのみ既に入っている（上の UPDATE companies）
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
