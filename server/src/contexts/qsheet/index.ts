import { Router } from 'express';
import documentRoutes from './routes/documents.routes';
import stageTemplateRoutes from './routes/stage-templates.routes';
import pdfRoutes from './routes/pdf.routes';
import uploadRoutes from './routes/upload.routes';
import publicAudioRoutes from './routes/public-audio.routes';
import deviceSettingsRoutes from './routes/device-settings.routes';

export function createQsheetRoutes(): Router {
  const router = Router();

  // 認証なしの公開ルート (音声サポート画面用) は documentRoutes より前に登録
  router.use('/qsheet', publicAudioRoutes);

  router.use('/qsheet', documentRoutes);
  router.use('/qsheet/stage-templates', stageTemplateRoutes);
  router.use('/qsheet', pdfRoutes);
  router.use('/qsheet', uploadRoutes);
  // 収録設定・配信設定（機器設定）。案件単位（:ownerKey）で、文書 (documentRoutes) とは別の入れ物
  router.use('/qsheet/production', deviceSettingsRoutes);

  return router;
}
