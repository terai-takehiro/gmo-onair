import { Router } from 'express';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission, requireAnyPermission } from '../../../shared/middleware/auth';
import { jstDate, shiftYmd } from '../../../shared/utils/jst';
import { config } from '../../../config';
import { getSalesOverview } from '../services/salesOverview.service';
import { getAppBadges } from '../services/appBadges.service';
/**
 * 健全性（stalled）と放置日数の式は **project-health.ts の単一定義**を読む
 * （docs/core-redesign-plan.md §3-7）。ここに写すと一覧のバッジと「今日の営業」が黙ってずれる。
 */
import { completeElapsedWonProjects, healthSql, stalledDaysSql } from '../../sales/services/project-health';
/**
 * 見積金額（見積があれば見積・無ければ想定）の導出は **project.service.ts の
 * ESTIMATE_AMOUNT_LATERAL 単一定義**を使う（docs/project-ledger-phase-c-design.md
 * テーマ1 C-1a）。ここに書き写すと版・group_id の扱いが2か所に増え、ずれる。
 */
import { ESTIMATE_AMOUNT_LATERAL } from '../../sales/services/project.service';
/**
 * 「未対応の次回アクション」の判定は **1本だけ**（migration 245）。
 * ここに写すと、営業活動記録・週報・MCP と**違う集合を同じ名前で呼ぶ**ことになる。
 */
import { OPEN_NEXT_ACTION_SQL } from '../../../shared/services/next-action-state';
/**
 * 「今日さばくもの」の条件は日常業務と同じ1本（migration 247）。
 * 受信箱だけ違う集合を数えると、同じ画面の2か所で件数が食い違う。
 */
import { DESK_COND } from '../../dailyops/services/inbox.service';

const router = Router();

/**
 * トップページのアプリタイルに出す件数 (v4)。
 *
 * **`sales` の権限を要求する前に置いている。** この下の `router.use` は
 * すべてのルートに `sales` を要求するが、トップページは**全員が最初に開く画面**で、
 * 経理だけ・機材だけの人も来る。ここを sales の内側に置くと、その人たちの
 * トップページで 403 が出る（自分に関係のあるタイルの数字さえ出ない）。
 *
 * 中で見えるのは**その人が権限を持つアプリの件数だけ**なので、
 * `requireAuth` で足りる（詳細は appBadges.service.ts）。
 *
 * **案件管理と日常業務のぶんはここに無い** — 受信箱 (`/dashboard/inbox`) が
 * 同じものを数えているので、2か所で数えないため。
 */
router.get('/app-badges', requireAuth, async (req, res) => {
  res.json({ success: true, data: await getAppBadges(req.user!) });
});

/**
 * 受信箱。**`sales` を要求する前に置いている**（`app-badges` と同じ理由）。
 *
 * この下の `router.use` は全ルートに `sales` を要求しますが、受信箱には
 * **日常業務のもの（未対応の問い合わせ・未処理の書類）も入っています**。
 * 内側に置いていたので、**`dailyops` だけの人はトップページで 403** になり、
 * しかも失敗が画面に出ないため**「お待たせしているものはありません」と
 * 表示されていました** — 数えていないだけなのに「無い」と言い切る形です
 * （レビューでの指摘 #55 / #60）。
 *
 * **`sales` か `dailyops` のどちらかで通し、中身は持っている権限のぶんだけ**
 * 返します（`salesVisible` / `dailyopsVisible`）。口を開けるだけだと、
 * `dailyops` だけの人に案件名とお客様名が渡ります（v4.0.12 と同じ穴）。
 */
