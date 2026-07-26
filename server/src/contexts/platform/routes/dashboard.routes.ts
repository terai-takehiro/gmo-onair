import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { config } from '../../../config';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

function countMonths(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

// Auto-complete: A受注済み → S案件終了 (event_end < today)
router.get('/check-completed', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  await execute(
    `UPDATE projects SET stage='s_completed', updated_at=NOW()
     WHERE stage = 'a_won' AND deleted_at IS NULL
     AND event_end IS NOT NULL AND event_end < ?`,
    [today]
  );
  res.json({ success: true, data: { updated: true } });
});

router.get('/kpi', async (req, res) => {
  const now = new Date();
  const period = req.query.period as string || 'monthly';
  // 任意の月を指定 (YYYY-MM)。指定時は period より優先し、その月のみを集計
  const monthParam = req.query.month as string | undefined;
  const hasMonth = !!monthParam && /^\d{4}-\d{2}$/.test(monthParam);
  let periodStart: string, periodEnd: string, periodLabel: string;

  if (hasMonth) {
    const [y, m] = monthParam!.split('-').map(Number);
    periodStart = `${monthParam}-01`;
    periodEnd = `${monthParam}-31`;
    periodLabel = `${y}年${m}月`;
  } else if (period === 'yearly') {
    periodStart = `${now.getFullYear()}-01-01`;
    periodEnd = `${now.getFullYear()}-12-31`;
    periodLabel = `${now.getFullYear()}年`;
  } else {
    periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    periodEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
    periodLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  }

  const rev = await queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM revenues WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [periodStart, periodEnd]);
  const pur = await queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM purchases WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [periodStart, periodEnd]);
  const activeProjects = await queryOne(`SELECT COUNT(*) as c FROM projects WHERE gls_number IS NOT NULL AND stage NOT IN ('s_completed','e_lost') AND deleted_at IS NULL`);
  const activeYomi = await queryOne(`SELECT COUNT(*) as c FROM projects WHERE gls_number IS NULL AND stage NOT IN ('e_lost') AND deleted_at IS NULL`);

  // SGA calculation
  const sgaNonAmortized = await queryOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM sga_expenses
     WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL
     AND (amortize_start IS NULL OR amortize_start = '')`,
    [periodStart, periodEnd]
  );

  let sgaAmortizedTotal = 0;
  if (!hasMonth && period === 'yearly') {
    for (let m = 0; m < 12; m++) {
      const ym = `${now.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
      const amortRows = await queryAll(
        `SELECT amount, amortize_start, amortize_end FROM sga_expenses
         WHERE deleted_at IS NULL AND amortize_start IS NOT NULL AND amortize_start != ''
         AND amortize_start <= ? AND amortize_end >= ?`,
        [ym, ym]
      );
      for (const row of amortRows) {
        const months = countMonths(row.amortize_start as string, row.amortize_end as string);
        if (months > 0) sgaAmortizedTotal += Math.floor((row.amount as number) / months);
      }
    }
  } else {
    const currentMonth = hasMonth
      ? monthParam!
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const amortRows = await queryAll(
      `SELECT amount, amortize_start, amortize_end FROM sga_expenses
       WHERE deleted_at IS NULL AND amortize_start IS NOT NULL AND amortize_start != ''
       AND amortize_start <= ? AND amortize_end >= ?`,
      [currentMonth, currentMonth]
    );
    for (const row of amortRows) {
      const months = countMonths(row.amortize_start as string, row.amortize_end as string);
      if (months > 0) sgaAmortizedTotal += Math.floor((row.amount as number) / months);
    }
  }

  const monthlyRevenue = (rev?.total as number) || 0;
  const monthlyPurchase = (pur?.total as number) || 0;
  const monthlySga = ((sgaNonAmortized?.total as number) || 0) + sgaAmortizedTotal;
  const grossProfit = monthlyRevenue - monthlyPurchase;
  const grossMargin = monthlyRevenue > 0 ? Math.round((grossProfit / monthlyRevenue) * 1000) / 10 : 0;
  const operatingProfit = grossProfit - monthlySga;
  const operatingMargin = monthlyRevenue > 0 ? Math.round((operatingProfit / monthlyRevenue) * 1000) / 10 : 0;

  res.json({ success: true, data: {
    period_label: periodLabel,
    monthly_revenue: monthlyRevenue,
    monthly_purchase: monthlyPurchase,
    monthly_sga: monthlySga,
    gross_profit: grossProfit,
    monthly_gross_margin: grossMargin,
    operating_profit: operatingProfit,
    operating_margin: operatingMargin,
    active_projects: (activeProjects?.c as number) || 0,
    active_yomi: (activeYomi?.c as number) || 0,
  } });
});

