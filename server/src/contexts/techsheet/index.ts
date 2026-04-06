import { Router } from 'express';
import documentRoutes from './routes/documents.routes';

export function createTechsheetRoutes(): Router {
  const router = Router();
  router.use('/techsheet', documentRoutes);
  return router;
}
