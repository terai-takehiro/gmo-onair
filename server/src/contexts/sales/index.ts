import { Router } from 'express';
import projectsRoutes from './routes/projects.routes';
import estimatesRoutes from './routes/estimates.routes';
import billingRoutes from './routes/billing.routes';
import minutesRoutes from './routes/minutes.routes';
import projectMembersRoutes from './routes/project-members.routes';
import projectCollabRoutes from './routes/project-collab.routes';
import projectGroupsRoutes from './routes/project-groups.routes';
import simulationsRoutes from './routes/simulations.routes';
import customersRoutes from './routes/customers.routes';
import companiesRoutes from './routes/companies.routes';
import pricingRoutes from './routes/pricing.routes';
import activityLogsRoutes from './routes/activity-logs.routes';
import salesAnalyticsRoutes from './routes/sales-analytics.routes';
import keepReportRoutes from './routes/keep-report.routes';
import { createSalesExcelRouter } from './routes/excel.routes';

export function createSalesRoutes(): Router {
  const router = Router();

  // 案件をまたぐ見積・請求 (v4 ⑤)。案件ごとの `/projects/:id/estimates` とは
  // **別の接頭辞**にしてある (同じ下にぶら下げると `:id` に "billing" が入る)
  router.use('/billing', billingRoutes);
  router.use('/project-groups', projectGroupsRoutes);
  router.use('/projects/:projectId/estimates', estimatesRoutes);
  router.use('/projects/:projectId/minutes', minutesRoutes);
  router.use('/projects', projectsRoutes);
  router.use('/projects', projectMembersRoutes);
  router.use('/projects', projectCollabRoutes);
  router.use('/projects', simulationsRoutes);
  router.use('/customers', customersRoutes);
  router.use('/companies', companiesRoutes);
  router.use('/pricing', pricingRoutes);
  router.use('/activity-logs', activityLogsRoutes);
  router.use('/sales-analytics', salesAnalyticsRoutes);
  router.use('/keep', keepReportRoutes);
  router.use(createSalesExcelRouter()); // /customers/excel/* etc.

  return router;
}
