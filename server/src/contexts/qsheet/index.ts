import { Router } from 'express';
import documentRoutes from './routes/documents.routes';
import stageTemplateRoutes from './routes/stage-templates.routes';

export function createQsheetRoutes(): Router {
  const router = Router();

  router.use('/qsheet', documentRoutes);
  router.use('/qsheet/stage-templates', stageTemplateRoutes);

  return router;
}
