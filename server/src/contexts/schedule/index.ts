import { Router } from 'express';
import partnerScheduleRoutes from './routes/partner-schedule.routes';
import personalRoutes from './routes/personal.routes';
import googleOAuthRoutes from './routes/google-oauth.routes';

// スケジュール context — カレンダーアプリ (/studio/*) の拡張。
//   /schedule/partner   — パートナー (従業員) スケジュール (代休/有給/出張 等の共有)
//   /schedule/personal  — マイカレンダー (個人予定・本人のみ)
//   /schedule/feeds     — Outlook/Google ICS 購読フィード (個人予定への一方向同期)
//   /schedule/google/*  — Google カレンダー OAuth 連携 (個人予定への一方向同期)

export { initIcsSyncPoller, shutdownIcsSyncPoller } from './services/ics-sync.service';
export { initGoogleSyncPoller, shutdownGoogleSyncPoller } from './services/google-calendar.service';

export function createScheduleRoutes(): Router {
  const router = Router();
  router.use('/schedule', partnerScheduleRoutes);
  router.use('/schedule', personalRoutes);
  router.use('/schedule', googleOAuthRoutes);
  return router;
}
