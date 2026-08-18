import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { createCustomerRecord, syncCompanyFromCustomer } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

/**
 * Phase 3-2a: 一覧・詳細・360°ビューは `companies`（`is_customer = TRUE`）を正として読む。
 *
 * `projects.customer_id` / `revenues.customer_id` 等のFKが `companies.id` を直接指すよう
 * 張り替えたので、この画面（案件作成の「お客様」ドロップダウン兼顧客一覧）が返す `id` も
 * `companies.id` でなければ整合しない。`customers` テーブル自体はまだ削除していない
 * （名前・連絡先などの顧客固有の欄と、AI 登録判定の逆引きキーとして残る）ので、
 * 基本情報の読み書きは `customers`（`company_id` で1段引く）に残し、一覧・検索・
 * ドロップダウンの id 空間だけ `companies` に揃える。
 *
 * ⚠️ **`customers` 行への INNER JOIN が必須**（レビュー指摘・PR #199 P2）。
 * `DELETE /:id` は `customers` 側だけを論理削除し `companies.is_customer` は
 * 触らない（companies 側の削除・仕入先ロールへは影響させない、下記参照）。
 * ここを LEFT JOIN のままにすると、削除した顧客が `companies.is_customer = TRUE`
 * のままなので一覧・検索・ドロップダウンに残り続けてしまう。
 */
