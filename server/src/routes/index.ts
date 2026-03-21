import { Router } from 'express';
import authRoutes from './auth.routes';
import dashboardRoutes from './dashboard.routes';
import customersRoutes from './customers.routes';
import vendorsRoutes from './vendors.routes';
import partnersRoutes from './partners.routes';
import usersRoutes from './users.routes';
import opportunitiesRoutes from './opportunities.routes';
import projectsRoutes from './projects.routes';
import revenuesRoutes from './revenues.routes';
import purchasesRoutes from './purchases.routes';
import calendarRoutes from './calendar.routes';

export function createRoutes(): Router {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use('/dashboard', dashboardRoutes);
  router.use('/customers', customersRoutes);
  router.use('/vendors', vendorsRoutes);
  router.use('/partners', partnersRoutes);
  router.use('/users', usersRoutes);
  router.use('/opportunities', opportunitiesRoutes);
  router.use('/projects', projectsRoutes);
  router.use('/revenues', revenuesRoutes);
  router.use('/purchases', purchasesRoutes);
  router.use('/calendar', calendarRoutes);

  return router;
}
