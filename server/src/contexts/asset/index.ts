import { Router } from 'express';
import { createEquipmentRoutes } from '../equipment';

export function createAssetRoutes(): Router {
  const router = Router();

  // Equipment management routes
  router.use(createEquipmentRoutes());

  return router;
}
