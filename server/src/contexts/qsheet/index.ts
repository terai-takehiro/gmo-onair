import { Router } from 'express';
import documentRoutes from './routes/documents.routes';
import stageTemplateRoutes from './routes/stage-templates.routes';
import pdfRoutes from './routes/pdf.routes';
import uploadRoutes from './routes/upload.routes';

export function createQsheetRoutes(): Router {
  const router = Router();

  router.use('/qsheet', documentRoutes);
  router.use('/qsheet/stage-templates', stageTemplateRoutes);
  router.use('/qsheet', pdfRoutes);
  router.use('/qsheet', uploadRoutes);

  return router;
}
