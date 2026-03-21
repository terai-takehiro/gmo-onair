import { Router } from 'express';
import { queryAll, queryOne } from '../db/connection';

const router = Router();

router.get('/kpi', (_req, res) => {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
  const rev = queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM revenues WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
  const pur = queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM purchases WHERE recognition_date BETWEEN ? AND ? AND deleted_at IS NULL`, [monthStart, monthEnd]);
  const activeProjects = queryOne(`SELECT COUNT(*) as c FROM projects WHERE status IN ('tentative','confirmed') AND deleted_at IS NULL`);
  const activeOpps = queryOne(`SELECT COUNT(*) as c FROM opportunities WHERE stage IN ('lead','proposal','negotiation') AND deleted_at IS NULL`);
  const monthlyRevenue = (rev?.total as number) || 0;
  const monthlyPurchase = (pur?.total as number) || 0;
  const grossMargin = monthlyRevenue > 0 ? Math.round(((monthlyRevenue - monthlyPurchase) / monthlyRevenue) * 1000) / 10 : 0;
  res.json({ success: true, data: { monthly_revenue: monthlyRevenue, monthly_gross_margin: grossMargin, active_projects: (activeProjects?.c as number) || 0, active_opportunities: (activeOpps?.c as number) || 0 } });
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

export default router;
