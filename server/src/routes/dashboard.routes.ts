import { Router } from 'express';
import { queryAll, queryOne, execute } from '../db/connection';

const router = Router();

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
  const sga = queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM sga_expenses WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
  const monthlyRevenue = (rev?.total as number) || 0;
  const monthlyPurchase = (pur?.total as number) || 0;
  const monthlySga = (sga?.total as number) || 0;
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
    const sgaRow = queryOne(`SELECT COALESCE(SUM(amount),0) as total FROM sga_expenses WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
    const revenue = (rev?.total as number) || 0;
    const purchase = (pur?.total as number) || 0;
    const sga = (sgaRow?.total as number) || 0;
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