const CUSTOMER_JOIN = `
     FROM companies co
     INNER JOIN customers cu ON cu.company_id = co.id AND cu.deleted_at IS NULL`;

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE co.deleted_at IS NULL AND co.is_customer = TRUE';
  const params: unknown[] = [];
  if (search) { where += ` AND (co.name ILIKE ? OR co.short_name ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = ((await queryOne(`SELECT COUNT(*) as c ${CUSTOMER_JOIN} ${where}`, params)) as any).c;
  // v2.9.198+: AI 登録判定 (MCP create_customer) を mcp_audit_log から逆引き (activity-log.service と同形)。
  // 監査ログの created_id はまだ customers.id なので、customers 側の id で突き合わせる
  const rows = await queryAll(
    `SELECT co.*, cu.id as legacy_customer_id, (ai.audit_id IS NOT NULL) as is_ai_created, ai.requested_by as ai_requested_by
     ${CUSTOMER_JOIN}
     LEFT JOIN LATERAL (
       SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
       WHERE m.tool_name = 'create_customer' AND m.result_summary->>'created_id' = cu.id
       ORDER BY m.created_at ASC LIMIT 1
     ) ai ON TRUE
     ${where} ORDER BY co.name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

/**
 * `customers.id`（移行前の主キー）を `companies.id` に解決する。旧URL・端末の
 * 「最近見た」履歴・共有リンクに残っている ID を受けたときだけ呼ばれる
 * （通常は `companies.id` がそのまま見つかるので、ここには来ない）。
 *
 * Phase 3-3 着手条件②の互換確認用: どれだけ使われているかを `console.warn` で
 * 記録する（`docs/reviews/phase3-2-plan.md` 互換確認チェックリスト B 参照）。
 * legacy id を受け付ける箇所は `findCustomerRow`（GET）・`PUT /:id`・`DELETE /:id`
 * の3つがあり、記録漏れが起きないよう全てここを通す。
 */
async function resolveLegacyCustomerId(
  rawId: string, source: 'get' | 'put' | 'delete',
): Promise<{ id: string; company_id: string; is_gmo_group?: boolean } | null> {
  const legacy = await queryOne(
    'SELECT id, company_id, is_gmo_group FROM customers WHERE id = ? AND deleted_at IS NULL', [rawId],
  ) as { id: string; company_id: string | null; is_gmo_group?: boolean } | null;
  if (!legacy?.company_id) return null;
  console.warn(`[customers] legacy id 経由のアクセス (source=${source}): customers.id=${rawId} -> companies.id=${legacy.company_id}`);
  return legacy as { id: string; company_id: string; is_gmo_group?: boolean };
}

/**
 * `companies.id`（正）で引く。見つからなければ**移行前の `customers.id`**
 * として解釈し直し（`resolveLegacyCustomerId`）、見つかればその会社の
 * 正規の行を返す（レビュー指摘・PR #199 P2）。
 */
async function findCustomerRow(rawId: string): Promise<Record<string, unknown> | null> {
  const byCompanyId = await queryOne(
    `SELECT co.*, cu.id as legacy_customer_id
     ${CUSTOMER_JOIN}
     WHERE co.id = ? AND co.deleted_at IS NULL AND co.is_customer = TRUE`,
    [rawId],
  ) as Record<string, unknown> | null;
  if (byCompanyId) return byCompanyId;

  const legacy = await resolveLegacyCustomerId(rawId, 'get');
  if (!legacy) return null;
  return await queryOne(
    `SELECT co.*, cu.id as legacy_customer_id
     ${CUSTOMER_JOIN}
     WHERE co.id = ? AND co.deleted_at IS NULL AND co.is_customer = TRUE`,
    [legacy.company_id],
  ) as Record<string, unknown> | null;
}

router.get('/:id', async (req, res) => {
  const row = await findCustomerRow(req.params.id);
  if (!row) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  // AI 登録判定 (projects.routes の単体 enrichment と同形)
  const audit = row.legacy_customer_id ? await queryOne(
    `SELECT requested_by FROM mcp_audit_log
     WHERE tool_name = 'create_customer' AND result_summary->>'created_id' = ?
     ORDER BY created_at ASC LIMIT 1`,
    [row.legacy_customer_id]
  ) as Record<string, unknown> | null : null;
  row.is_ai_created = !!audit;
  row.ai_requested_by = audit?.requested_by ?? null;
  res.json({ success: true, data: row });
});

// ══════════════════════════════════════════════════════════
// 顧客360 (v2.9.218+) — お客様単位で全接点を1画面に集約する overview
// summary (取引実績) / timeline (活動履歴・直接 or 案件経由) / projects / sales_by_year。
// 既存テーブルのみで成立 (新規テーブル/migration 不要)。
// ══════════════════════════════════════════════════════════
router.get('/:id/overview', async (req, res) => {
  // companies.id（正）または移行前の customers.id（旧URL互換・下の findCustomerRow）
  const customer = await findCustomerRow(req.params.id);
  if (!customer) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  const id = customer.id as string; // 以降は必ず companies.id（旧URLでも解決済みの正しい id）

  // AI 登録判定 (一覧・単体と同形。監査ログの created_id はまだ customers.id)
  const custAudit = customer.legacy_customer_id ? await queryOne(
    `SELECT requested_by FROM mcp_audit_log
     WHERE tool_name = 'create_customer' AND result_summary->>'created_id' = ?
     ORDER BY created_at ASC LIMIT 1`,
    [customer.legacy_customer_id]
  ) as Record<string, unknown> | null : null;
  customer.is_ai_created = !!custAudit;
  customer.ai_requested_by = custAudit?.requested_by ?? null;

  const [summaryRow, projects, timeline, salesByYear] = await Promise.all([
    // 取引実績サマリー
    queryOne(
      `SELECT
         (SELECT COALESCE(SUM(amount),0) FROM revenues
          WHERE customer_id = ? AND status = 'confirmed' AND deleted_at IS NULL) AS confirmed_revenue,
         (SELECT COUNT(*) FROM projects
          WHERE customer_id = ? AND deleted_at IS NULL) AS project_total,
         (SELECT COUNT(*) FROM projects
          WHERE customer_id = ? AND deleted_at IS NULL AND stage NOT IN ('s_completed','e_lost')) AS project_active,
         (SELECT MAX(a.activity_date) FROM activity_logs a
          LEFT JOIN projects p ON p.id = a.project_id
          WHERE a.deleted_at IS NULL AND (a.customer_id = ? OR p.customer_id = ?)) AS last_contact_date,
         (SELECT COUNT(*) FROM activity_logs a
          LEFT JOIN projects p ON p.id = a.project_id
          WHERE a.deleted_at IS NULL AND (a.customer_id = ? OR p.customer_id = ?)
            AND a.next_action IS NOT NULL AND a.next_action_done_at IS NULL) AS open_actions`,
      [id, id, id, id, id, id, id]
    ),
    // 案件リスト (進行中を先頭・イベント日降順) + 実績集計
    queryAll(
      `SELECT p.id, p.gls_number, p.code, p.name, p.stage, p.event_start, p.expected_amount,
              COALESCE(r.rev, 0) AS total_revenue, COALESCE(pu.pur, 0) AS total_purchase,
              (p.stage NOT IN ('s_completed','e_lost')) AS is_active
       FROM projects p
       LEFT JOIN (SELECT project_id, SUM(amount) AS rev FROM revenues
                  WHERE status = 'confirmed' AND deleted_at IS NULL GROUP BY project_id) r ON r.project_id = p.id
       LEFT JOIN (SELECT project_id, SUM(amount) AS pur FROM purchases
                  WHERE deleted_at IS NULL GROUP BY project_id) pu ON pu.project_id = p.id
       WHERE p.customer_id = ? AND p.deleted_at IS NULL
       ORDER BY (p.stage NOT IN ('s_completed','e_lost')) DESC, p.event_start DESC NULLS LAST, p.created_at DESC`,
      [id]
    ),
    // 統合タイムライン (顧客直付け or 案件経由の活動・直近50件)
    queryAll(
      `SELECT a.id, a.activity_type, a.subject, a.description, a.activity_date,
              a.next_action, a.next_action_date, a.next_action_done_at,
              a.source_channel, a.message_id,
              a.project_id, u.name AS user_name,
              p.name AS project_name, p.gls_number AS project_gls,
              (ai.audit_id IS NOT NULL) AS is_ai_created, ai.requested_by AS ai_requested_by
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN LATERAL (
         SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
         WHERE m.tool_name = 'create_activity_log' AND m.result_summary->>'created_id' = a.id
         ORDER BY m.created_at ASC LIMIT 1
       ) ai ON TRUE
       WHERE a.deleted_at IS NULL AND (a.customer_id = ? OR p.customer_id = ?)
       ORDER BY a.activity_date DESC, a.created_at DESC
       LIMIT 50`,
      [id, id]
    ),
    // 年次売上 (確定売上・計上日ベース)
    queryAll(
      `SELECT LEFT(recognition_date, 4) AS year, SUM(amount) AS total
       FROM revenues
       WHERE customer_id = ? AND status = 'confirmed' AND deleted_at IS NULL
         AND recognition_date IS NOT NULL AND recognition_date <> ''
       GROUP BY LEFT(recognition_date, 4)
       ORDER BY year`,
      [id]
    ),
  ]);

  res.json({
    success: true,
    data: { customer, summary: summaryRow, projects, timeline, sales_by_year: salesByYear },
  });
});

router.post('/', requirePermission('sales', 'owner'), async (req, res) => {
  const { name, short_name, contact_name, email, phone, address, notes, is_gmo_group } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '顧客名は必須です');
  /**
   * **`companies`（取引先マスター）にも同じ会社の行を作って紐づける**
   * （`company-directory.service.ts`）。ここで `customers` だけに INSERT すると、
   * 取引先マスターに対応行の無い「孤立した顧客」ができる。
   * 渡してこない道では社名から見立てる（migration 192・ご指示: GMO と
   * ついているものはすべてグループ）。渡してきたらそちらが正 — 画面の
   * チェックボックスで外せます。
   *
   * `createCustomerRecord` は `customers.id` を返す。この画面の `id`（Phase 3-2a
   * 以降 `customer_id` FK が指す先）は `companies.id` なので、作った customers 行の
   * `company_id` を引き直して返す。
   */
  const cid = await createCustomerRecord(
    { name, short_name, contact_name, email, phone, address, notes,
      is_gmo_group: is_gmo_group === undefined ? undefined : is_gmo_group === true },
    req.user!.id,
  );
  const linked = await queryOne('SELECT company_id FROM customers WHERE id = ?', [cid]) as { company_id: string };
  const row = await queryOne(
    `SELECT co.*, cu.id as legacy_customer_id FROM companies co
     LEFT JOIN customers cu ON cu.company_id = co.id AND cu.deleted_at IS NULL
     WHERE co.id = ?`,
    [linked.company_id],
  );
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('sales', 'owner'), async (req, res) => {
  // :id は companies.id（Phase 3-2a）。customers 行は company_id で引く。
  // **見つからなければ移行前の customers.id（旧URL）として解釈し直す**
  // （レビュー指摘・PR #199 P2 の2巡目）— GET は `findCustomerRow` で旧URLを
  // 解決するのに、保存はここが companies.id 専用のままだったので、詳細画面を
  // 旧URLのまま開いて保存すると 404 になっていた。
  let existing = await queryOne(
    'SELECT id, is_gmo_group FROM customers WHERE company_id = ? AND deleted_at IS NULL', [req.params.id],
  ) as { id: string; is_gmo_group?: boolean } | null;
  let companyId = req.params.id;
  if (!existing) {
    const legacy = await resolveLegacyCustomerId(String(req.params.id), 'put');
    if (legacy) {
      existing = { id: legacy.id, is_gmo_group: legacy.is_gmo_group };
      companyId = legacy.company_id;
    }
  }
  if (!existing) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  const { name, short_name, contact_name, email, phone, address, notes, is_gmo_group } = req.body;
  /**
   * **渡されなければ今の値を保つ** (migration 182)。この UPDATE は送られた値で
   * そのまま上書きするので、欄を持たない古い画面から保存されるだけで
   * グループ会社の印が黙って外れます（リード経路が「グループ案件」に固定されなくなる）。
   */
  const groupFlag = is_gmo_group === undefined ? (existing.is_gmo_group === true) : (is_gmo_group === true);
  await execute(`UPDATE customers SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?, notes=?, is_gmo_group=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, short_name || null, contact_name || null, email || null, phone || null, address || null, notes || null, groupFlag, req.user!.id, existing.id]);
  /**
   * **取引先マスター（`companies`）側にも写す。** 同じ相手が2つの画面に出るので、
   * 片方だけ直ると「取引先マスターでは古い社名なのに顧客一覧では新しい社名」という
   * 食い違いが起きる。以前は `is_gmo_group` だけ写していたが、基本情報も揃える
   * （`company-directory.service.ts`）。`syncCompanyFromCustomer` は
   * customers.id から company_id を引く形なので、`existing.id` を渡す
   * （紐付いていない顧客＝`company_id IS NULL` は何も起きません）
   */
  await syncCompanyFromCustomer(
    existing.id,
    { name, short_name, contact_name, email, phone, address, notes, is_gmo_group: groupFlag },
    req.user!.id,
  );
  const row = await queryOne(
    `SELECT co.*, cu.id as legacy_customer_id FROM companies co
     LEFT JOIN customers cu ON cu.company_id = co.id AND cu.deleted_at IS NULL
     WHERE co.id = ?`,
    [companyId],
  );
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  // :id は companies.id（Phase 3-2a）。この画面（顧客一覧）の削除は今まで
  // customers 側だけを消していた（companies・仕入先ロールは触らない）ので、
  // company_id で customers 行だけを論理削除する。
  // 移行前の customers.id（旧URL）も受け付ける（PUT と同じ理由・PR #199 P2 の2巡目）
  //
  // ここは元々ログ用の解決を挟まず直接 UPDATE していた。実際の削除条件
  // (company_id=? OR id=?) は変えず、legacy id 経由かどうかの記録だけを
  // 追加する（互換確認チェックリスト B）。company_id で見つかる通常経路では
  // 余計な問い合わせをしない。
  const byCompanyId = await queryOne(
    'SELECT id FROM customers WHERE company_id = ? AND deleted_at IS NULL', [req.params.id],
  ) as { id: string } | null;
  if (!byCompanyId) {
    await resolveLegacyCustomerId(String(req.params.id), 'delete');
  }
  await execute(
    `UPDATE customers SET deleted_at=NOW(), updated_by=? WHERE deleted_at IS NULL AND (company_id=? OR id=?)`,
    [req.user!.id, req.params.id, req.params.id],
  );
  res.json({ success: true, message: '削除しました' });
});

export default router;
