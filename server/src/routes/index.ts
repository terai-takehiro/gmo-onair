import { Router } from 'express';
import { createPlatformRoutes } from '../contexts/platform';
import { createSalesRoutes } from '../contexts/sales';
import { createProductionRoutes } from '../contexts/production';
import { createFinanceRoutes } from '../contexts/finance';
import { createGpmRoutes } from '../contexts/gpm';
import { createAssetRoutes } from '../contexts/asset';
import { createEquipmentRoutes } from '../contexts/equipment';
import { createQsheetRoutes } from '../contexts/qsheet';
import { createLiveopsRoutes } from '../contexts/liveops';
import { createTasksRoutes } from '../contexts/tasks';
import { createDailyopsRoutes } from '../contexts/dailyops';
import { createScheduleRoutes } from '../contexts/schedule';

export function createRoutes(): Router {
  const router = Router();

  // 各コンテキストのルートを登録
  router.use(createPlatformRoutes());
  router.use(createSalesRoutes());
  router.use(createProductionRoutes());
  router.use(createFinanceRoutes());
  router.use('/gpm', createGpmRoutes());   // プロジェクト管理 (migration 161)
  router.use(createAssetRoutes());
  router.use(createEquipmentRoutes());
  router.use(createQsheetRoutes());
  router.use(createLiveopsRoutes());
  // awards (リアルタイムCG) / quiz は廃止のため登録しない。中身は contexts/awards, contexts/quiz に残す
  router.use(createTasksRoutes());
  router.use(createDailyopsRoutes());
  router.use(createScheduleRoutes());

  return router;
}
