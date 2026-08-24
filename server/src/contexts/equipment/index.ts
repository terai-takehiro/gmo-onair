import { Router } from 'express';
import equipmentRoutes from './routes/equipment.routes';
import excelRoutes from './routes/excel.routes';
import manufacturersRoutes from './routes/manufacturers.routes';
import colorsRoutes from './routes/colors.routes';
import cablesRoutes from './routes/cables.routes';
import connectorsRoutes from './routes/connectors.routes';
import rentalCatalogRoutes from './routes/rental-catalog.routes';

export function createEquipmentRoutes(): Router {
  const router = Router();

  router.use('/equipment', excelRoutes);
  router.use('/equipment/manufacturers', manufacturersRoutes);
  router.use('/equipment/colors', colorsRoutes);
  router.use('/equipment/cables', cablesRoutes);
  router.use('/equipment/connectors', connectorsRoutes);
  // レンタル機材検索（検索・詳細・取得状況のみ。予約は制作技術支援側のまま）
  router.use('/equipment/rental-catalog', rentalCatalogRoutes);
  router.use('/equipment', equipmentRoutes);

  return router;
}
