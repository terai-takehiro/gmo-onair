import { Router } from 'express';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import permissionRolesRoutes from './routes/permission-roles.routes';
import notificationsRoutes from './routes/notifications.routes';
import dashboardRoutes from './routes/dashboard.routes';
import searchRoutes from './routes/search.routes';
import dataViewerRoutes from './routes/data-viewer.routes';
import lookupRoutes from './routes/lookup.routes';
import backupRoutes from './routes/backup.routes';
import kessanRoutes from './routes/kessan.routes';
import integrationsRoutes from './routes/integrations.routes';

export function createPlatformRoutes(): Router {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use('/dashboard', dashboardRoutes);
  router.use('/users', usersRoutes);
  // `/users/roles` にすると `/users/:id` が `roles` を id として拾う
  router.use('/permission-roles', permissionRolesRoutes);
  router.use('/notifications', notificationsRoutes);
  router.use('/search', searchRoutes);
  router.use('/data-viewer', dataViewerRoutes);
  router.use('/lookup', lookupRoutes);
  router.use('/admin/kessan', kessanRoutes); // 決算インポート (検証DB専用)
  router.use('/admin', integrationsRoutes);  // /admin/integrations (つながっているかの一覧)
  router.use(backupRoutes); // /admin/backup.xlsx

  return router;
}