router.get('/alerts', async (_req, res) => {
  const alerts = await queryAll(
    `SELECT id, gls_number, name, 'application_form' as alert_type, '申込書未提出' as message
     FROM projects WHERE application_form = 0 AND gls_number IS NOT NULL
     AND stage NOT IN ('s_completed','e_lost') AND deleted_at IS NULL
     UNION ALL
     SELECT id, gls_number, name, 'upcoming_event' as alert_type, 'イベントが近づいています' as message
     FROM projects WHERE event_start IS NOT NULL
     AND event_start BETWEEN CURRENT_DATE::text AND (CURRENT_DATE + INTERVAL '7 days')::text AND deleted_at IS NULL`
  );
  res.json({ success: true, data: alerts });
});

// 期限超過の次回アクション SQL (overdue-actions と 受信箱 /inbox が共用)
const OVERDUE_ACTIONS_SQL =
  `SELECT a.id AS activity_id, a.next_action, a.next_action_date,
          a.project_id, p.code AS project_code, p.gls_number, p.name AS project_name, p.stage,
          p.expected_amount, p.event_start, p.event_end,
          a.user_id, u.name AS assigned_to_name, c.name AS customer_name, p.customer_id,
          (CURRENT_DATE - a.next_action_date::date) AS days_overdue
   FROM activity_logs a
   JOIN projects p ON p.id = a.project_id
   LEFT JOIN users u ON u.id = a.user_id
   LEFT JOIN customers c ON c.id = p.customer_id
   WHERE a.deleted_at IS NULL AND p.deleted_at IS NULL
     AND p.stage NOT IN ('s_completed','e_lost')
     AND a.next_action IS NOT NULL AND a.next_action_date IS NOT NULL
     AND a.next_action_done_at IS NULL
     AND a.next_action_date < CURRENT_DATE::text
   ORDER BY a.next_action_date ASC
   LIMIT 200`;

// 期限超過の次回アクション (エスカレーション用)。進行中案件で next_action_date < 今日 かつ 未完了。
// 期限が古い順。ホームの「対応漏れ」アラートと、Claude スケジュール実行→Slack 通知の両方で使う。
router.get('/overdue-actions', async (_req, res) => {
  const rows = await queryAll(OVERDUE_ACTIONS_SQL);
  res.json({ success: true, data: rows });
});

router.get('/recent-projects', async (_req, res) => {
  const rows = await queryAll(
    `SELECT p.*, c.name as customer_name FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.deleted_at IS NULL AND p.gls_number IS NOT NULL
     AND p.event_start BETWEEN CURRENT_DATE::text AND (CURRENT_DATE + INTERVAL '7 days')::text
     ORDER BY p.event_start LIMIT 10`
  );
  res.json({ success: true, data: rows });
});

