import { Router } from 'express';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import customersRoutes from './customers.routes';
import vendorsRoutes from './vendors.routes';
import partnersRoutes from './partners.routes';
import usersRoutes from './users.routes';
import opportunitiesRoutes from './opportunities.routes';
import projectsRoutes from './projects.routes';
import episodesRoutes from './episodes.routes';
import episodeOrdersRoutes from './episode-orders.routes';
import invoiceGroupsRoutes from './invoice-groups.routes';
import revenuesRoutes from './revenues.routes';
import purchasesRoutes from './purchases.routes';
import calendarRoutes from './calendar.routes';
import pricingRoutes from './pricing.routes';
import simulationsRoutes from './simulations.routes';
import projectGroupsRoutes from './project-groups.routes';
import reportsRoutes from './reports.routes';
import searchRoutes from './search.routes';
import dataViewerRoutes from './data-viewer.routes';

export function createRoutes(): Router {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use('/dashboard', dashboardRoutes);
  router.use('/customers', customersRoutes);
  router.use('/vendors', vendorsRoutes);
  router.use('/partners', partnersRoutes);
  router.use('/users', usersRoutes);
  router.use('/opportunities', opportunitiesRoutes);
  router.use('/projects', projectsRoutes);
  router.use('/projects', episodesRoutes);
  router.use('/projects', episodeOrdersRoutes);
  router.use('/projects', invoiceGroupsRoutes);
  router.use('/revenues', revenuesRoutes);
  router.use('/purchases', purchasesRoutes);
  router.use('/calendar', calendarRoutes);
  router.use('/pricing', pricingRoutes);
  router.use('/opportunities', simulationsRoutes);
  router.use('/project-groups', projectGroupsRoutes);
  router.use('/reports', reportsRoutes);
  router.use('/search', searchRoutes);
  router.use('/data-viewer', dataViewerRoutes);

  return router;
}
