import { Router } from 'express';
import revenuesRoutes from './routes/revenues.routes';
import purchasesRoutes from './routes/purchases.routes';
import sgaRoutes from './routes/sga.routes';
import vendorsRoutes from './routes/vendors.routes';
import partnersRoutes from './routes/partners.routes';
import { createFinanceExcelRouter } from './routes/excel.routes';

export function createFinanceRoutes(): Router {
  const router = Router();

  router.use('/revenues', revenuesRoutes);
  router.use('/purchases', purchasesRoutes);
  router.use('/sga', sgaRoutes);
  router.use('/vendors', vendorsRoutes);
  router.use('/partners', partnersRoutes);
  router.use(createFinanceExcelRouter()); // /revenues/excel/*, /purchases/excel/*, /sga-expenses/excel/*

  return router;
}
