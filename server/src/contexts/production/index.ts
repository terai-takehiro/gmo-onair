import { Router } from 'express';
import episodesRoutes from './routes/episodes.routes';
import episodeOrdersRoutes from './routes/episode-orders.routes';
import invoiceGroupsRoutes from './routes/invoice-groups.routes';
import calendarRoutes from './routes/calendar.routes';
import reportsRoutes from './routes/reports.routes';
import studioRoutes from './routes/studio.routes';

export function createProductionRoutes(): Router {
  const router = Router();

  // エピソード関連は /projects/:projectId/xxx のパスで動く
  router.use('/projects', episodesRoutes);
  router.use('/projects', episodeOrdersRoutes);
  router.use('/projects', invoiceGroupsRoutes);
  router.use('/calendar', calendarRoutes);
  router.use('/reports', reportsRoutes);
  router.use('/studios', studioRoutes);

  return router;
}
