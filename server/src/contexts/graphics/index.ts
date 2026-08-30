import { Router } from 'express';
import publicRoutes from './routes/public.routes';
import projectsRoutes from './routes/projects.routes';
import pagesRoutes from './routes/pages.routes';

export function createGraphicsRoutes(): Router {
  const router = Router();

  // 公開エンドポイント（出力URL）を**最初に**マウント。後続の auth 付き router の
  // `router.use(requireAuth, ...)` は router 内の全パスで発火するため、
  // public path が auth に蹴られないようここで先回り解決する（awards と同じ理由）。
  router.use('/graphics', publicRoutes);

  router.use('/graphics', projectsRoutes);
  router.use('/graphics', pagesRoutes);

  return router;
}

export { initGraphicsSocketIO } from './socket';
