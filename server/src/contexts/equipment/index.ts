import { Router } from 'express';
import equipmentRoutes from './routes/equipment.routes';
import excelRoutes from './routes/excel.routes';

export function createEquipmentRoutes(): Router {
  const router = Router();

  // ★ Excel/QR routes に /items/by-code/:code 等の specific path があるため先に登録
  router.use('/equipment', excelRoutes);
  router.use('/equipment', equipmentRoutes);

  return router;
}