// ══════════════════════════════════════════════════════════
// 受信箱 (v2.9.217+) — 「お客様を待たせているもの」を1本のキューに集約
// items   = 終端状態を持つ inbound のみ (期限超過アクション / AI起票未確認 /
//           未対応の問い合わせ / 未処理の見積・請求)。received_at 昇順 = 古いものが先頭。
// checklist = 経過時間の概念が薄いチェック系 (申込書未提出)。
// dailyops 系 (問い合わせ/見積請求) は dailyops 権限がある人にだけ含める。
// ══════════════════════════════════════════════════════════
router.get('/inbox', requireAuth, requireAnyPermission(['sales', 'dailyops']), async (req, res) => {
  const user = req.user!;
  const dailyLevel = user.permissions?.['dailyops'] ?? '';
  // **案件側も権限で絞る。** 口を `dailyops` にも開けた以上、絞らないと
  // `dailyops` だけの人に案件名・お客様名が渡る（v4.0.12 で塞いだ穴と同じ形）
  const salesVisible = user.role === 'system_admin' || !!(user.permissions?.['sales'] ?? '');
  const dailyopsVisible = user.role === 'system_admin' || !!dailyLevel;
  const dailyopsEditable =
    user.role === 'system_admin' || ['editor', 'manager', 'owner'].includes(dailyLevel);

  /*
   * 一覧は上限つき（画面に並べられる量に限りがある）だが、**件数は上限を掛けずに数える**。
   * 上限に当たった行を数え落とすと、バッジが「50」で止まったまま実数だけが増えていく。
   */
  const AGREEMENT_BASE =
    `FROM projects p
     LEFT JOIN companies c ON c.id = p.customer_id
     WHERE p.application_form = 0 AND p.gls_number IS NOT NULL
       AND p.gls_category = 'A'
       AND p.stage NOT IN ('s_completed','e_lost') AND p.deleted_at IS NULL`;
  // 171: 正は state 列。handled_at で絞ると、仕分け済みなのに
  // 記録が打たれていない行が受信箱に残り続ける
  /*
   * ⚠️ **「まだ仕分けていない情報」の条件は日常業務と同じ1本**（`DESK_COND`）。
   *
   * ここは長らく `state = 'unsorted'` だけを数えていて、日常業務の画面と
   * ホームのタイル（`GET /dailyops/alerts`）と**違う件数**を出していた。
   * migration 247 で「ストックは見直す日が来たら机に戻る」ようになったので、
   * 写したままだと**戻ってきたストックが受信箱にだけ出ない**（気づけない）。
   */
  const INQUIRY_BASE = `FROM misc_inquiries i WHERE i.deleted_at IS NULL AND ${DESK_COND}`;
  // **見積書（quote）は台帳に入らない**（実際に仕入・販管費になるのは請求書・注文書だけ。
  // ユーザー指摘）。受信箱に出しても「台帳に入れる」までたどり着けない行が並ぶだけなので、
  // ここで最初から外す。`financeDocService.list()`（受け取った書類の一覧本体）・
  // `pendingCount()`（同画面のバッジ）も同じ条件で揃える（下記）
  const FINANCE_DOC_BASE =
    `FROM finance_docs WHERE deleted_at IS NULL AND status NOT IN ('processed','rejected') AND doc_type <> 'quote'`;

  const countOf = async (sql: string, params: unknown[] = []): Promise<number> =>
    Number(((await queryOne(sql, params)) as { c?: number } | undefined)?.c ?? 0);
  const zero = Promise.resolve(0);

  const [
    overdue, aiProjects, agreements, inquiries, financeDocs,
    overdueTotal, aiProjectTotal, agreementTotal, inquiryTotal, financeDocTotal,
  ] = await Promise.all([
    salesVisible ? queryAll(OVERDUE_ACTIONS_SQL) : Promise.resolve([]),
    salesVisible ? queryAll(AI_INBOX_SQL, [config.mcpActorId]) : Promise.resolve([]),
    salesVisible ? queryAll(
      `SELECT p.id, p.gls_number, p.name, c.name AS customer_name
       ${AGREEMENT_BASE}
       ORDER BY p.updated_at DESC
       LIMIT 100`
    ) : Promise.resolve([]),
    dailyopsVisible
      ? queryAll(
          `SELECT id, sender, subject, summary, category, importance, action_needed, url,
                  received_at, created_at
           ${INQUIRY_BASE}
           ORDER BY i.created_at ASC
           LIMIT 100`
        )
      : Promise.resolve([]),
    dailyopsVisible
      ? queryAll(
          `SELECT id, doc_type, sender, subject, amount, status, payment_due,
                  received_at, created_at
           ${FINANCE_DOC_BASE}
           ORDER BY created_at ASC
           LIMIT 100`
        )
      : Promise.resolve([]),
    salesVisible ? countOf(OVERDUE_ACTIONS_COUNT_SQL) : zero,
    salesVisible ? countOf(AI_INBOX_COUNT_SQL, [config.mcpActorId]) : zero,
    salesVisible ? countOf(`SELECT COUNT(*)::int AS c ${AGREEMENT_BASE}`) : zero,
    dailyopsVisible ? countOf(`SELECT COUNT(*)::int AS c ${INQUIRY_BASE}`) : zero,
    dailyopsVisible ? countOf(`SELECT COUNT(*)::int AS c ${FINANCE_DOC_BASE}`) : zero,
  ]);

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

  res.json({
    success: true,
    data: {
      items,
      checklist: agreements.map((r) => ({ key: `agreement:${r.id}`, kind: 'agreement', meta: r })),
      /**
       * **実数**（`items` の長さではない）。`items` は種類ごとに上限を掛けて
       * 返すので、溜まっている環境では両者が食い違う。画面はこちらを数字として出し、
       * 「並べきれなかった分がある」ことは `shown` との差で言う。
       */
      counts: {
        total: overdueTotal + aiProjectTotal + inquiryTotal + financeDocTotal,
        overdue_action: overdueTotal,
        ai_project: aiProjectTotal,
        inquiry: inquiryTotal,
        finance_doc: financeDocTotal,
        agreement: agreementTotal,
      },
      /** いま `items` / `checklist` に載せた数。**上限に当たったかはここで分かる** */
      shown: {
        total: items.length,
        overdue_action: overdue.length,
        ai_project: aiProjects.length,
        inquiry: inquiries.length,
        finance_doc: financeDocs.length,
        agreement: agreements.length,
      },
      dailyops: { visible: dailyopsVisible, editable: dailyopsEditable },
      // ⚠️ **数えたかどうかを渡す。** 画面はこれを見て、数えていない側に
      // 「0件です」と書かない（見えていないだけなのに「無い」と言い切らない）
      sales: { visible: salesVisible },
    },
  });
});


// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

function countMonths(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

/**
 * 受注→完了の繰り上げ (event_end < today)。
 *
 * ⚠️ **中身は日次ジョブ `project_tidy` と同じ1本**（`project-health.ts` の
 * `completeElapsedWonProjects`）。以前はここに**生 UPDATE** があり、
 * 誰もダッシュボードを開かない日は動かず、`project_stage_changes` の履歴も
 * 残らなかった。正は日次ジョブに移した — **この口は互換のために残してある**だけ
 * （開いた瞬間に反映される即時性はそのまま）。
 */
router.get('/check-completed', async (_req, res) => {
  const completed = await completeElapsedWonProjects();
  res.json({ success: true, data: { updated: true, completed } });
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
//
// ⚠️ **一覧と件数は同じ「FROM 〜 WHERE」から組む。** 件数を `rows.length` で
// 出していたので、`LIMIT` に当たった瞬間から**画面の数字が実数と別のもの**になる
// （実測: 未確認の AI 起票 124 件 → バッジは 50、未仕分けの問い合わせ 132 件 → 100）。
// しかも**エラーは出ず、増えるほどズレが広がる**ので誰も報告できない。
//
// 「次の一手」の共通条件（未対応の次回アクション × 進行中の案件）。
// 超過（< 今日・受信箱）と「今日の営業」（<= 今日・今日期限も含む）は
// **この1本から日付の切り方だけ**を変えて組む — 条件を写すと片方だけ直る。
//
// ⚠️ 判定そのものは**アプリ全体で1本**（`OPEN_NEXT_ACTION_SQL`・migration 245）。
// ここは以前から終了案件を除いていたが、**同じ言葉を使う他の6か所は除いていなかった**
// ので、写しをやめて全部が同じ式を読む形にした。
const NEXT_MOVES_CORE =
  `FROM activity_logs a
   JOIN projects p ON p.id = a.project_id
   LEFT JOIN users u ON u.id = a.user_id
   LEFT JOIN companies c ON c.id = p.customer_id
   WHERE ${OPEN_NEXT_ACTION_SQL}
     AND p.deleted_at IS NULL`;

const OVERDUE_ACTIONS_BASE = `${NEXT_MOVES_CORE}
     AND a.next_action_date < CURRENT_DATE::text`;

const OVERDUE_ACTIONS_SQL =
  `SELECT a.id AS activity_id, a.next_action, a.next_action_date,
          a.project_id, p.code AS project_code, p.gls_number, p.name AS project_name, p.stage,
          a.user_id, u.name AS assigned_to_name, c.name AS customer_name,
          (CURRENT_DATE - a.next_action_date::date) AS days_overdue
   ${OVERDUE_ACTIONS_BASE}
   ORDER BY a.next_action_date ASC
   LIMIT 200`;

const OVERDUE_ACTIONS_COUNT_SQL = `SELECT COUNT(*)::int AS c ${OVERDUE_ACTIONS_BASE}`;

// 期限超過の次回アクション (エスカレーション用)。進行中案件で next_action_date < 今日 かつ 未完了。
// 期限が古い順。ホームの「対応漏れ」アラートと、Claude スケジュール実行→Slack 通知の両方で使う。
router.get('/overdue-actions', async (_req, res) => {
  const rows = await queryAll(OVERDUE_ACTIONS_SQL);
  res.json({ success: true, data: rows });
});

// ══════════════════════════════════════════════════════════
// 「今日の営業」(docs/core-redesign-plan.md Phase 2 ①) — 営業が朝いちばんに開く3つの束。
// 3集合とも **GLS-A（案件）だけ**（営業のビュー。GLS-B はプロジェクト管理の持ち物）。
// ══════════════════════════════════════════════════════════

// 期限が来た次の一手。**条件は受信箱の超過（OVERDUE_ACTIONS_BASE）と同じ NEXT_MOVES_CORE**
// で、違いは日付の切り方だけ（<= 今日 = 今日期限のぶんも含める。超過してから浮上では遅い）。
// 古い順 = 長くお待たせしているものが先。
const TODAY_NEXT_MOVES_SQL =
  `SELECT a.project_id, p.name AS project_name, c.name AS customer_name,
          a.next_action AS action,
          -- 一覧の1行に収まる短い言い換え（AI 生成・migration 190）。無ければ本文をそのまま
          COALESCE(NULLIF(a.next_action_short, ''), a.next_action) AS action_short,
          a.next_action_date AS due_date,
          a.id AS activity_log_id
   ${NEXT_MOVES_CORE}
     AND a.next_action_date <= CURRENT_DATE::text
     AND p.gls_category = 'A'
   ORDER BY a.next_action_date ASC
   LIMIT 50`;

// スヌーズが明けたばかりの案件（今日までの7日間）。明けて7日経ったら黙って退場する —
// 「明けました」を永久に並べると、次に開いた日から誰も読まなくなる。
// snooze_until は DATE を ::text で返す（pg が JS Date にして UTC で1日ずれるため。一覧と同じ理由）
const SNOOZE_AWAKE_SQL =
  `SELECT p.id AS project_id, p.name AS project_name, c.name AS customer_name,
          p.snooze_until::text AS snooze_until
   FROM projects p
   LEFT JOIN companies c ON c.id = p.customer_id
   WHERE p.deleted_at IS NULL AND p.gls_category = 'A'
     AND p.stage NOT IN ('s_completed','e_lost')
     AND p.snooze_until BETWEEN (CURRENT_DATE - 7) AND CURRENT_DATE
   ORDER BY p.snooze_until DESC
   LIMIT 50`;

// 新しく停滞に入った案件。判定は project-health の 'stalled' そのもの（終端・スヌーズ中・
// 期限超過は式の中で除外済み）。放置日数の**少ない順** = 腐り始めたばかりのものが先 —
// 何百日も放置のものは受信箱・自動整理が拾う側で、ここは「今日気づけば安く済む」ものを出す。
const NEWLY_STALLED_SQL =
  `SELECT p.id AS project_id, p.name AS project_name, c.name AS customer_name, p.stage,
          ${stalledDaysSql()} AS stalled_days
   FROM projects p
   LEFT JOIN companies c ON c.id = p.customer_id
   WHERE p.deleted_at IS NULL AND p.gls_category = 'A'
     AND (${healthSql()}) = 'stalled'
   ORDER BY stalled_days ASC
   LIMIT 20`;

router.get('/today-sales', async (_req, res) => {
  const [nextMoves, snoozeAwake, newlyStalled] = await Promise.all([
    queryAll(TODAY_NEXT_MOVES_SQL),
    queryAll(SNOOZE_AWAKE_SQL),
    queryAll(NEWLY_STALLED_SQL),
  ]);
  res.json({
    success: true,
    data: { next_moves: nextMoves, snooze_awake: snoozeAwake, newly_stalled: newlyStalled },
  });
});

router.get('/recent-projects', async (_req, res) => {
  const rows = await queryAll(
    `SELECT p.*, c.name as customer_name FROM projects p
     LEFT JOIN companies c ON c.id = p.customer_id
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
            COALESCE(est.amount, 0) AS estimate_amount,
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
     LEFT JOIN companies c ON c.id = p.customer_id
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
     ${ESTIMATE_AMOUNT_LATERAL}
     -- **GLS-A（案件）だけ** (migration 179)。期限超過の次アクションは営業の道具で、
     -- GLS-B（プロジェクト）の「相手待ち」はプロジェクト管理の未確認事項が持つ
     WHERE p.deleted_at IS NULL AND p.gls_category = 'A'
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
//
// ⚠️ **受付に出すのはネタ行きだけ**（下の stage 条件・ご判断）。
//
// ここには長く**ステージの条件が1つもありませんでした**。受付で「見送りにする」を
// 押すと stage は e_lost になるのに、この一覧の条件は ai_reviewed_at IS NULL だけ
// なので**カードはそのまま残ります** ＝ 押した人には「見送りにしても全く反応しない」
// としか見えません（実測: 見送り・案件にする・受注・完了の4つとも残っていた）。
//
// 直し方は2通りありました:
//
//   (a) 決着したもの（終了・失注）だけ外す … AI が仮押さえ以降で起票したものも
//       受付に出るが、**誰も触っていないのに段だけ進んでいる行が残り続ける**
//   (b) **ネタ行きだけ出す** … 受付は「まだ仕分けていない引き合い」の置き場に
//       徹する。段が1つでも進んでいれば、それは誰かが動かした＝仕分け済み
//
// **(b) を採りました。** 受付は毎日その順に消化する画面なので、
// 「消えない行」が1つでもあると画面全体が信用されなくなります。
//
// ⚠️ **AI が仮押さえ以降で起票したものは受付に出ません**（MCP の create_project は
// neta / d_hold / c_proposal / b_verbal を受ける）。それらは案件一覧の
// 「AI・未確認」の札と AI 絞り込み（ai_created + ai_reviewed=unreviewed）で拾えます。
// 受付に出したいなら **create_project 側を neta に寄せる**こと — ここを緩めると
// また「決めても消えない行」が戻ります。
//
// 印 (ai_reviewed_at) のほうは案件一覧の札と教師データが使います
// (projectService.markAiReviewedByStageDecision)。**この一覧は段で外すので、
// 印が書かれていない古い行も自動で片づきます。**
const AI_INBOX_BASE =
  `FROM projects p
   LEFT JOIN companies c ON c.id = p.customer_id
   LEFT JOIN users u ON u.id = p.assigned_to
   LEFT JOIN LATERAL (
     SELECT m.id AS audit_id, m.requested_by FROM mcp_audit_log m
     WHERE m.tool_name = 'create_project' AND m.result_summary->>'created_id' = p.id
     ORDER BY m.created_at ASC
     LIMIT 1
   ) ai ON TRUE
   ${ESTIMATE_AMOUNT_LATERAL}
   -- **GLS-A（案件）だけ** (migration 179)。受付は案件管理の画面で、
   -- GLS-B（プロジェクト）はプロジェクト管理で受け取る
   WHERE p.deleted_at IS NULL AND p.gls_category = 'A'
     AND (p.created_by = ? OR ai.audit_id IS NOT NULL)
     AND p.ai_reviewed_at IS NULL
     -- 受付に出すのはネタ行きだけ。段が1つでも進んでいれば誰かが動かした
     -- = 仕分け済みなので出さない。理由は上のコメント
     AND p.stage = 'neta'`;

const AI_INBOX_SQL =
  `SELECT p.id, p.code, p.gls_number, p.name, p.stage, p.expected_amount,
          COALESCE(est.amount, 0) AS estimate_amount, p.created_at,
          p.intake_channel, p.intake_confidence,
          c.name AS customer_name, u.name AS assigned_to_name,
          ai.requested_by AS ai_requested_by
   ${AI_INBOX_BASE}
   ORDER BY p.created_at DESC
   LIMIT 50`;

const AI_INBOX_COUNT_SQL = `SELECT COUNT(*)::int AS c ${AI_INBOX_BASE}`;

router.get('/ai-inbox', async (_req, res) => {
  const rows = await queryAll(AI_INBOX_SQL, [config.mcpActorId]);
  res.json({ success: true, data: rows });
});

// **AI 活動フィード（`/ai-activity-feed`）は削除した**（v4「AI活動履歴」画面ごと・ご指示）。
// mcp_audit_log は監査用に過ぎず、AI が触ったかは案件一覧・案件詳細のほうが記録単位で
// 上位互換なため。mcp_audit_log への書き込み自体（監査ログ）はここでは触っていない。

router.get('/weekly-schedule', async (_req, res) => {
  const days: Array<{ date: string; dayLabel: string; events: unknown[] }> = [];
  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

  // 今日起点の 7 日間 (「今後のスケジュール」— 過ぎた曜日は表示しない)。
  // 「今日」は JST で決める — コンテナは UTC で動く（jst.ts 冒頭）ので、
  // toISOString() だと JST 00:00〜08:59 は前日始まりの週になる
  const startStr = jstDate();
  const endStr = shiftYmd(startStr, 6);

  // トップページ（TodayCard）と案件管理ダッシュボードが叩く最頻経路。
  // 以前は 7 日 × 3 テーブル = 21 回の逐次クエリだったので、7 日ぶんを
  // 各テーブル 1 回の範囲クエリで読み、日ごとの振り分けは JS で行う
  // （各日の判定は旧実装の SQL と同じ式。日付は全列 TEXT/DATE文字列なので文字列比較でよい）
  const [projects, episodes, bookings] = await Promise.all([
    // event_start/event_end は振り分け用に足した列。応答に出す前に取り除く
    queryAll(
      `SELECT p.id, p.gls_number, p.name, p.stage, p.event_start, p.event_end, 'event' as type
       FROM projects p WHERE p.deleted_at IS NULL AND p.gls_number IS NOT NULL
       AND (p.event_start <= ? AND p.event_end >= ? OR p.event_start >= ? AND p.event_start <= ?)`,
      [endStr, startStr, startStr, endStr]
    ),
    queryAll(
      `SELECT e.episode_code, e.recording_date, e.broadcast_date, p.gls_number, p.name as project_name
       FROM episodes e JOIN projects p ON p.id = e.project_id
       WHERE e.deleted_at IS NULL
       AND (e.recording_date BETWEEN ? AND ? OR e.broadcast_date BETWEEN ? AND ?)`,
      [startStr, endStr, startStr, endStr]
    ),
    // スタジオ予約 (メンテナンス・リハーサル・仮押さえ等の全種別)。
    // start_time/end_time は TEXT (ISO文字列) のため日付先頭 10 桁の文字列比較 (v2.9.144 と同方式)
    queryAll(
      // v4: 時刻も返す。トップページの「今日の予定」を時間順に並べるため。
      // 案件の本番日・収録日は日付しか持たないので、時刻を持つのは予約だけになる
      // (画面はそれを「終日」として扱う)。
      `SELECT b.id, b.title as name, b.booking_type, b.project_id, p.gls_number,
              b.start_time, b.end_time
       FROM studio_bookings b LEFT JOIN projects p ON p.id = b.project_id
       WHERE b.deleted_at IS NULL
       AND substr(b.start_time, 1, 10) <= ?
       AND substr(COALESCE(NULLIF(b.end_time, ''), b.start_time), 1, 10) >= ?`,
      [endStr, startStr]
    ),
  ]);

  for (let i = 0; i < 7; i++) {
    const dateStr = shiftYmd(startStr, i);

    const dayProjects = projects
      .filter((p: any) => (p.event_start <= dateStr && p.event_end >= dateStr) || p.event_start === dateStr)
      .map((p: any) => {
        const row = { ...p };
        delete row.event_start;
        delete row.event_end;
        return row;
      });
    const dayEpisodes = episodes.filter(
      (ep: any) => ep.recording_date === dateStr || ep.broadcast_date === dateStr
    );
    const dayBookings = bookings.filter((b: any) => {
      // COALESCE(NULLIF(end_time,''), start_time) と同じ: 終了が無い予約は開始日=終了日
      const bStart = (b.start_time || '').slice(0, 10);
      const bEnd = (b.end_time || b.start_time || '').slice(0, 10);
      return bStart <= dateStr && bEnd >= dateStr;
    });

    // 本番予約 (performance) は案件のイベント期間 ('event') と重複しやすいので、
    // 同じ案件がその日に既に出ている場合はスキップ (他の種別はすべて表示)
    const projectIds = new Set(dayProjects.map((p: any) => p.id));
    const bookingEvents = dayBookings
      .filter((b: any) => !(b.booking_type === 'performance' && b.project_id && projectIds.has(b.project_id)))
      .map((b: any) => ({
        id: b.id, name: b.name, gls_number: b.gls_number, booking_type: b.booking_type,
        start_time: b.start_time, end_time: b.end_time,
        // 仮押さえは本予約と見分けたい (放っておくと押さえたまま流れる)
        type: b.booking_type === 'hold' ? 'hold' : 'booking',
      }));

    days.push({
      date: dateStr,
      // 曜日は JST の日付文字列から出す（UTC 固定で読めば時間帯に依存しない）
      dayLabel: dayLabels[new Date(`${dateStr}T00:00:00Z`).getUTCDay()],
      events: [...dayProjects, ...dayEpisodes.map((ep: any) => ({
        ...ep,
        /*
         * ⚠️ **名前を必ず入れる**（レビューでの指摘 #55）。
         * 画面（`home/TodayCard.tsx`）は `ev.name` を出しますが、この行は
         * `project_name` と `episode_code` しか持っていなかったので、
         * **収録・放送の予定だけ名前が空**で並んでいました
         * （札と時刻はあるのに、何の予定か分からない）。
         */
        name: [ep.project_name, ep.episode_code].filter(Boolean).join(' ') || '(名前なし)',
        type: ep.recording_date === dateStr ? 'recording' : 'broadcast',
      })), ...bookingEvents],
    });
  }
  res.json({ success: true, data: days });
});

router.get('/monthly-chart', async (_req, res) => {
  const now = new Date();
  // 直近 12 か月の YYYY-MM（古い月 → 新しい月）
  const yms: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    yms.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const rangeStart = `${yms[0]}-01`;
  const rangeEnd = `${yms[yms.length - 1]}-31`;

  // 以前は 12 か月 × 4 = 48 回の逐次クエリで同じ3表を12回ずつ走査していた。
  // 12 か月ぶんを月ごとの GROUP BY でまとめて読む（recognition_date は TEXT の
  // YYYY-MM-DD なので substr で月が取れる）。月ごとの数字は変えない
  const [revRows, purRows, sgaNonAmortizedRows, sgaAmortizedRows] = await Promise.all([
    queryAll(
      `SELECT substr(recognition_date, 1, 7) as ym, COALESCE(SUM(amount),0) as total FROM revenues
       WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL
       GROUP BY substr(recognition_date, 1, 7)`,
      [rangeStart, rangeEnd]
    ),
    queryAll(
      `SELECT substr(recognition_date, 1, 7) as ym, COALESCE(SUM(amount),0) as total FROM purchases
       WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL
       GROUP BY substr(recognition_date, 1, 7)`,
      [rangeStart, rangeEnd]
    ),
    queryAll(
      `SELECT substr(recognition_date, 1, 7) as ym, COALESCE(SUM(amount),0) as total FROM sga_expenses
       WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL
       AND (amortize_start IS NULL OR amortize_start = '')
       GROUP BY substr(recognition_date, 1, 7)`,
      [rangeStart, rangeEnd]
    ),
    // 償却按分は期間 (YYYY-MM 同士の文字列比較) が窓と重なる行だけ読み、月ごとの按分は JS で行う
    queryAll(
      `SELECT amount, amortize_start, amortize_end FROM sga_expenses
       WHERE deleted_at IS NULL AND amortize_start IS NOT NULL AND amortize_start != ''
       AND amortize_start <= ? AND amortize_end >= ?`,
      [yms[yms.length - 1], yms[0]]
    ),
  ]);
  const toMap = (rows: Array<Record<string, unknown>>): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.ym as string, (r.total as number) || 0);
    return m;
  };
  const revByYm = toMap(revRows);
  const purByYm = toMap(purRows);
  const sgaByYm = toMap(sgaNonAmortizedRows);

  const months: Array<{ month: string; revenue: number; purchase: number; sga: number; gross_profit: number; operating_profit: number }> = yms.map((ym) => {
    let monthSgaAmortized = 0;
    for (const row of sgaAmortizedRows) {
      if ((row.amortize_start as string) > ym || (row.amortize_end as string) < ym) continue;
      const m = countMonths(row.amortize_start as string, row.amortize_end as string);
      if (m > 0) monthSgaAmortized += Math.floor((row.amount as number) / m);
    }
    const revenue = revByYm.get(ym) || 0;
    const purchase = purByYm.get(ym) || 0;
    const sga = (sgaByYm.get(ym) || 0) + monthSgaAmortized;
    return { month: ym, revenue, purchase, sga, gross_profit: revenue - purchase, operating_profit: revenue - purchase - sga };
  });
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

/**
 * 案件管理ダッシュボード (v4 ①) の数字。中身は `salesOverview.service` を読む。
 * **1回で全部返す** — 数字が後から差し替わると読み間違えるため。
 */
router.get('/sales-overview', async (_req, res) => {
  res.json({ success: true, data: await getSalesOverview() });
});

export default router;