// v2.9.175+: 営業ダッシュボード — 進行中の全案件を「ホットな情報 (直近の営業活動)」付きで一覧化
// - 進行中 = stage NOT IN ('s_completed','e_lost') (ヨミ〜受注済までの全パイプライン)
// - 各案件に直近の営業活動 (メール/電話/打合せ等) と次回アクションを付与
// - 直近 14 日以内に活動がある案件を「ホット」として先頭に、活動日の新しい順で並べる
// - トップページで確実に一覧化するためページングせず全件返す (進行中に限定されるため件数は自然に有界、上限 100)
router.get('/sales-board', async (_req, res) => {
  // v2.9.178+: 次回アクションは「未完了 (next_action_done_at IS NULL) で期限が最も近いもの」を
  // 直近活動とは独立した lateral で取得 (完了/延期の操作対象として activity_id も返す)。
  // v2.9.197+: AI 起票判定は created_by=mcpActor OR 監査ログ照合 (OAuth 本人名義でも検出)。
  // 直近活動自体の AI 取込判定 (last_activity_is_ai) も返す。
  const rows = await queryAll(
    `SELECT p.id, p.gls_number, p.name, p.stage, p.event_start, p.expected_amount,
            p.created_by, p.ai_reviewed_at,
            c.name AS customer_name,
            la.activity_type   AS last_activity_type,
            la.subject         AS last_activity_subject,
            la.activity_date   AS last_activity_date,
            la.is_ai           AS last_activity_is_ai,
            na.activity_id     AS next_action_activity_id,
            na.next_action     AS next_action,
            na.next_action_date AS next_action_date,
            ac.cnt             AS activity_count,
            ai.requested_by    AS ai_requested_by,
            (p.created_by = ? OR ai.audit_id IS NOT NULL) AS is_ai_created,
            CASE WHEN la.activity_date IS NOT NULL
                 AND la.activity_date >= (CURRENT_DATE - INTERVAL '14 days')::text
                 THEN 1 ELSE 0 END AS is_hot
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     LEFT JOIN LATERAL (
       SELECT a.activity_type, a.subject, a.activity_date,
              EXISTS (
                SELECT 1 FROM mcp_audit_log m2
                WHERE m2.tool_name = 'create_activity_log' AND m2.result_summary->>'created_id' = a.id
              ) AS is_ai
       FROM activity_logs a
       WHERE a.project_id = p.id AND a.deleted_at IS NULL
       ORDER BY a.activity_date DESC, a.created_at DESC
       LIMIT 1
     ) la ON TRUE
     LEFT JOIN LATERAL (
       SELECT a.id AS activity_id, a.next_action, a.next_action_date
       FROM activity_logs a
       WHERE a.project_id = p.id AND a.deleted_at IS NULL
         AND a.next_action IS NOT NULL AND a.next_action_date IS NOT NULL
         AND a.next_action_done_at IS NULL
       ORDER BY a.next_action_date ASC, a.created_at DESC
       LIMIT 1
     ) na ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS cnt FROM activity_logs a2
       WHERE a2.project_id = p.id AND a2.deleted_at IS NULL
     ) ac ON TRUE
     LEFT JOIN LATERAL (
       SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
       WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = p.id
       ORDER BY m.created_at ASC
       LIMIT 1
     ) ai ON TRUE
     WHERE p.deleted_at IS NULL
       AND p.stage NOT IN ('s_completed','e_lost')
     ORDER BY
       CASE WHEN la.activity_date IS NOT NULL
            AND la.activity_date >= (CURRENT_DATE - INTERVAL '14 days')::text
            THEN 0 ELSE 1 END ASC,
       la.activity_date DESC NULLS LAST,
       CASE p.stage
         WHEN 'b_verbal'   THEN 1
         WHEN 'a_won'      THEN 2
         WHEN 'c_proposal' THEN 3
         WHEN 'd_hold'     THEN 4
         WHEN 'neta'       THEN 5
         ELSE 6
       END ASC,
       p.event_start ASC NULLS LAST,
       p.created_at DESC
     LIMIT 100`,
    [config.mcpActorId]
  );
  res.json({ success: true, data: rows });
});

// v2.9.178+: AI 起票インボックス — AI (MCP 経由のメール取込等) が起票した案件のうち
// 人間がまだ内容確認していないもの (ai_reviewed_at IS NULL) を新しい順に返す。
// 確認は POST /projects/:id/ai-review (projects.routes) で記録する。
// AI 起票の未確認案件 SQL (ai-inbox と 受信箱 /inbox が共用)
const AI_INBOX_SQL =
  `SELECT p.id, p.code, p.gls_number, p.name, p.stage, p.expected_amount, p.created_at,
          c.name AS customer_name, u.name AS assigned_to_name,
          ai.requested_by AS ai_requested_by
   FROM projects p
   LEFT JOIN customers c ON c.id = p.customer_id
   LEFT JOIN users u ON u.id = p.assigned_to
   LEFT JOIN LATERAL (
     SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
     WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = p.id
     ORDER BY m.created_at ASC
     LIMIT 1
   ) ai ON TRUE
   WHERE p.deleted_at IS NULL
     AND (p.created_by = ? OR ai.audit_id IS NOT NULL)
     AND p.ai_reviewed_at IS NULL
   ORDER BY p.created_at DESC
   LIMIT 50`;

