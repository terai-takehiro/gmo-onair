import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission, meetsPermissionLevel } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { createVendorRecord, syncCompanyFromVendor } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('budget'));

/**
 * Phase 3-2b: 一覧・詳細は `companies`（`is_vendor = TRUE`）を正として読む。
 *
 * `purchases.vendor_id` / `sga_expenses.vendor_id` のFKが `companies.id` を直接指すよう
 * 張り替えたので、この画面（財務の仕入先タブ）が返す `id` も `companies.id` でなければ
 * 整合しない。`vendors` テーブル自体はまだ削除していない（仕入先固有の欄・支払条件の
 * 例外の識別子として残る）ので、基本情報の読み書きは `vendors`（`company_id` で1段引く）
 * に残し、一覧・検索の id 空間だけ `companies` に揃える（`customers.routes.ts` と同じ形）。
 *
 * ⚠️ **`vendors` 行への INNER JOIN が必須**（`customers.routes.ts` の PR #199 P2 と同じ理由）。
 * `DELETE /:id` は `vendors` 側だけを論理削除し `companies.is_vendor` は触らない
 * （companies 側の削除・顧客ロールへは影響させない、下記参照）。ここを LEFT JOIN の
 * ままにすると、削除した仕入先が `companies.is_vendor = TRUE` のままなので
 * 一覧・検索に残り続けてしまう。
 */
const VENDOR_JOIN = `
     FROM companies co
     INNER JOIN vendors v ON v.company_id = co.id AND v.deleted_at IS NULL`;

/**
 * 返す列。**基本情報（名前・連絡先など）は `companies` ではなく `vendors` から読む**
 * （レビュー指摘・PR #202 P1）。
 *
 * `budget:editor` が `sales:owner` を持たなければ、下の PUT は `companies` へ同期
 * しない（`sales:owner` の壁をすり抜けさせないため・レビュー指摘 PR #183 P2）。
 * その状態で一覧・詳細を `companies` から読むと、保存した直後の画面にも古い値が
 * 出続け、`budget:editor` にとって編集が実質効かなくなる。`vendors` はこの画面の
 * 実際の書き込み先＝正なので、基本情報はそちらを読む。`companies` 固有の列
 * （ロール・支払条件の例外）だけ `co` から読む。
 */
