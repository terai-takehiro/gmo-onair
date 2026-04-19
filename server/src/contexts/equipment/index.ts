import { Router } from 'express';
import equipmentRoutes from './routes/equipment.routes';
import excelRoutes from './routes/excel.routes';
import manufacturersRoutes from './routes/manufacturers.routes';
import colorsRoutes from './routes/colors.routes';

export function createEquipmentRoutes(): Router {
  const router = Router();

  router.use('/equipment', excelRoutes);
  router.use('/equipment/manufacturers', manufacturersRoutes);
  router.use('/equipment/colors', colorsRoutes);
  router.use('/equipment', equipmentRoutes);

  return router;
}
