import { Router } from 'express';
import { createPlatformRoutes } from '../contexts/platform';
import { createSalesRoutes } from '../contexts/sales';
import { createProductionRoutes } from '../contexts/production';
import { createFinanceRoutes } from '../contexts/finance';
import { createAssetRoutes } from '../contexts/asset';
import { createEquipmentRoutes } from '../contexts/equipment';
import { createQsheetRoutes } from '../contexts/qsheet';
import { createInteractiveRoutes } from '../contexts/interactive';
import { createTechsheetRoutes } from '../contexts/techsheet';
import { createLiveopsRoutes } from '../contexts/liveops';
import { createAwardsRoutes } from '../contexts/awards';
import { createQuizRoutes } from '../contexts/quiz';
import { createTasksRoutes } from '../contexts/tasks';

export function createRoutes(): Router {
  const router = Router();

  // 各コンテキストのルートを登録
  router.use(createPlatformRoutes());
  router.use(createSalesRoutes());
  router.use(createProductionRoutes());
  router.use(createFinanceRoutes());
  router.use(createAssetRoutes());
  router.use(createEquipmentRoutes());
  router.use(createQsheetRoutes());
  router.use(createInteractiveRoutes());
  router.use(createTechsheetRoutes());
  router.use(createLiveopsRoutes());
  router.use(createAwardsRoutes());
  router.use(createQuizRoutes());
  router.use(createTasksRoutes());

  return router;
}
