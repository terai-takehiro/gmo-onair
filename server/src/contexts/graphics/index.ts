import { Router } from 'express';
import publicRoutes from './routes/public.routes';
import imagesRoutes from './routes/images.routes';
import projectsRoutes from './routes/projects.routes';
import pagesRoutes from './routes/pages.routes';
import requestsRoutes from './routes/requests.routes';
import rosterRoutes from './routes/roster.routes';
import templatesRoutes from './routes/templates.routes';

export function createGraphicsRoutes(): Router {
  const router = Router();

  // 公開エンドポイント（出力URL・写真の静的配信）を**最初に**マウント。後続の auth 付き
  // router の `router.use(requireAuth, ...)` は router 内の全パスで発火するため、
  // public path が auth に蹴られないようここで先回り解決する（awards と同じ理由）。
  // images.routes.ts はアップロード自体（POST /pages/:id/photo）は requireAuth 付きだが、
  // 静的配信（GET /images/*）は認証なしのため、同じ理由でここに置く。
  router.use('/graphics', publicRoutes);
  router.use('/graphics', imagesRoutes);

  router.use('/graphics', projectsRoutes);
  router.use('/graphics', pagesRoutes);
  router.use('/graphics', requestsRoutes);
  router.use('/graphics', rosterRoutes);
  router.use('/graphics', templatesRoutes);

  return router;
}

export { initGraphicsSocketIO } from './socket';