router.get('/ai-inbox', async (_req, res) => {
  const rows = await queryAll(AI_INBOX_SQL, [config.mcpActorId]);
  res.json({ success: true, data: rows });
});

// ══════════════════════════════════════════════════════════
// 受信箱 (v2.9.217+) — 「お客様を待たせているもの」を1本のキューに集約
// items   = 終端状態を持つ inbound のみ (期限超過アクション / AI起票未確認 /
//           未対応の問い合わせ / 未処理の見積・請求)。received_at 昇順 = 古いものが先頭。
// checklist = 経過時間の概念が薄いチェック系 (申込書未提出)。
// dailyops 系 (問い合わせ/見積請求) は dailyops 権限がある人にだけ含める。
// ══════════════════════════════════════════════════════════
router.get('/inbox', async (req, res) => {
  const user = req.user!;
  const dailyLevel = user.permissions?.['dailyops'] ?? '';
  const dailyopsVisible = user.role === 'system_admin' || !!dailyLevel;
  const dailyopsEditable =
    user.role === 'system_admin' || ['editor', 'manager', 'owner'].includes(dailyLevel);

  const [overdue, aiProjects, agreements, inquiries, financeDocs] = await Promise.all([
    queryAll(OVERDUE_ACTIONS_SQL),
    queryAll(AI_INBOX_SQL, [config.mcpActorId]),
    queryAll(
      `SELECT p.id, p.gls_number, p.name, c.name AS customer_name
       FROM projects p
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.application_form = 0 AND p.gls_number IS NOT NULL
         AND p.stage NOT IN ('s_completed','e_lost') AND p.deleted_at IS NULL
       ORDER BY p.updated_at DESC
       LIMIT 100`
    ),
    dailyopsVisible
      ? queryAll(
          `SELECT id, sender, subject, summary, category, importance, action_needed, url,
                  received_at, created_at
           FROM misc_inquiries
           WHERE deleted_at IS NULL AND handled_at IS NULL
           ORDER BY created_at ASC
           LIMIT 100`
        )
      : Promise.resolve([]),
    dailyopsVisible
      ? queryAll(
          `SELECT id, doc_type, sender, subject, amount, status, payment_due,
                  content, closing_month, gls_number, notes,
                  received_at, created_at
           FROM finance_docs
           WHERE deleted_at IS NULL AND status NOT IN ('processed','rejected')
           ORDER BY created_at ASC
           LIMIT 100`
        )
      : Promise.resolve([]),
  ]);

  // ── 二重計上の警告 (デザイン 5a・v2.9.253 で見送っていた分) ──────────────
  //
  // finance_docs は**まだ登録されていない**ので、既存の重複判定 (登録済みの行同士を
  // 突き合わせる仕組み) が使えない。ここで「同じ税抜金額の仕入・販管費が既にあるか」を
  // 突き合わせて、承認する前に気付けるようにする。
  //
  // **金額だけの一致は「同じ支払い」の証明にはならない** (月額の定額費用など、
  // 同額が正しく並ぶことは普通にある) ので、断定せず「既に1件あります」と出して
  // 人に確認させる。GLS 番号が読めているものはそれも併記する。
  const docAmounts = Array.from(
    new Set(financeDocs.map((d) => Number(d.amount)).filter((n) => Number.isFinite(n) && n > 0)),
  );
  let dupByAmount = new Map<number, { kind: string; gls_number: string | null; label: string; recognition_date: string | null }[]>();
  if (docAmounts.length > 0) {
    const ph = docAmounts.map(() => '?').join(',');
    const [pur, sga] = await Promise.all([
      queryAll(
        `SELECT pu.amount, pu.recognition_date, p.gls_number,
                COALESCE(NULLIF(pu.description,''), v.name, '仕入') AS label
         FROM purchases pu
         LEFT JOIN projects p ON p.id = pu.project_id
         LEFT JOIN vendors v ON v.id = pu.vendor_id
         WHERE pu.deleted_at IS NULL AND pu.amount IN (${ph})
         ORDER BY pu.created_at DESC LIMIT 200`,
        docAmounts,
      ),
      queryAll(
        `SELECT amount, recognition_date, NULL AS gls_number,
                COALESCE(NULLIF(description,''), vendor_name, '販管費') AS label
         FROM sga_expenses
         WHERE deleted_at IS NULL AND amount IN (${ph})
         ORDER BY created_at DESC LIMIT 200`,
        docAmounts,
      ),
    ]);
    dupByAmount = new Map();
    for (const [kind, rows] of [['purchase', pur], ['sga', sga]] as const) {
      for (const r of rows) {
        const amt = Number(r.amount);
        const list = dupByAmount.get(amt) ?? [];
        list.push({
          kind,
          gls_number: (r.gls_number as string | null) ?? null,
          label: String(r.label ?? ''),
          recognition_date: (r.recognition_date as string | null) ?? null,
        });
        dupByAmount.set(amt, list);
      }
    }
  }
  for (const d of financeDocs) {
    const hits = dupByAmount.get(Number(d.amount)) ?? [];
    // 同じ GLS のものがあればそれを先に見せる (一番心当たりが付く)
    const sameGls = d.gls_number ? hits.filter((h) => h.gls_number === d.gls_number) : [];
    const shown = (sameGls.length > 0 ? sameGls : hits).slice(0, 3);
    d.duplicate_count = hits.length;
    d.duplicate_same_gls = sameGls.length;
    d.duplicate_samples = shown;
  }

  // received_at: 経過タイマーの起点。inquiry/finance は受信日 (YYYY-MM-DD TEXT) を優先し、
  // 無ければ created_at。overdue は期限日 (= お客様を待たせ始めた瞬間)。
  const toMs = (v: unknown): number => {
    if (!v) return 0;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };
  const items = [
    ...overdue.map((r) => ({
      key: `overdue:${r.activity_id}`, kind: 'overdue_action', received_at: r.next_action_date, meta: r,
    })),
    ...aiProjects.map((r) => ({
      key: `ai:${r.id}`, kind: 'ai_project', received_at: r.created_at, meta: r,
    })),
    ...inquiries.map((r) => ({
      key: `inquiry:${r.id}`, kind: 'inquiry', received_at: r.received_at ?? r.created_at, meta: r,
    })),
    ...financeDocs.map((r) => ({
      key: `finance:${r.id}`, kind: 'finance_doc', received_at: r.received_at ?? r.created_at, meta: r,
    })),
  ].sort((a, b) => toMs(a.received_at) - toMs(b.received_at));

  // 行列が空のときに出す「直近7日で N件 終わらせました」(デザイン 6b)。
  // **新しいテーブルは作らず**、既にある完了の記録から数える:
  //   - project_tasks.completed_at (自分が担当のタスク)
  //   - activity_logs.next_action_done_at (自分が終わらせた次回アクション)
  // 数字を出せない状態で当てずっぽうを置くほうが害が大きいので、0 件なら画面に出さない。
  const doneRow = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM project_tasks
         WHERE deleted_at IS NULL AND completed_at IS NOT NULL
           AND completed_at >= NOW() - interval '7 days'
           AND (assigned_to = ? OR requester_id = ?)) AS tasks,
       (SELECT COUNT(*) FROM activity_logs
         WHERE deleted_at IS NULL AND next_action_done_at IS NOT NULL
           AND next_action_done_at >= NOW() - interval '7 days'
           AND user_id = ?) AS actions`,
    [user.id, user.id, user.id],
  ) as { tasks?: unknown; actions?: unknown } | null;
  const doneLast7 = Number(doneRow?.tasks ?? 0) + Number(doneRow?.actions ?? 0);

  res.json({
    success: true,
    data: {
      items,
      done_last_7days: doneLast7,
      checklist: agreements.map((r) => ({ key: `agreement:${r.id}`, kind: 'agreement', meta: r })),
      counts: {
        total: items.length,
        overdue_action: overdue.length,
        ai_project: aiProjects.length,
        inquiry: inquiries.length,
        finance_doc: financeDocs.length,
        agreement: agreements.length,
      },
      dailyops: { visible: dailyopsVisible, editable: dailyopsEditable },
    },
  });
});

/**
 * GET /dashboard/notifications — ベルの中身 (§4.15 / デザイン 18a)
 *
 * **通知は保存しない**。既存データ (inbox / tasks / bookings) から**その場で導出**する。
 * だから **既読の概念を持たない** — 終わらせた分は次に開いたときに消えている。
 * 「読んだだけでは何も終わっていない」ため、既読フラグを持つと嘘の «片づいた» が生まれる。
 *
 * グループ: お客様を待たせている / 依頼の返事 / AIが作ったもの (確認待ち) / 今日の現場。
 */
router.get('/notifications', async (req, res) => {
  const user = req.user!;
  const isAdmin = user.role === 'system_admin';
  const has = (m: string) => isAdmin || !!user.permissions?.[m];
  const today = new Date().toISOString().slice(0, 10);

  const [overdue, aiProjects, delegations, todayBookings] = await Promise.all([
    // お客様を待たせている (期限を過ぎた次回アクション)
    has('sales') ? queryAll(OVERDUE_ACTIONS_SQL) : Promise.resolve([]),
    // AI が作ったもの (未確認)
    has('sales') ? queryAll(AI_INBOX_SQL, [config.mcpActorId]) : Promise.resolve([]),
    // 依頼の返事 — 自分が出して未返答のもの (催促の判断は依頼者にさせる)
    has('dailyops')
      ? queryAll(
          `SELECT t.id, t.title, t.due_at, t.requested_at, t.delegation_status,
                  u.name AS assignee_name
           FROM project_tasks t
           LEFT JOIN users u ON u.id = t.assigned_to
           WHERE t.deleted_at IS NULL AND t.is_completed = FALSE
             AND t.requester_id = ? AND t.delegation_status IN ('requested','declined','consulting')
           ORDER BY t.requested_at ASC NULLS LAST
           LIMIT 50`,
          [user.id]
        )
      : Promise.resolve([]),
    // 今日の現場 (スタジオ予約)。start_time は TEXT なので先頭10桁で日付を見る
    has('studio')
      ? queryAll(
          `SELECT b.id, b.title, b.booking_type, b.all_day, b.start_time, b.end_time,
                  p.name AS project_name, p.gls_number,
                  COALESCE(
                    (SELECT string_agg(r.name, ' / ' ORDER BY r.sort_order, r.name)
                     FROM studio_booking_rooms br JOIN studio_rooms r ON r.id = br.room_id
                     WHERE br.booking_id = b.id), ''
                  ) AS room_names
           FROM studio_bookings b
           LEFT JOIN projects p ON p.id = b.project_id
           WHERE b.deleted_at IS NULL
             AND substr(b.start_time, 1, 10) <= ?
             AND substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10) >= ?
           ORDER BY b.start_time ASC
           LIMIT 30`,
          [today, today]
        )
      : Promise.resolve([]),
  ]);

  const groups = [
    {
      key: 'waiting',
      label: 'お客様を待たせている',
      rule: '期限を過ぎた次回アクション。終わらせると消えます',
      items: overdue.map((r: any) => ({
        id: `overdue:${r.activity_id}`,
        title: r.next_action,
        meta: [r.gls_number, r.project_name].filter(Boolean).join(' '),
        at: r.next_action_date,
        cta: '片づける',
        path: r.project_id ? `/sales/projects/${r.project_id}` : '/today',
      })),
    },
    {
      key: 'delegation',
      label: '依頼の返事',
      rule: '自分が出した依頼で、まだ返事が来ていないもの',
      items: delegations.map((r: any) => ({
        id: `deleg:${r.id}`,
        title: r.title,
        meta: `${r.assignee_name ?? '担当未設定'}・${r.delegation_status === 'requested' ? '未返答' : r.delegation_status === 'declined' ? '辞退された' : '相談中'}`,
        at: r.requested_at,
        cta: '決める',
        path: '/tasks?scope=me',
      })),
    },
    {
      key: 'ai',
      label: 'AIが作ったもの（確認待ち）',
      rule: '内容を見て確認済みにすると消えます',
      items: aiProjects.map((r: any) => ({
        id: `ai:${r.id}`,
        title: r.name,
        meta: [r.gls_number, r.customer_name].filter(Boolean).join(' '),
        at: r.created_at,
        cta: '確認する',
        path: `/sales/projects/${r.id}`,
      })),
    },
    {
      key: 'today',
      label: '今日の現場',
      rule: '今日ぶんだけ。日付が変われば消えます',
      items: todayBookings.map((r: any) => ({
        id: `bk:${r.id}`,
        title: r.project_name || r.title,
        meta: [r.room_names, r.all_day ? '終日' : String(r.start_time).slice(11, 16)].filter(Boolean).join(' ・ '),
        at: r.start_time,
        cta: '予定を開く',
        path: '/schedule?layers=studio',
      })),
    },
  ].filter((g) => g.items.length > 0);

  res.json({
    success: true,
    data: {
      groups,
      total: groups.reduce((n, g) => n + g.items.length, 0),
    },
  });
});

/**
 * 通知の受け取り方 (migration 137)。**通知そのものは保存しない**ので、
 * ここに入るのは「どう受け取りたいか」だけ。
 */
router.get('/notification-prefs', async (req, res) => {
  const row = await queryOne('SELECT * FROM user_notification_prefs WHERE user_id = ?', [req.user!.id]);
  res.json({
    success: true,
    data: row ?? {
      user_id: req.user!.id,
      morning_slack: true,
      morning_email: false,
      overdue_digest: true,
      delegation_instant: true,
    },
  });
});

router.put('/notification-prefs', async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const bool = (k: string, d: boolean) => (b[k] === undefined ? d : !!b[k]);
  await execute(
    `INSERT INTO user_notification_prefs (user_id, morning_slack, morning_email, overdue_digest, delegation_instant, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       morning_slack = EXCLUDED.morning_slack,
       morning_email = EXCLUDED.morning_email,
       overdue_digest = EXCLUDED.overdue_digest,
       delegation_instant = EXCLUDED.delegation_instant,
       updated_at = NOW()`,
    [req.user!.id, bool('morning_slack', true), bool('morning_email', false),
     bool('overdue_digest', true), bool('delegation_instant', true)]
  );
  const row = await queryOne('SELECT * FROM user_notification_prefs WHERE user_id = ?', [req.user!.id]);
  res.json({ success: true, data: row });
});

// v2.9.197+: AI 活動フィード — mcp_audit_log の書き込み履歴を時系列で返す
// (「AI が最近やったこと」をホームで一望する用途)。actor_id は OAuth 経由なら実ユーザー。
// v2.9.198+: tool (単一 tool_name) 絞り込み + page ページング + pagination 返却
// (data は従来どおり配列 = ホームのダイジェストは後方互換)。
router.get('/ai-activity-feed', async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 7));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const offset = (page - 1) * limit;

  let where = `WHERE m.created_at >= NOW() - (? || ' days')::interval`;
  const params: unknown[] = [days];
  const tool = req.query.tool as string;
  if (tool && /^[a-z_]{1,60}$/.test(tool)) { where += ' AND m.tool_name = ?'; params.push(tool); }

  const total = ((await queryOne(`SELECT COUNT(*) as c FROM mcp_audit_log m ${where}`, params)) as any).c;
  const rows = await queryAll(
    `SELECT m.id, m.tool_name, m.result_summary, m.requested_by, m.actor_id, m.created_at,
            u.name AS actor_name
     FROM mcp_audit_log m
     LEFT JOIN users u ON u.id = m.actor_id
     ${where}
     ORDER BY m.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  });
});

