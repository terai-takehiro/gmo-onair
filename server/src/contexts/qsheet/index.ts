import { Router } from 'express';
import documentRoutes from './routes/documents.routes';
import stageTemplateRoutes from './routes/stage-templates.routes';
import pdfRoutes from './routes/pdf.routes';
import uploadRoutes from './routes/upload.routes';
import publicAudioRoutes from './routes/public-audio.routes';
import runsRoutes from './routes/runs.routes';
import audioShareRoutes from './routes/audio-share.routes';
import scopesRoutes from './routes/scopes.routes';
import topRoutes from './routes/top.routes';
import programsRoutes from './routes/programs.routes';
import journeyMarksRoutes from './routes/journey-marks.routes';
import deviceSettingsRoutes from './routes/device-settings.routes';
import rentalRoutes from './routes/rental.routes';
import manualsRoutes from './routes/manuals.routes';
import manualPagesRoutes from './routes/manual-pages.routes';
import manualResolveRoutes from './routes/manual-resolve.routes';
import manualLockRoutes from './routes/manual-lock.routes';
import manualTemplatesRoutes from './routes/manual-templates.routes';
import venueLayoutsRoutes from './routes/venue-layouts.routes';
import venueFloorsRoutes from './routes/venue-floors.routes';
import schedulesRoutes from './routes/schedules.routes';
import scheduleColumnsRoutes from './routes/schedule-columns.routes';
import scheduleItemsRoutes from './routes/schedule-items.routes';
import scheduleBreakdownRoutes from './routes/schedule-breakdown.routes';
import { templatesRouter as scheduleTemplatesRouter, applyRouter as scheduleApplyRouter } from './routes/schedule-templates.routes';
import scheduleExportRoutes from './routes/schedule-export.routes';
import scheduleReverseRoutes from './routes/schedule-reverse.routes';
import scheduleRoomsRoutes from './routes/schedule-rooms.routes';
import scheduleBookingSuggestionsRoutes from './routes/schedule-booking-suggestions.routes';
import aiProposalsRoutes from './routes/ai-proposals.routes';
import aiGenerateRoutes from './routes/ai-generate.routes';
import aiChatRoutes from './routes/ai-chat.routes';
import aiKnowledgeRoutes from './routes/ai-knowledge.routes';
import excelRoutes from './routes/excel.routes';

export function createQsheetRoutes(prefix: string): Router {
  const router = Router();

  // 認証なしの公開ルート (音声サポート画面用) は documentRoutes より前に登録
  router.use(prefix, publicAudioRoutes);

  router.use(prefix, documentRoutes);
  router.use(`${prefix}/stage-templates`, stageTemplateRoutes);
  router.use(prefix, pdfRoutes);
  router.use(prefix, uploadRoutes);
  router.use(prefix, runsRoutes);   // 本番の実尺 (qsheet_cue_actuals)
  // 音声サポート共有URLの発行・再発行・失効 (認証必須)
  router.use(prefix, audioShareRoutes);
  // トップ（案件を選ぶ）・制作のジャーニー（段3・03-app-structure-impl.md §6）
  router.use(prefix, scopesRoutes);
  router.use(prefix, journeyMarksRoutes);
  // 制作技術支援トップ（/qsheet/top）の番組・イベント一覧（GLS案件＋ここだけの番組を1本化。2026-08-22）
  router.use(prefix, topRoutes);
  // 番組（マニュアル・案件管理外）。制作技術支援トップの2つ目の選び方（2026-08-22）
  router.use(prefix, programsRoutes);
  // 収録設定・配信設定（機器設定）。案件単位（:ownerKey）で、文書 (documentRoutes) とは別の入れ物
  router.use(`${prefix}/production`, deviceSettingsRoutes);
  // レンタル機材検索。カタログはowner不要の共通マスタ、予約リストは案件/番組単位（:ownerKey）
  router.use(`${prefix}/rental`, rentalRoutes);

  // 運営マニュアル（段A・production-manual.md）。差し込みブロックの resolve は段C・
  // 編集ロック／確定・版／ひな形・前回の冊子から複製は段E
  router.use(prefix, manualsRoutes);
  router.use(prefix, manualPagesRoutes);
  router.use(prefix, manualResolveRoutes);
  router.use(prefix, manualLockRoutes);
  router.use(prefix, manualTemplatesRoutes);

  // 会場図面（段A〜B・venue-layout.md）。会場・階・エリア・備品カタログは読み取り専用（段Fで書き込みを足す）
  router.use(prefix, venueLayoutsRoutes);
  router.use(prefix, venueFloorsRoutes);

  // スケジュール表（段4・04-schedule-impl.md §4）
  router.use(prefix, schedulesRoutes);
  router.use(prefix, scheduleColumnsRoutes);
  router.use(prefix, scheduleItemsRoutes);
  router.use(prefix, scheduleBreakdownRoutes);
  router.use(prefix, scheduleTemplatesRouter);
  router.use(prefix, scheduleApplyRouter);
  router.use(prefix, scheduleExportRoutes);
  router.use(prefix, scheduleReverseRoutes);
  router.use(prefix, scheduleRoomsRoutes);   // 会場列が結べる部屋（読み取りのみ・14-schedule-v2-plan.md）
  router.use(prefix, scheduleBookingSuggestionsRoutes);   // 予約から列を入れる（読み取りのみ・§3 B9）

  // AI 提案の受け止め（段7・07-ai-proposals-impl.md）＋ 生成4機能（段8・04-ai.md）
  router.use(prefix, aiProposalsRoutes);
  router.use(prefix, aiGenerateRoutes);   // ①②③（生成→提案として保存）
  router.use(prefix, aiChatRoutes);       // ④壁打ち（本人のみ）
  router.use(prefix, aiKnowledgeRoutes);  // ナレッジ（段9・04-ai.md §6-3）

  // 台本 Excel 入出力（段6・03-excel.md）。08（機器設定の Excel）とは別物・互いを import しない
  router.use(prefix, excelRoutes);

  return router;
}
