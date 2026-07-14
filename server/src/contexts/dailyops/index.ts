import { Router } from 'express';
import reportsRoutes from './routes/reports.routes';

// 日常業務アプリ (dailyops) — AI エージェント (MCP) と人間が協働する
// 小さな業務メニュー (ウィークリー活動報告 / デイリーニュース報告 など) の受け皿。

export function createDailyopsRoutes(): Router {
  const router = Router();
  router.use('/dailyops', reportsRoutes);
  return router;
}
