import { Router } from 'express';
import reportsRoutes from './routes/reports.routes';
import inviewRoutes from './routes/inview.routes';
import inboxRoutes from './routes/inbox.routes';
import financeDocOriginalRoutes from './routes/finance-doc-original.routes';
import securityCardRoutes from './routes/security-card.routes';
import tasksRoutes from './routes/tasks.routes';
import aiActionsRoutes from './routes/ai-actions.routes';

// 日常業務アプリ (dailyops) — AI エージェント (MCP) と人間が協働する
// 小さな業務メニュー (ウィークリー活動報告 / デイリーニュース報告 / 内覧会 来場予約 など) の受け皿。

export function createDailyopsRoutes(): Router {
  const router = Router();
  router.use('/dailyops', reportsRoutes);
  router.use('/dailyops', inviewRoutes);
  // 原本 (PDF/画像) は inboxRoutes より先に。`/finance-docs/upload` が `/finance-docs/:id` に
  // 吸われないようにする
  router.use('/dailyops', financeDocOriginalRoutes);
  router.use('/dailyops', inboxRoutes);
  router.use('/dailyops', securityCardRoutes);
  router.use('/dailyops', tasksRoutes);
  // AI 行動提案 (投入テキスト → ONAiR 全体への操作案)。
  // tasksRoutes とパスが重ならない (`/ai/actions/*`) ので順序は問わない
  router.use('/dailyops', aiActionsRoutes);
  return router;
}
