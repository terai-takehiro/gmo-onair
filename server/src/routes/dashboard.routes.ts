import { Router } from 'express';
import { queryAll, queryOne, execute } from '../db/connection';

const router = Router();

function countMonths(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

// Auto-complete: A受注済み → S案件終了 (event_end < today)
router.get('/check-completed', (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const rows = queryAll(
    `SELECT o.id as opp_id FROM opportunities o
     JOIN projects p ON p.id = o.project_id
     WHERE o.stage = 'a_won' AND o.deleted_at IS NULL
     AND p.event_end IS NOT NULL AND p.event_end < ?`,
    [today]
  );
  let updated = 0;
  for (const row of rows) {
    execute(`UPDATE opportunities SET stage='s_completed', updated_at=datetime('now') WHERE id=?`, [row.opp_id]);
    updated++;
  }
  res.json({ success: true, data: { updated } });
});

router.get('/kpi', (_req, res) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
  const rev = queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM revenues WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
  const pur = queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM purchases WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
  const activeProjects = queryOne(`SELECT COUNT(*) as c FROM projects WHERE status IN ('tentative','confirmed') AND deleted_at IS NULL`);
  const activeOpps = queryOne(`SELECT COUNT(*) as c FROM opportunities WHERE stage IN ('neta','d_hold','c_proposal','b_verbal') AND deleted_at IS NULL`);
  // Calculate monthly SGA: spot expenses with amortization spread across months, plus fixed/non-amortized
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Non-amortized: spot without amortize period, or fixed costs in current month
  const sgaNonAmortized = queryOne(
    `SELECT COALESCE(SUM(amount),0) as total FROM sga_expenses
     WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL
     AND (amortize_start IS NULL OR amortize_start = '')`,
    [monthStart, monthEnd]
  );

  // Amortized: spread across months
  const sgaAmortized = queryAll(
    `SELECT amount, amortize_start, amortize_end FROM sga_expenses
     WHERE deleted_at IS NULL AND amortize_start IS NOT NULL AND amortize_start != ''
     AND amortize_start <= ? AND amortize_end >= ?`,
    [currentMonth, currentMonth]
  );

  let monthlySgaAmortized = 0;
  for (const row of sgaAmortized) {
    const start = row.amortize_start as string;
    const end = row.amortize_end as string;
    const months = countMonths(start, end);
    if (months > 0) monthlySgaAmortized += Math.floor((row.amount as number) / months);
  }

  const monthlyRevenue = (rev?.total as number) || 0;
  const monthlyPurchase = (pur?.total as number) || 0;
  const monthlySga = ((sgaNonAmortized?.total as number) || 0) + monthlySgaAmortized;
  const grossProfit = monthlyRevenue - monthlyPurchase;
  const grossMargin = monthlyRevenue > 0 ? Math.round((grossProfit / monthlyRevenue) * 1000) / 10 : 0;
  const operatingProfit = grossProfit - monthlySga;
  const operatingMargin = monthlyRevenue > 0 ? Math.round((operatingProfit / monthlyRevenue) * 1000) / 10 : 0;
  res.json({ success: true, data: {
    monthly_revenue: monthlyRevenue,
    monthly_purchase: monthlyPurchase,
    monthly_sga: monthlySga,
    gross_profit: grossProfit,
    monthly_gross_margin: grossMargin,
    operating_profit: operatingProfit,
    operating_margin: operatingMargin,
    active_projects: (activeProjects?.c as number) || 0,
    active_opportunities: (activeOpps?.c as number) || 0,
  } });
});

router.get('/alerts', (_req, res) => {
  const alerts = queryAll(`SELECT id, gls_number, name, 'application_form' as alert_type, '申込書未提出' as message FROM projects WHERE application_form = 0 AND status IN ('tentative','confirmed') AND deleted_at IS NULL
    UNION ALL SELECT id, gls_number, name, 'upcoming_rehearsal' as alert_type, 'リハーサルが近づいています' as message FROM projects WHERE rehearsal_start IS NOT NULL AND rehearsal_start BETWEEN date('now') AND date('now', '+7 days') AND deleted_at IS NULL`);
  res.json({ success: true, data: alerts });
});

router.get('/recent-projects', (_req, res) => {
  const rows = queryAll(`SELECT p.*, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.deleted_at IS NULL AND (p.event_start BETWEEN date('now') AND date('now', '+7 days') OR p.rehearsal_start BETWEEN date('now') AND date('now', '+7 days')) ORDER BY COALESCE(p.event_start, p.rehearsal_start) LIMIT 10`);
  res.json({ success: true, data: rows });
});

