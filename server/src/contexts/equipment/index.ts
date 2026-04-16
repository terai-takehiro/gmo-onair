import { Router } from 'express';
import equipmentRoutes from './routes/equipment.routes';
import excelRoutes from './routes/excel.routes';
import manufacturersRoutes from './routes/manufacturers.routes';

export function createEquipmentRoutes(): Router {
  const router = Router();

  router.use('/equipment', excelRoutes);
  router.use('/equipment/manufacturers', manufacturersRoutes);
  router.use('/equipment', equipmentRoutes);

  return router;
}