router.get('/weekly-schedule', async (_req, res) => {
  const now = new Date();
  const days: Array<{ date: string; dayLabel: string; events: unknown[] }> = [];
  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

  // 今日起点の 7 日間 (「今後のスケジュール」— 過ぎた曜日は表示しない)
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    const projects = await queryAll(
      `SELECT p.id, p.gls_number, p.name, p.stage, 'event' as type
       FROM projects p WHERE p.deleted_at IS NULL AND p.gls_number IS NOT NULL
       AND (p.event_start <= ? AND p.event_end >= ? OR p.event_start = ?)`,
      [dateStr, dateStr, dateStr]
    );
    const episodes = await queryAll(
      `SELECT e.episode_code, e.recording_date, e.broadcast_date, p.gls_number, p.name as project_name
       FROM episodes e JOIN projects p ON p.id = e.project_id
       WHERE e.deleted_at IS NULL AND (e.recording_date = ? OR e.broadcast_date = ?)`,
      [dateStr, dateStr]
    );
    // スタジオ予約 (メンテナンス・リハーサル・仮押さえ等の全種別)。
    // start_time/end_time は TEXT (ISO文字列) のため日付先頭 10 桁の文字列比較 (v2.9.144 と同方式)
    const bookings = await queryAll(
      `SELECT b.id, b.title as name, b.booking_type, b.project_id, p.gls_number
       FROM studio_bookings b LEFT JOIN projects p ON p.id = b.project_id
       WHERE b.deleted_at IS NULL
       AND substr(b.start_time, 1, 10) <= ?
       AND substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10) >= ?`,
      [dateStr, dateStr]
    );

    // 本番予約 (performance) は案件のイベント期間 ('event') と重複しやすいので、
    // 同じ案件がその日に既に出ている場合はスキップ (他の種別はすべて表示)
    const projectIds = new Set(projects.map((p: any) => p.id));
    const bookingEvents = bookings
      .filter((b: any) => !(b.booking_type === 'performance' && b.project_id && projectIds.has(b.project_id)))
      .map((b: any) => ({
        name: b.name, gls_number: b.gls_number, booking_type: b.booking_type, type: 'booking',
      }));

    days.push({
      date: dateStr,
      dayLabel: dayLabels[d.getDay()],
      events: [...projects, ...episodes.map((ep: any) => ({
        ...ep, type: ep.recording_date === dateStr ? 'recording' : 'broadcast',
      })), ...bookingEvents],
    });
  }
  res.json({ success: true, data: days });
});

