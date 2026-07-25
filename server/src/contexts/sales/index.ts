import { Router } from 'express';
import projectsRoutes from './routes/projects.routes';
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

  router.use('/project-groups', projectGroupsRoutes);
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
