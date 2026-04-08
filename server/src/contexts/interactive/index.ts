import { Router } from 'express';
import eventRoutes from './routes/events.routes';
import stampRoutes from './routes/stamps.routes';
import overlayRoutes from './routes/overlays.routes';
import audienceRoutes from './routes/audience.routes';

export function createInteractiveRoutes(): Router {
  const router = Router();
  router.use('/interactive/events', eventRoutes);
  router.use('/interactive/stamps', stampRoutes);
  router.use('/interactive/overlays', overlayRoutes);
  router.use('/interactive/audience', audienceRoutes);
  return router;
}
