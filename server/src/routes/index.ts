import { Router } from 'express';
import { createPlatformRoutes } from '../contexts/platform';
import { createSalesRoutes } from '../contexts/sales';
import { createProductionRoutes } from '../contexts/production';
import { createFinanceRoutes } from '../contexts/finance';
import { createAssetRoutes } from '../contexts/asset';

export function createRoutes(): Router {
  const router = Router();

  // 各コンテキストのルートを登録
  router.use(createPlatformRoutes());
  router.use(createSalesRoutes());
  router.use(createProductionRoutes());
  router.use(createFinanceRoutes());
  router.use(createAssetRoutes());

  return router;
}
