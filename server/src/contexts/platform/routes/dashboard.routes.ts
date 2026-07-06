import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

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
