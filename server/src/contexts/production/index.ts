import { Router } from 'express';
import projectsRoutes from './routes/projects.routes';
import projectGroupsRoutes from './routes/project-groups.routes';
import episodesRoutes from './routes/episodes.routes';
import episodeOrdersRoutes from './routes/episode-orders.routes';
import invoiceGroupsRoutes from './routes/invoice-groups.routes';
import calendarRoutes from './routes/calendar.routes';
import reportsRoutes from './routes/reports.routes';

export function createProductionRoutes(): Router {
  const router = Router();

  router.use('/projects', projectsRoutes);
  router.use('/projects', episodesRoutes);
  router.use('/projects', episodeOrdersRoutes);
  router.use('/projects', invoiceGroupsRoutes);
  router.use('/project-groups', projectGroupsRoutes);
  router.use('/calendar', calendarRoutes);
  router.use('/reports', reportsRoutes);

  return router;
}
