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

  // 月次損益サマリー (optional project_id 指定で案件別集計)
  router.get('/monthly-summary', requireAuth, requirePermission('budget'), async (req, res) => {
    const month = req.query.month as string; // YYYY-MM
    const projectId = req.query.project_id as string | undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ success: false, error: { message: 'month parameter required (YYYY-MM)' } });
      return;
    }
    // recognition_date は TEXT (YYYY-MM-DD) で保存されているため前方一致で月をフィルタ
    const monthPrefix = `${month}-%`;

    // 案件絞り込み時: 直接売上/仕入 + group_id による按分配分両方を集計
    // 販管費は案件紐付かないので project_id 指定時は除外 (0)
    if (projectId) {
      const [revDirectRow, revAllocRow, purDirectRow, purAllocRow] = await Promise.all([
        queryOne(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues
           WHERE deleted_at IS NULL AND status = 'confirmed' AND group_id IS NULL
           AND project_id = ? AND recognition_date LIKE ?`,
          [projectId, monthPrefix]
        ) as Promise<any>,
        queryOne(
          `SELECT COALESCE(SUM(ra.allocated_amount), 0) AS total FROM revenue_allocations ra
           JOIN revenues r ON r.id = ra.revenue_id AND r.deleted_at IS NULL AND r.status = 'confirmed'
           WHERE ra.project_id = ? AND r.recognition_date LIKE ?`,
          [projectId, monthPrefix]
        ) as Promise<any>,
        queryOne(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases
           WHERE deleted_at IS NULL AND group_id IS NULL
           AND project_id = ? AND recognition_date LIKE ?`,
          [projectId, monthPrefix]
        ) as Promise<any>,
        queryOne(
          `SELECT COALESCE(SUM(pa.allocated_amount), 0) AS total FROM purchase_allocations pa
           JOIN purchases p ON p.id = pa.purchase_id AND p.deleted_at IS NULL
           WHERE pa.project_id = ? AND p.recognition_date LIKE ?`,
          [projectId, monthPrefix]
        ) as Promise<any>,
      ]);
      const revenue_total = Number(revDirectRow?.total ?? 0) + Number(revAllocRow?.total ?? 0);
      const purchase_total = Number(purDirectRow?.total ?? 0) + Number(purAllocRow?.total ?? 0);
      const sga_total = 0; // 販管費は案件紐付けないため案件絞り込み時はゼロ
      const gross_profit = revenue_total - purchase_total;
      const operating_profit = gross_profit - sga_total;
      res.json({ success: true, data: { month, project_id: projectId, revenue_total, purchase_total, gross_profit, sga_total, operating_profit } });
      return;
    }

    // 案件絞り込みなし: 全体集計
    const [revRow, purRow, sgaRow] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues WHERE deleted_at IS NULL AND status = 'confirmed' AND group_id IS NULL AND recognition_date LIKE ?`,
        [monthPrefix]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases WHERE deleted_at IS NULL AND group_id IS NULL AND recognition_date LIKE ?`,
        [monthPrefix]
      ) as Promise<any>,
      queryOne(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM sga_expenses WHERE deleted_at IS NULL AND recognition_date LIKE ?`,
        [monthPrefix]
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
