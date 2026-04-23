import { Router } from 'express';
import revenuesRoutes from './routes/revenues.routes';
import purchasesRoutes from './routes/purchases.routes';
import sgaRoutes from './routes/sga.routes';
import vendorsRoutes from './routes/vendors.routes';
import partnersRoutes from './routes/partners.routes';
import { createFinanceExcelRouter } from './routes/excel.routes';
import { queryOne } from '../../shared/db/connection';
import { requireAuth, requirePermission } from '../../shared/middleware/auth';

export function createFinanceRoutes(): Router {
  const router = Router();

  // 月次損益サマリー
  router.get('/monthly-summary', requireAuth, requirePermission('budget'), async (req, res) => {
    const month = req.query.month as string; // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ success: false, error: { message: 'month parameter required (YYYY-MM)' } });
      return;
    }
    const [revRow, purRow, sgaRow] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues WHERE deleted_at IS NULL AND status = 'confirmed' AND group_id IS NULL AND TO_CHAR(recognition_date, 'YYYY-MM') = ?`,
        [month]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases WHERE deleted_at IS NULL AND group_id IS NULL AND TO_CHAR(recognition_date, 'YYYY-MM') = ?`,
        [month]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM sga_expenses WHERE deleted_at IS NULL AND TO_CHAR(recognition_date, 'YYYY-MM') = ?`,
        [month]
      ) as Promise<any>,
    ]);
    const revenue_total = Number((revRow as any)?.total ?? 0);
    const purchase_total = Number((purRow as any)?.total ?? 0);
    const sga_total = Number((sgaRow as any)?.total ?? 0);
    const gross_profit = revenue_total - purchase_total;
    const operating_profit = gross_profit - sga_total;
    res.json({ success: true, data: { month, revenue_total, purchase_total, gross_profit, sga_total, operating_profit } });
  });

  router.use('/revenues', revenuesRoutes);
  router.use('/purchases', purchasesRoutes);
  router.use('/sga', sgaRoutes);
  router.use('/vendors', vendorsRoutes);
  router.use('/partners', partnersRoutes);
  router.use(createFinanceExcelRouter()); // /revenues/excel/*, /purchases/excel/*, /sga-expenses/excel/*

  return router;
}
