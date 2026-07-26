import { Router } from 'express';
import episodesRoutes from './routes/episodes.routes';
import episodeOrdersRoutes from './routes/episode-orders.routes';
import invoiceGroupsRoutes from './routes/invoice-groups.routes';
import calendarRoutes from './routes/calendar.routes';
import reportsRoutes from './routes/reports.routes';
import studioRoutes from './routes/studio.routes';
import callSheetRoutes from './routes/call-sheet.routes';

export function createProductionRoutes(): Router {
  const router = Router();

  // エピソード関連は /projects/:projectId/xxx のパスで動く
  router.use('/projects', episodesRoutes);
  router.use('/projects', episodeOrdersRoutes);
  router.use('/projects', invoiceGroupsRoutes);
  router.use('/calendar', calendarRoutes);
  router.use('/reports', reportsRoutes);
  router.use('/studios', studioRoutes);
  // 香盤表 (21章 28a): 当日の動きを1枚にする。案件の日程・予約・Qシート・機材から自動で組む
  router.use('/call-sheets', callSheetRoutes);

  return router;
}
