import { Router } from 'express';
import projectsRoutes from './routes/projects.routes';
import projectMembersRoutes from './routes/project-members.routes';
import projectCollabRoutes from './routes/project-collab.routes';
import projectHistoryRoutes from './routes/project-history.routes';
import projectGroupsRoutes from './routes/project-groups.routes';
import simulationsRoutes from './routes/simulations.routes';
import estimateRoutes from './routes/estimate.routes';
import customersRoutes from './routes/customers.routes';
import companiesRoutes from './routes/companies.routes';
import pricingRoutes from './routes/pricing.routes';
import activityLogsRoutes from './routes/activity-logs.routes';
import salesAnalyticsRoutes from './routes/sales-analytics.routes';
import keepReportRoutes from './routes/keep-report.routes';
import toolOutputsRoutes from './routes/tool-outputs.routes';
import { createSalesExcelRouter } from './routes/excel.routes';

export function createSalesRoutes(): Router {
  const router = Router();

  router.use('/project-groups', projectGroupsRoutes);
  // コメント / 変更の記録は projectsRoutes より**前**に置く
  // (/projects/comments/:id が /projects/:id 系のパターンに吸われないように)
  router.use('/projects', projectHistoryRoutes);
  router.use('/projects', projectsRoutes);
  router.use('/projects', projectMembersRoutes);
  router.use('/projects', projectCollabRoutes);
  router.use('/projects', simulationsRoutes);
  // 見積 (30章 37a)。sales 権限で開ける — 見積を作るのは営業で budget 権限は持たない
  router.use('/projects', estimateRoutes);
  router.use('/customers', customersRoutes);
  router.use('/companies', companiesRoutes);
  router.use('/pricing', pricingRoutes);
  router.use('/activity-logs', activityLogsRoutes);
  router.use('/sales-analytics', salesAnalyticsRoutes);
  router.use('/keep', keepReportRoutes);
  // 現場の道具の成果物 (§4.14): /tool-outputs
  // **パス付きでマウントする**。パス無しにすると、このルーターの
  // パス無し requirePermission('sales') が sales より後の全コンテキストに漏れる
  router.use('/tool-outputs', toolOutputsRoutes);
  router.use(createSalesExcelRouter()); // /customers/excel/* etc.

  return router;
}
