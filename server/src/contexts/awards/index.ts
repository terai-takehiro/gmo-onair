import { Router } from 'express';
import eventRoutes from './routes/events.routes';
import categoryRoutes from './routes/categories.routes';
import entryRoutes from './routes/entries.routes';
import imageRoutes from './routes/images.routes';
import cueRoutes from './routes/cues.routes';
import oneshotRoutes from './routes/oneshot.routes';

export function createAwardsRoutes(): Router {
  const router = Router();

  router.use('/awards', eventRoutes);
  router.use('/awards', categoryRoutes);
  router.use('/awards', entryRoutes);
  router.use('/awards', imageRoutes);
  router.use('/awards', cueRoutes);
  router.use('/awards', oneshotRoutes);

  return router;
}

export { initAwardsSocketIO } from './socket';
