import { Router } from 'express';
import revenuesRoutes from './routes/revenues.routes';
import purchasesRoutes from './routes/purchases.routes';
import sgaRoutes from './routes/sga.routes';
import vendorsRoutes from './routes/vendors.routes';
import partnersRoutes from './routes/partners.routes';
import xpointRoutes from './routes/xpoint.routes';
import { createFinanceExcelRouter } from './routes/excel.routes';
import { getMonthlySummary } from './services/monthly-summary.service';
import { requireAuth, requirePermission } from '../../shared/middleware/auth';

export function createFinanceRoutes(): Router {
  const router = Router();

  // 月次損益サマリー (optional project_id 指定で案件別集計)。
  // 集計ロジックは monthly-summary.service.ts に集約 (MCP サーバーと共用)。
  router.get('/monthly-summary', requireAuth, requirePermission('budget'), async (req, res) => {
    const data = await getMonthlySummary({
      month: req.query.month as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      projectId: req.query.project_id as string | undefined,
    });
    res.json({ success: true, data });
  });

  router.use('/revenues', revenuesRoutes);
  router.use('/purchases', purchasesRoutes);
  router.use('/sga', sgaRoutes);
  router.use('/vendors', vendorsRoutes);
  router.use('/partners', partnersRoutes);
  router.use('/xpoint', xpointRoutes);
  router.use(createFinanceExcelRouter()); // /revenues/excel/*, /purchases/excel/*, /sga-expenses/excel/*

  return router;
}
