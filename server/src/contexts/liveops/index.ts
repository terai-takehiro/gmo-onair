import { Router } from 'express';
import settingsRoutes from './routes/settings.routes';
import programsRoutes from './routes/programs.routes';
import proxyRoutes from './routes/proxy.routes';
import snapshotsRoutes from './routes/snapshots.routes';
import timersRoutes from './routes/timers.routes';

export function createLiveopsRoutes(): Router {
  const router = Router();

  router.use('/liveops/settings', settingsRoutes);
  router.use('/liveops/programs', programsRoutes);
  router.use('/liveops/proxy', proxyRoutes);
  router.use('/liveops/snapshots', snapshotsRoutes);
  router.use('/liveops/timers', timersRoutes);

  return router;
}

export { initLiveopsSocketIO } from './socket';
