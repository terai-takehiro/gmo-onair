import { Router } from 'express';
import opportunitiesRoutes from './routes/opportunities.routes';
import simulationsRoutes from './routes/simulations.routes';
import customersRoutes from './routes/customers.routes';
import pricingRoutes from './routes/pricing.routes';

export function createSalesRoutes(): Router {
  const router = Router();

  router.use('/opportunities', opportunitiesRoutes);
  router.use('/opportunities', simulationsRoutes);
  router.use('/customers', customersRoutes);
  router.use('/pricing', pricingRoutes);

  return router;
}
