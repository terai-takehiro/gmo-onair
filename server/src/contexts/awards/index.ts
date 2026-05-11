import { Router } from 'express';
import publicRoutes from './routes/public.routes';
import eventRoutes from './routes/events.routes';
import categoryRoutes from './routes/categories.routes';
import entryRoutes from './routes/entries.routes';
import imageRoutes from './routes/images.routes';
import cueRoutes from './routes/cues.routes';
import oneshotRoutes from './routes/oneshot.routes';
import interactiveLinkRoutes from './routes/interactive-link.routes';

export function createAwardsRoutes(): Router {
  const router = Router();

  // v2.8.96: 公開エンドポイントと images を**最初に**マウント。
  // 後続の auth-blanket 付き router (events/categories/entries/oneshot) の
  // `router.use([...], requireAuth, ...)` middleware が router 内のすべての一致パスで
  // 発火する仕様のため、public path も auth に蹴られないようここで先回り解決する。
  router.use('/awards', publicRoutes);
  router.use('/awards', imageRoutes);

  router.use('/awards', eventRoutes);
  router.use('/awards', categoryRoutes);
  router.use('/awards', entryRoutes);
  router.use('/awards', cueRoutes);
  router.use('/awards', oneshotRoutes);
  router.use('/awards', interactiveLinkRoutes);

  return router;
}

export { initAwardsSocketIO } from './socket';
