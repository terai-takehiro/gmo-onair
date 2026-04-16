import { Router } from 'express';
import eventRoutes from './routes/events.routes';
import stampRoutes from './routes/stamps.routes';
import channelRoutes from './routes/channels.routes';
import quizRoutes from './routes/quiz.routes';
import scalingRoutes from './routes/scaling.routes';
import overlayRoutes from './routes/overlays.routes';
import audienceRoutes from './routes/audience.routes';

export function createInteractiveRoutes(): Router {
  const router = Router();

  // ★ audience を最初に登録（認証不要 — 広域マッチより先に処理）
  router.use('/interactive/audience', audienceRoutes);

  // 管理者API（認証必須）
  router.use('/interactive/events', eventRoutes);
  router.use('/interactive/stamps', stampRoutes);
  router.use('/interactive', channelRoutes);  // /interactive/events/:id/channels, /interactive/channels/:id
  router.use('/interactive', quizRoutes);     // /interactive/events/:id/questions, /interactive/questions/:id/*
  router.use('/interactive/scaling', scalingRoutes);
  router.use('/interactive/overlays', overlayRoutes);

  return router;
}
