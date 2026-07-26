import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

/** 日付は TEXT 保持 (activity_date / recognition_date) なので文字列比較する */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * お客様一覧 (11a) — 住所録ではなく「取引の状態」を出す。
 *
 * 列: 累計売上 / 案件 (進行中/全体) / 最終接点 / 次の一手。
 * 集計は LATERAL で 1 社ずつ引く (既存レスポンスへの追加なので後方互換)。
 *
 * `?stale=1` で「30日以上ご無沙汰」だけに絞る。
 * ご無沙汰の定義は **一度接点があって、それが30日より前** の会社。
 * 接点が一度も無い会社は「ご無沙汰」ではなく「未接触」なので数えない。
 */
router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const staleFrom = daysAgo(30);
  const yearFrom = `${new Date().getFullYear()}-01-01`;

  // 25章: お試し用のお客様は本物の一覧に出さない
  let where = 'WHERE c.deleted_at IS NULL AND c.is_sandbox = FALSE';
  const params: unknown[] = [];
  if (search) {
    where += ` AND (c.name ILIKE ? OR c.short_name ILIKE ? OR c.contact_name ILIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // 最終接点は 顧客直付け or 案件経由 の活動の最大日付
  const LAST_CONTACT = `(
    SELECT MAX(a.activity_date) FROM activity_logs a
    LEFT JOIN projects p ON p.id = a.project_id
    WHERE a.deleted_at IS NULL AND (a.customer_id = c.id OR p.customer_id = c.id)
  )`;

  let staleClause = '';
  const staleParams: unknown[] = [];
  if (req.query.stale === '1') {
    staleClause = ` AND ${LAST_CONTACT} IS NOT NULL AND ${LAST_CONTACT} < ?`;
    staleParams.push(staleFrom);
  }

  const total = ((await queryOne(
    `SELECT COUNT(*) as c FROM customers c ${where}${staleClause}`,
    [...params, ...staleParams]
  )) as any).c;

  // v2.9.198+: AI 登録判定 (MCP create_customer) を mcp_audit_log から逆引き (activity-log.service と同形)
  const rows = await queryAll(
    `SELECT c.*,
            (ai.audit_id IS NOT NULL) as is_ai_created, ai.requested_by as ai_requested_by,
            COALESCE(rv.total, 0) AS confirmed_revenue,
            COALESCE(pj.total, 0) AS project_total,
            COALESCE(pj.active, 0) AS project_active,
            ${LAST_CONTACT} AS last_contact_date,
            na.next_action, na.next_action_date
     FROM customers c
     LEFT JOIN LATERAL (
       SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
       WHERE m.tool_name = 'create_customer' AND m.result_summary->>'created_id' = c.id
       ORDER BY m.created_at ASC LIMIT 1
     ) ai ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(amount) AS total FROM revenues r
       WHERE r.customer_id = c.id AND r.status = 'confirmed' AND r.deleted_at IS NULL
     ) rv ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE p.stage NOT IN ('s_completed','e_lost')) AS active
       FROM projects p WHERE p.customer_id = c.id AND p.deleted_at IS NULL AND p.is_sandbox = FALSE
     ) pj ON TRUE
     LEFT JOIN LATERAL (
       SELECT a.next_action, a.next_action_date
       FROM activity_logs a
       LEFT JOIN projects p2 ON p2.id = a.project_id
       WHERE a.deleted_at IS NULL AND (a.customer_id = c.id OR p2.customer_id = c.id)
         AND a.next_action IS NOT NULL AND a.next_action_date IS NOT NULL
         AND a.next_action_done_at IS NULL
       ORDER BY a.next_action_date ASC LIMIT 1
     ) na ON TRUE
     ${where}${staleClause}
     ORDER BY c.name LIMIT ? OFFSET ?`,
    [...params, ...staleParams, limit, offset]
  );

  // 見出しの数字。**1ページ分から数えると全社の数が出せない**ので絞り込み全体で数える
  const summary = await queryOne(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM revenues r WHERE r.customer_id = c.id
                AND r.status = 'confirmed' AND r.deleted_at IS NULL
                AND r.recognition_date >= ?
            )) AS traded_this_year,
            COUNT(*) FILTER (WHERE ${LAST_CONTACT} IS NOT NULL AND ${LAST_CONTACT} < ?) AS stale
     FROM customers c ${where}`,
    [yearFrom, staleFrom, ...params]
  );

  res.json({ ...paginatedResponse(rows, total, page, limit), summary });
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

  // 会社名の突合用に法人格を落とす (内覧会の company は自由入力で「株式会社◯◯ 宣伝部」等が入る)
  const core = String(customer.name ?? '')
    .replace(/(株式会社|有限会社|合同会社|一般社団法人|合資会社|合名会社|\(株\)|（株）)/g, '')
    .trim();

  const [summaryRow, projects, timeline, salesByYear, openActions, visits, billing] = await Promise.all([
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
       WHERE p.customer_id = ? AND p.deleted_at IS NULL AND p.is_sandbox = FALSE
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
    // この会社で待たせているもの (未完了の次回アクション・期限が近い順)
    queryAll(
      `SELECT a.id, a.next_action, a.next_action_date, a.subject,
              a.project_id, p.name AS project_name, p.gls_number AS project_gls
       FROM activity_logs a
       LEFT JOIN projects p ON p.id = a.project_id
       WHERE a.deleted_at IS NULL AND (a.customer_id = ? OR p.customer_id = ?)
         AND a.next_action IS NOT NULL AND a.next_action_date IS NOT NULL
         AND a.next_action_done_at IS NULL
       ORDER BY a.next_action_date ASC LIMIT 20`,
      [id, id]
    ),
    // 来訪・見学の記録。営業活動の「訪問」と**内覧会の来場予約**を1本に並べる。
    // 内覧会は会社名が自由入力なので、法人格を落とした部分一致で突合する
      // (完全一致だと「株式会社◯◯ 宣伝部」が拾えない)。
    core
      ? queryAll(
          `SELECT * FROM (
             SELECT a.activity_date AS date, '訪問' AS kind,
                    COALESCE(a.subject, '訪問') AS what, u.name AS who, NULL::text AS session_label
             FROM activity_logs a
             LEFT JOIN users u ON u.id = a.user_id
             LEFT JOIN projects p ON p.id = a.project_id
             WHERE a.deleted_at IS NULL AND a.activity_type = 'visit'
               AND (a.customer_id = ? OR p.customer_id = ?)
             UNION ALL
             SELECT iv.session_date AS date, '内覧会' AS kind,
                    COALESCE(NULLIF(iv.session_audience, ''), '内覧会 来場') AS what,
                    iv.name AS who, iv.session_label
             FROM inview_registrations iv
             WHERE iv.deleted_at IS NULL AND iv.company ILIKE ?
           ) v
           WHERE v.date IS NOT NULL
           ORDER BY v.date DESC LIMIT 20`,
          [id, id, `%${core}%`]
        )
      : Promise.resolve([]),
    // 請求先 (取引先マスター)。同じ会社の情報を2か所で持たないため、
    // `/sales/companies` の一覧ではなくこの会社の中の「請求先」タブに出す。
    customer.company_id
      ? queryOne(
          `SELECT co.*, v.id AS vendor_id FROM companies co
           LEFT JOIN vendors v ON v.company_id = co.id AND v.deleted_at IS NULL
           WHERE co.id = ? AND co.deleted_at IS NULL`,
          [customer.company_id]
        )
      : Promise.resolve(null),
  ]);

  res.json({
    success: true,
    data: {
      customer,
      summary: summaryRow,
      projects,
      timeline,
      sales_by_year: salesByYear,
      open_actions: openActions,
      visits,
      billing,
    },
  });
});