router.get('/monthly-chart', async (_req, res) => {
  const months: Array<{ month: string; revenue: number; purchase: number; sga: number; gross_profit: number; operating_profit: number }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = `${ym}-01`;
    const monthEnd = `${ym}-31`;
    const rev = await queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM revenues WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
    const pur = await queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM purchases WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
    const sgaNonAmortizedRow = await queryOne(
      `SELECT COALESCE(SUM(amount),0) as total FROM sga_expenses
       WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL
       AND (amortize_start IS NULL OR amortize_start = '')`,
      [monthStart, monthEnd]
    );
    const sgaAmortizedRows = await queryAll(
      `SELECT amount, amortize_start, amortize_end FROM sga_expenses
       WHERE deleted_at IS NULL AND amortize_start IS NOT NULL AND amortize_start != ''
       AND amortize_start <= ? AND amortize_end >= ?`,
      [ym, ym]
    );
    let monthSgaAmortized = 0;
    for (const row of sgaAmortizedRows) {
      const m = countMonths(row.amortize_start as string, row.amortize_end as string);
      if (m > 0) monthSgaAmortized += Math.floor((row.amount as number) / m);
    }
    const revenue = (rev?.total as number) || 0;
    const purchase = (pur?.total as number) || 0;
    const sga = ((sgaNonAmortizedRow?.total as number) || 0) + monthSgaAmortized;
    months.push({ month: ym, revenue, purchase, sga, gross_profit: revenue - purchase, operating_profit: revenue - purchase - sga });
  }
  res.json({ success: true, data: months });
});

router.get('/pipeline', async (_req, res) => {
  const stages = await queryAll(
    `SELECT stage, COUNT(*) as count, COALESCE(SUM(expected_amount),0) as total_amount
     FROM projects WHERE deleted_at IS NULL AND stage NOT IN ('e_lost','s_completed')
     GROUP BY stage ORDER BY CASE stage
       WHEN 'neta' THEN 1 WHEN 'd_hold' THEN 2 WHEN 'c_proposal' THEN 3
       WHEN 'b_verbal' THEN 4 WHEN 'a_won' THEN 5 END`
  );
  res.json({ success: true, data: stages });
});

export default router;