// Weekly schedule: Mon-Sun, always showing future dates
router.get('/weekly-schedule', (_req, res) => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  // Start from today, go forward to fill 7 days (Mon-Sun, with past days of this week skipped to next week)
  const days: Array<{ date: string; dayLabel: string; events: unknown[] }> = [];
  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

  for (let i = 0; i < 7; i++) {
    // Calculate target day: Mon(1) to Sun(0)
    const targetDay = ((1 + i) % 7); // Mon=1, Tue=2, ..., Sun=0
    let daysToAdd = targetDay - dayOfWeek;
    if (daysToAdd <= 0) daysToAdd += 7; // Always future
    if (targetDay === dayOfWeek) daysToAdd = 0; // Today if it matches

    const d = new Date(now);
    d.setDate(d.getDate() + daysToAdd);
    const dateStr = d.toISOString().split('T')[0];

    // Get events for this date
    const projects = queryAll(
      `SELECT p.id, p.gls_number, p.name, p.status, 'event' as type
       FROM projects p WHERE p.deleted_at IS NULL
       AND (p.event_start <= ? AND p.event_end >= ? OR p.event_start = ?)`,
      [dateStr, dateStr, dateStr]
    );
    const rehearsals = queryAll(
      `SELECT p.id, p.gls_number, p.name, p.status, 'rehearsal' as type
       FROM projects p WHERE p.deleted_at IS NULL
       AND (p.rehearsal_start <= ? AND p.rehearsal_end >= ? OR p.rehearsal_start = ?)`,
      [dateStr, dateStr, dateStr]
    );
    const episodes = queryAll(
      `SELECT e.episode_code, e.recording_date, e.broadcast_date, p.gls_number, p.name as project_name
       FROM episodes e JOIN projects p ON p.id = e.project_id
       WHERE e.deleted_at IS NULL AND (e.recording_date = ? OR e.broadcast_date = ?)`,
      [dateStr, dateStr]
    );

    days.push({
      date: dateStr,
      dayLabel: dayLabels[d.getDay()],
      events: [...projects, ...rehearsals, ...episodes.map((ep: any) => ({
        ...ep,
        type: ep.recording_date === dateStr ? 'recording' : 'broadcast',
      }))],
    });
  }

  res.json({ success: true, data: days });
});

router.get('/monthly-chart', (_req, res) => {
  const months: Array<{ month: string; revenue: number; purchase: number; sga: number; gross_profit: number; operating_profit: number }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = `${ym}-01`;
    const monthEnd = `${ym}-31`;
    const rev = queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM revenues WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
    const pur = queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM purchases WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
    // Non-amortized SGA for this month
    const sgaNonAmortizedRow = queryOne(
      `SELECT COALESCE(SUM(amount),0) as total FROM sga_expenses
       WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL
       AND (amortize_start IS NULL OR amortize_start = '')`,
      [monthStart, monthEnd]
    );

    // Amortized SGA spread across this month
    const sgaAmortizedRows = queryAll(
      `SELECT amount, amortize_start, amortize_end FROM sga_expenses
       WHERE deleted_at IS NULL AND amortize_start IS NOT NULL AND amortize_start != ''
       AND amortize_start <= ? AND amortize_end >= ?`,
      [ym, ym]
    );

    let monthSgaAmortized = 0;
    for (const row of sgaAmortizedRows) {
      const s = row.amortize_start as string;
      const e = row.amortize_end as string;
      const m = countMonths(s, e);
      if (m > 0) monthSgaAmortized += Math.floor((row.amount as number) / m);
    }

    const revenue = (rev?.total as number) || 0;
    const purchase = (pur?.total as number) || 0;
    const sga = ((sgaNonAmortizedRow?.total as number) || 0) + monthSgaAmortized;
    const gross_profit = revenue - purchase;
    months.push({ month: ym, revenue, purchase, sga, gross_profit, operating_profit: gross_profit - sga });
  }
  res.json({ success: true, data: months });
});

router.get('/pipeline', (_req, res) => {
  const stages = queryAll(
    `SELECT stage, COUNT(*) as count, COALESCE(SUM(expected_amount),0) as total_amount
     FROM opportunities WHERE deleted_at IS NULL AND stage NOT IN ('e_lost','s_completed')
     GROUP BY stage ORDER BY CASE stage
       WHEN 'neta' THEN 1 WHEN 'd_hold' THEN 2 WHEN 'c_proposal' THEN 3
       WHEN 'b_verbal' THEN 4 WHEN 'a_won' THEN 5 END`
  );
  res.json({ success: true, data: stages });
});

export default router;
