import { Router } from 'express';
import partnerScheduleRoutes from './routes/partner-schedule.routes';
import personalRoutes from './routes/personal.routes';
import googleOAuthRoutes from './routes/google-oauth.routes';
import msOAuthRoutes from './routes/ms-oauth.routes';
import taskFeedRoutes from './routes/task-feed.routes';

// スケジュール context — カレンダーアプリ (/studio/*) の拡張。
//   /schedule/partner   — パートナー (従業員) スケジュール (代休/有給/出張 等の共有)
//   /schedule/personal  — マイカレンダー (個人予定・本人のみ)
//   /schedule/feeds     — Outlook/Google ICS 購読フィード (個人予定への一方向同期)
//   /schedule/google/*  — Google カレンダー OAuth 連携 (個人予定への一方向同期)
//   /schedule/ms/*      — Outlook (Microsoft 365) OAuth 連携 (個人予定への一方向同期)
//   /schedule/task-feeds/:token.ics — タスク期限の ICS 配信 (認証なし・個人トークン式)

export { initIcsSyncPoller, shutdownIcsSyncPoller } from './services/ics-sync.service';
export { initGoogleSyncPoller, shutdownGoogleSyncPoller } from './services/google-calendar.service';
export { initMsSyncPoller, shutdownMsSyncPoller } from './services/ms-calendar.service';

export function createScheduleRoutes(): Router {
  const router = Router();
  router.use('/schedule', partnerScheduleRoutes);
  router.use('/schedule', personalRoutes);
  router.use('/schedule', googleOAuthRoutes);
  router.use('/schedule', msOAuthRoutes);
  router.use('/schedule', taskFeedRoutes);
  return router;
}
