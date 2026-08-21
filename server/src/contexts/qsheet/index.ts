import { Router } from 'express';
import documentRoutes from './routes/documents.routes';
import stageTemplateRoutes from './routes/stage-templates.routes';
import pdfRoutes from './routes/pdf.routes';
import uploadRoutes from './routes/upload.routes';
import publicAudioRoutes from './routes/public-audio.routes';
import scopesRoutes from './routes/scopes.routes';
import journeyMarksRoutes from './routes/journey-marks.routes';

export function createQsheetRoutes(): Router {
  const router = Router();

  // 認証なしの公開ルート (音声サポート画面用) は documentRoutes より前に登録
  router.use('/qsheet', publicAudioRoutes);

  router.use('/qsheet', documentRoutes);
  router.use('/qsheet/stage-templates', stageTemplateRoutes);
  router.use('/qsheet', pdfRoutes);
  router.use('/qsheet', uploadRoutes);
  // トップ（案件を選ぶ）・制作のジャーニー（段3・03-app-structure-impl.md §6）
  router.use('/qsheet', scopesRoutes);
  router.use('/qsheet', journeyMarksRoutes);

  return router;
}