const VENDOR_FIELDS = `
     co.id, v.name, v.contact_name, v.email, v.phone, v.address, v.vendor_type,
     v.invoice_registration_number, v.notes,
     co.is_customer, co.is_vendor, co.is_sga_payee, co.is_gmo_group,
     co.customer_closing_day, co.customer_payment_months, co.customer_payment_day,
     co.vendor_payment_months, co.vendor_payment_day,
     co.created_at, co.updated_at, co.created_by, co.updated_by, co.deleted_at,
     v.id as legacy_vendor_id`;

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const sgaPayeeOnly = req.query.sga_payee_only === 'true';
  let where = 'WHERE co.deleted_at IS NULL AND co.is_vendor = TRUE';
  const params: unknown[] = [];
  if (search) { where += ` AND (co.name ILIKE ? OR co.vendor_type ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  // 販管費支払先のみフィルタ (companies.is_sga_payee=TRUE に紐付いた vendor のみ)
  if (sgaPayeeOnly) { where += ` AND co.is_sga_payee = TRUE`; }
  const total = ((await queryOne(`SELECT COUNT(*) as c ${VENDOR_JOIN} ${where}`, params)) as any).c;
  /**
   * 今年度の取引額 (v4・モックの「取引額」列)。
   *
   * **期間は今年度（暦年）に決めた。** 決めずに「全期間」にすると、
   * 5年前に1回だけ使った相手が上に来て、いま使っている相手が埋もれる。
   * 切り替えは後から足せる（列の意味が変わるので、まず1つに決める）。
   *
   * 仕入 (`purchases`) と販管費 (`sga_expenses`) の**両方**を足す。
   * 仕入だけだと、家賃や通信費の相手が「取引ゼロ」に見える。
   *
   * Phase 3-2b: `vendor_id` は `companies.id`（`co.id`）を直接指すので、そこで引く。
   */
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;
  const rows = await queryAll(
    `SELECT ${VENDOR_FIELDS},
            COALESCE(pu.amount, 0) + COALESCE(sg.amount, 0) AS ytd_amount,
            COALESCE(pu.n, 0) + COALESCE(sg.n, 0) AS ytd_count
       ${VENDOR_JOIN}
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

/**
 * `companies.id`（正）で引く。見つからなければ**移行前の `vendors.id`**
 * （旧URL・端末の「最近見た」履歴・共有リンクに残っている）として解釈し直し、
 * 見つかればその会社の正規の行を返す（`customers.routes.ts` の `findCustomerRow` と同じ形）。
 */
async function findVendorRow(rawId: string): Promise<Record<string, unknown> | null> {
  const byCompanyId = await queryOne(
    `SELECT ${VENDOR_FIELDS}
     ${VENDOR_JOIN}
     WHERE co.id = ? AND co.deleted_at IS NULL AND co.is_vendor = TRUE`,
    [rawId],
  ) as Record<string, unknown> | null;
  if (byCompanyId) return byCompanyId;

  const legacy = await queryOne(
    'SELECT company_id FROM vendors WHERE id = ? AND deleted_at IS NULL', [rawId],
  ) as { company_id: string | null } | null;
  if (!legacy?.company_id) return null;
  return await queryOne(
    `SELECT ${VENDOR_FIELDS}
     ${VENDOR_JOIN}
     WHERE co.id = ? AND co.deleted_at IS NULL AND co.is_vendor = TRUE`,
    [legacy.company_id],
  ) as Record<string, unknown> | null;
}

router.get('/:id', async (req, res) => {
  const row = await findVendorRow(req.params.id);
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
   *
   * `createVendorRecord` は `vendors.id` を返す。この画面の `id`（Phase 3-2b 以降
   * `vendor_id` FK が指す先）は `companies.id` なので、作った vendors 行の
   * `company_id` を引き直して返す（`customers.routes.ts` の POST と同じ形）。
   */
  const vid = await createVendorRecord(
    { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes },
    req.user!.id,
  );
  const linked = await queryOne('SELECT company_id FROM vendors WHERE id = ?', [vid]) as { company_id: string };
  const row = await queryOne(
    `SELECT ${VENDOR_FIELDS} FROM companies co
     LEFT JOIN vendors v ON v.company_id = co.id AND v.deleted_at IS NULL
     WHERE co.id = ?`,
    [linked.company_id],
  );
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  // :id は companies.id（Phase 3-2b）。vendors 行は company_id で引く。
  // **見つからなければ移行前の vendors.id（旧URL）として解釈し直す**
  // （`customers.routes.ts` の PUT と同じ理由）。
  let existing = await queryOne(
    'SELECT id FROM vendors WHERE company_id = ? AND deleted_at IS NULL', [req.params.id],
  ) as { id: string } | null;
  let companyId = req.params.id;
  if (!existing) {
    const legacy = await queryOne(
      'SELECT id, company_id FROM vendors WHERE id = ? AND deleted_at IS NULL', [req.params.id],
    ) as { id: string; company_id: string | null } | null;
    if (legacy?.company_id) {
      existing = { id: legacy.id };
      companyId = legacy.company_id;
    }
  }
  if (!existing) throw new AppError(404, 'NOT_FOUND', '仕入先が見つかりません');
  const { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes } = req.body;
  await execute(`UPDATE vendors SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?, invoice_registration_number=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, contact_name || null, email || null, phone || null, address || null, vendor_type || null, invoice_registration_number || null, notes || null, req.user!.id, existing.id]);
  /**
   * **取引先マスター（`companies`）側にも写す。** 顧客側 (`syncCompanyFromCustomer`)
   * と同じ理由 — 片方だけ直ると社名・連絡先が画面によって食い違う。
   *
   * ⚠️ **`companies` を直接編集できるのは `sales:owner` だけ**（`companies.routes.ts`
   * の PUT が要求している）。この画面は `budget:editor` で入れるので、そのまま
   * 同期すると **`sales` 権限を持たない budget editor が、`sales:owner` の壁を
   * すり抜けて会社名・連絡先という共有マスターを書き換えられる**ことになる
   * （レビュー指摘・PR #183 P2）。**`sales:owner` を持つ人のときだけ**同期し、
   * 持たない人の更新は `vendors` 側だけに留める（`companies` は次に `sales:owner`
   * が触るまで古いままになるが、権限の壁を越えるよりまし）。
   */
  const canSyncCompany = meetsPermissionLevel(req.user!.role, req.user!.permissions?.['sales'], 'owner');
  if (canSyncCompany) {
    await syncCompanyFromVendor(
      existing.id,
      { name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes },
      req.user!.id,
    );
  }
  const row = await queryOne(
    `SELECT ${VENDOR_FIELDS} FROM companies co
     LEFT JOIN vendors v ON v.company_id = co.id AND v.deleted_at IS NULL
     WHERE co.id = ?`,
    [companyId],
  );
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('budget', 'manager'), async (req, res) => {
  // :id は companies.id（Phase 3-2b）。この画面（財務の仕入先タブ）の削除は今まで
  // vendors 側だけを消していた（companies・顧客ロールは触らない）ので、company_id で
  // vendors 行だけを論理削除する。移行前の vendors.id（旧URL）も受け付ける
  // （PUT と同じ理由・`customers.routes.ts` の DELETE と同じ形）。
  await execute(
    `UPDATE vendors SET deleted_at=NOW(), updated_by=? WHERE deleted_at IS NULL AND (company_id=? OR id=?)`,
    [req.user!.id, req.params.id, req.params.id],
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
