import { Router } from 'express';
import reportsRoutes from './routes/reports.routes';
import inviewRoutes from './routes/inview.routes';
import inboxRoutes from './routes/inbox.routes';

// 日常業務アプリ (dailyops) — AI エージェント (MCP) と人間が協働する
// 小さな業務メニュー (ウィークリー活動報告 / デイリーニュース報告 / 内覧会 来場予約 など) の受け皿。

export function createDailyopsRoutes(): Router {
  const router = Router();
  router.use('/dailyops', reportsRoutes);
  router.use('/dailyops', inviewRoutes);
  router.use('/dailyops', inboxRoutes);
  return router;
}
