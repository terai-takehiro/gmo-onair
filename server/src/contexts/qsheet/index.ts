import { Router } from 'express';
import documentRoutes from './routes/documents.routes';
import stageTemplateRoutes from './routes/stage-templates.routes';
import pdfRoutes from './routes/pdf.routes';
import uploadRoutes from './routes/upload.routes';
import publicAudioRoutes from './routes/public-audio.routes';
import runsRoutes from './routes/runs.routes';

export function createQsheetRoutes(): Router {
  const router = Router();

  // 認証なしの公開ルート (音声サポート画面用) は documentRoutes より前に登録
  router.use('/qsheet', publicAudioRoutes);

  router.use('/qsheet', documentRoutes);
  router.use('/qsheet/stage-templates', stageTemplateRoutes);
  router.use('/qsheet', pdfRoutes);
  router.use('/qsheet', uploadRoutes);
  router.use('/qsheet', runsRoutes);   // 本番の実尺 (qsheet_cue_actuals)

  return router;
}
