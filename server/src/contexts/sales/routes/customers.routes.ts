import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';
import { createCustomerRecord, syncCompanyFromCustomer } from '../../../shared/services/company-directory.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  let where = 'WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (search) { where += ` AND (name ILIKE ? OR short_name ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const total = ((await queryOne(`SELECT COUNT(*) as c FROM customers ${where}`, params)) as any).c;
  // v2.9.198+: AI 登録判定 (MCP create_customer) を mcp_audit_log から逆引き (activity-log.service と同形)
  const rows = await queryAll(
    `SELECT customers.*, (ai.audit_id IS NOT NULL) as is_ai_created, ai.requested_by as ai_requested_by
     FROM customers
     LEFT JOIN LATERAL (
       SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
       WHERE m.tool_name = 'create_customer' AND m.result_summary->>'created_id' = customers.id
       ORDER BY m.created_at ASC LIMIT 1
     ) ai ON TRUE
     ${where} ORDER BY name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(rows, total, page, limit));
});

router.get('/:id', async (req, res) => {
  const row = await queryOne('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id]) as Record<string, unknown> | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  // AI 登録判定 (projects.routes の単体 enrichment と同形)
  const audit = await queryOne(
    `SELECT requested_by FROM mcp_audit_log
     WHERE tool_name = 'create_customer' AND result_summary->>'created_id' = ?
     ORDER BY created_at ASC LIMIT 1`,
    [row.id]
  ) as Record<string, unknown> | null;
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
  const id = req.params.id;
  const customer = await queryOne('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [id]) as Record<string, unknown> | null;
  if (!customer) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');

  // AI 登録判定 (一覧・単体と同形)
  const custAudit = await queryOne(
    `SELECT requested_by FROM mcp_audit_log
     WHERE tool_name = 'create_customer' AND result_summary->>'created_id' = ?
     ORDER BY created_at ASC LIMIT 1`,
    [id]
  ) as Record<string, unknown> | null;
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
   */
  const id = await createCustomerRecord(
    { name, short_name, contact_name, email, phone, address, notes,
      is_gmo_group: is_gmo_group === undefined ? undefined : is_gmo_group === true },
    req.user!.id,
  );
  const row = await queryOne('SELECT * FROM customers WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('sales', 'owner'), async (req, res) => {
  const existing = await queryOne(
    'SELECT id, is_gmo_group FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id],
  ) as { is_gmo_group?: boolean } | null;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  const { name, short_name, contact_name, email, phone, address, notes, is_gmo_group } = req.body;
  /**
   * **渡されなければ今の値を保つ** (migration 182)。この UPDATE は送られた値で
   * そのまま上書きするので、欄を持たない古い画面から保存されるだけで
   * グループ会社の印が黙って外れます（リード経路が「グループ案件」に固定されなくなる）。
   */
  const groupFlag = is_gmo_group === undefined ? (existing.is_gmo_group === true) : (is_gmo_group === true);
  await execute(`UPDATE customers SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?, notes=?, is_gmo_group=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [name, short_name || null, contact_name || null, email || null, phone || null, address || null, notes || null, groupFlag, req.user!.id, req.params.id]);
  /**
   * **取引先マスター（`companies`）側にも写す。** 同じ相手が2つの画面に出るので、
   * 片方だけ直ると「取引先マスターでは古い社名なのに顧客一覧では新しい社名」という
   * 食い違いが起きる。以前は `is_gmo_group` だけ写していたが、基本情報も揃える
   * （`company-directory.service.ts`）。
   * （紐付いていない顧客＝`company_id IS NULL` は何も起きません）
   */
  await syncCompanyFromCustomer(
    req.params.id as string,
    { name, short_name, contact_name, email, phone, address, notes, is_gmo_group: groupFlag },
    req.user!.id,
  );
  const row = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(`UPDATE customers SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
