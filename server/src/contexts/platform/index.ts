import { Router } from 'express';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import dashboardRoutes from './routes/dashboard.routes';
import searchRoutes from './routes/search.routes';
import dataViewerRoutes from './routes/data-viewer.routes';
import lookupRoutes from './routes/lookup.routes';
import backupRoutes from './routes/backup.routes';
import kessanRoutes from './routes/kessan.routes';
import slackDigestRoutes from './routes/slack-digest.routes';
import aiStatusRoutes from './routes/ai-status.routes';

export function createPlatformRoutes(): Router {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use('/dashboard', dashboardRoutes);
  router.use('/users', usersRoutes);
  router.use('/search', searchRoutes);
  router.use('/data-viewer', dataViewerRoutes);
  router.use('/lookup', lookupRoutes);
  router.use('/admin/kessan', kessanRoutes); // 決算インポート (検証DB専用)
  router.use('/settings', slackDigestRoutes); // 朝の1通 (Slack) の配信設定
  router.use('/ai', aiStatusRoutes); // AI が使えるかどうか (認証のみ・全アプリから)
  router.use(backupRoutes); // /admin/backup.xlsx

  return router;
}
