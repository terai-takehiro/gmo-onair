import { Router } from 'express';
import publicRoutes from './routes/quiz-public.routes';
import quizzesRoutes from './routes/quizzes.routes';

export function createQuizRoutes(): Router {
  const router = Router();
  // 公開 (output URL 用) を先にマウントして auth-blanket に蹴られないようにする
  router.use('/quiz', publicRoutes);
  router.use('/quiz', quizzesRoutes);
  return router;
}

export { initQuizSocketIO } from './socket';
export { initInteractivePoller, shutdownInteractivePoller, getPollerHeartbeat } from './services/interactive-poller.service';
