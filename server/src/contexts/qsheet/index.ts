import { Router } from 'express';
import documentRoutes from './routes/documents.routes';
import stageTemplateRoutes from './routes/stage-templates.routes';
import pdfRoutes from './routes/pdf.routes';
import uploadRoutes from './routes/upload.routes';
import publicAudioRoutes from './routes/public-audio.routes';
import runsRoutes from './routes/runs.routes';
import audioShareRoutes from './routes/audio-share.routes';
import scopesRoutes from './routes/scopes.routes';
import programsRoutes from './routes/programs.routes';
import journeyMarksRoutes from './routes/journey-marks.routes';
import deviceSettingsRoutes from './routes/device-settings.routes';
import schedulesRoutes from './routes/schedules.routes';
import scheduleColumnsRoutes from './routes/schedule-columns.routes';
import scheduleItemsRoutes from './routes/schedule-items.routes';
import scheduleBreakdownRoutes from './routes/schedule-breakdown.routes';
import { templatesRouter as scheduleTemplatesRouter, applyRouter as scheduleApplyRouter } from './routes/schedule-templates.routes';
import scheduleExportRoutes from './routes/schedule-export.routes';
import scheduleReverseRoutes from './routes/schedule-reverse.routes';
import aiProposalsRoutes from './routes/ai-proposals.routes';
import aiGenerateRoutes from './routes/ai-generate.routes';
import aiChatRoutes from './routes/ai-chat.routes';
import aiKnowledgeRoutes from './routes/ai-knowledge.routes';
import excelRoutes from './routes/excel.routes';

export function createQsheetRoutes(): Router {
  const router = Router();

  // 認証なしの公開ルート (音声サポート画面用) は documentRoutes より前に登録
  router.use('/qsheet', publicAudioRoutes);

  router.use('/qsheet', documentRoutes);
  router.use('/qsheet/stage-templates', stageTemplateRoutes);
  router.use('/qsheet', pdfRoutes);
  router.use('/qsheet', uploadRoutes);
  router.use('/qsheet', runsRoutes);   // 本番の実尺 (qsheet_cue_actuals)
  // 音声サポート共有URLの発行・再発行・失効 (認証必須)
  router.use('/qsheet', audioShareRoutes);
  // トップ（案件を選ぶ）・制作のジャーニー（段3・03-app-structure-impl.md §6）
  router.use('/qsheet', scopesRoutes);
  router.use('/qsheet', journeyMarksRoutes);
  // 番組（マニュアル・案件管理外）。制作技術支援トップの2つ目の選び方（2026-08-22）
  router.use('/qsheet', programsRoutes);
  // 収録設定・配信設定（機器設定）。案件単位（:ownerKey）で、文書 (documentRoutes) とは別の入れ物
  router.use('/qsheet/production', deviceSettingsRoutes);

  // スケジュール表（段4・04-schedule-impl.md §4）
  router.use('/qsheet', schedulesRoutes);
  router.use('/qsheet', scheduleColumnsRoutes);
  router.use('/qsheet', scheduleItemsRoutes);
  router.use('/qsheet', scheduleBreakdownRoutes);
  router.use('/qsheet', scheduleTemplatesRouter);
  router.use('/qsheet', scheduleApplyRouter);
  router.use('/qsheet', scheduleExportRoutes);
  router.use('/qsheet', scheduleReverseRoutes);

  // AI 提案の受け止め（段7・07-ai-proposals-impl.md）＋ 生成4機能（段8・04-ai.md）
  router.use('/qsheet', aiProposalsRoutes);
  router.use('/qsheet', aiGenerateRoutes);   // ①②③（生成→提案として保存）
  router.use('/qsheet', aiChatRoutes);       // ④壁打ち（本人のみ）
  router.use('/qsheet', aiKnowledgeRoutes);  // ナレッジ（段9・04-ai.md §6-3）

  // 台本 Excel 入出力（段6・03-excel.md）。08（機器設定の Excel）とは別物・互いを import しない
  router.use('/qsheet', excelRoutes);

  return router;
}
