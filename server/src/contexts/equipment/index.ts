import { Router } from 'express';
import equipmentRoutes from './routes/equipment.routes';

export function createEquipmentRoutes(): Router {
  const router = Router();

  router.use('/equipment', equipmentRoutes);

  return router;
}
