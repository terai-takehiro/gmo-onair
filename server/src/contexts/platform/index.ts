import { Router } from 'express';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import dashboardRoutes from './routes/dashboard.routes';
import searchRoutes from './routes/search.routes';
import dataViewerRoutes from './routes/data-viewer.routes';
import lookupRoutes from './routes/lookup.routes';
import backupRoutes from './routes/backup.routes';

export function createPlatformRoutes(): Router {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use('/dashboard', dashboardRoutes);
  router.use('/users', usersRoutes);
  router.use('/search', searchRoutes);
  router.use('/data-viewer', dataViewerRoutes);
  router.use('/lookup', lookupRoutes);
  router.use(backupRoutes); // /admin/backup.xlsx

  return router;
}
