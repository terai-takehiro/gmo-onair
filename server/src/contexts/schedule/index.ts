import { Router } from 'express';
import partnerScheduleRoutes from './routes/partner-schedule.routes';
import personalRoutes from './routes/personal.routes';

// スケジュール context — カレンダーアプリ (/studio/*) の拡張。
//   /schedule/partner   — パートナー (従業員) スケジュール (代休/有給/出張 等の共有)
//   /schedule/personal  — マイカレンダー (個人予定・本人のみ)
//   /schedule/feeds     — Outlook/Google ICS 購読フィード (個人予定への一方向同期)

export { initIcsSyncPoller, shutdownIcsSyncPoller } from './services/ics-sync.service';

export function createScheduleRoutes(): Router {
  const router = Router();
  router.use('/schedule', partnerScheduleRoutes);
  router.use('/schedule', personalRoutes);
  return router;
}