router.post('/', requirePermission('sales', 'owner'), async (req, res) => {
  const { name, short_name, contact_name, email, phone, address, notes } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '顧客名は必須です');
  const id = uuidv4();
  await execute('INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, short_name || null, contact_name || null, email || null, phone || null, address || null, notes || null, req.user!.id]);
  const row = await queryOne('SELECT * FROM customers WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requirePermission('sales', 'owner'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
  // **渡されたフィールドだけ更新する**。顧客360のヘッダーから連絡先だけを送るため、
  // 全上書きにすると送っていない項目 (住所・メモ) が黙って消える (v2.9.209 の finance と同じ判断)。
  const b = req.body as Record<string, unknown>;
  const keep = (k: string) => (b[k] !== undefined ? (b[k] || null) : ((existing as any)[k] ?? null));
  await execute(`UPDATE customers SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?, notes=?, updated_at=NOW(), updated_by=? WHERE id=?`,
    [b.name !== undefined ? b.name : (existing as any).name,
     keep('short_name'), keep('contact_name'), keep('email'), keep('phone'), keep('address'), keep('notes'),
     req.user!.id, req.params.id]);
  const row = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

/**
 * この顧客の請求先 (取引先マスター) を作って紐づける。
 *
 * migration 061 より後に作られた顧客は `company_id` が空のことがあり、
 * その場合「請求先」タブに出す実体が無い。**冪等** — 既に紐づいていれば既存を返す。
 */
router.post('/:id/billing-party', requirePermission('sales', 'owner'), async (req, res) => {
  const cu = await queryOne(
    'SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  ) as any;
  if (!cu) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');

  if (cu.company_id) {
    const existing = await queryOne('SELECT * FROM companies WHERE id = ? AND deleted_at IS NULL', [cu.company_id]);
    if (existing) return res.json({ success: true, data: existing, created: false });
  }

  const id = uuidv4();
  await execute(
    `INSERT INTO companies (id, name, short_name, contact_name, email, phone, address,
       is_customer, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
    [id, cu.name, cu.short_name || null, cu.contact_name || null, cu.email || null,
     cu.phone || null, cu.address || null, cu.notes || null, req.user!.id]
  );
  await execute('UPDATE customers SET company_id = ?, updated_at = NOW(), updated_by = ? WHERE id = ?',
    [id, req.user!.id, req.params.id]);
  const row = await queryOne('SELECT * FROM companies WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row, created: true });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await execute(`UPDATE customers SET deleted_at=NOW(), updated_by=? WHERE id=? AND deleted_at IS NULL`, [req.user!.id, req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
