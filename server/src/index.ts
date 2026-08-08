import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { initDb } from './shared/db/connection';
import { runMigrations } from './shared/db/migrate';
import { seed } from './shared/db/seed';
import { seedSubApps } from './shared/db/seed-subapps';
import { seedTasks } from './shared/db/seed-tasks';
import { ensureStaffPermissions } from './shared/db/ensure-permissions';
import { initSocketIO, shutdownSocketIO } from './shared/socket';
import { initQsheetSocketIO } from './contexts/qsheet/socket';
import { initProjectCollabSocketIO } from './contexts/sales/collab-socket';
import { initLiveopsSocketIO, initLiveopsServices } from './contexts/liveops';
import { initAwardsSocketIO } from './contexts/awards';
import { initQuizSocketIO, initInteractivePoller } from './contexts/quiz';
import { initIcsSyncPoller, shutdownIcsSyncPoller, initGoogleSyncPoller, shutdownGoogleSyncPoller, initMsSyncPoller, shutdownMsSyncPoller } from './contexts/schedule';

async function main() {
  await initDb();
  console.log('[startup] DB connected');
  await runMigrations();
  console.log('[startup] Migrations complete');

  // 毎回起動時に権限を保全 (idempotent)
  await ensureStaffPermissions();

  // 本番はデフォルトで seed しない。RUN_SEED_ON_STARTUP=true の時のみ明示実行。
  // 開発/検証は従来どおりデフォルト seed 実行（SKIP_SEED=true でスキップ可能）。
  const isProduction = config.nodeEnv === 'production';
  const shouldRunSeed = isProduction
    ? process.env.RUN_SEED_ON_STARTUP === 'true'
    : process.env.SKIP_SEED !== 'true';

  if (shouldRunSeed) {
    await seed();
    console.log('[startup] Seed complete');
    await seedSubApps().catch((err) => {
      console.warn('[seed-subapps] warn:', err?.message ?? err);
      if (err?.stack) console.warn('[seed-subapps] stack:', err.stack);
    });
    await seedTasks().catch((err) => {
      console.warn('[seed-tasks] warn:', err?.message ?? err);
    });
  } else {
    // seed を行わない場合でも、マスター管理者だけは必ず作成
    const { ensureAdminUser } = await import('./shared/db/seed-admin');
    await ensureAdminUser();
    console.log('[startup] Seed skipped — admin user ensured');
  }

  // お金のルール (v4 設定 ⑤) を先に読む。**税の端数の丸め方がここで決まる**ので、
  // 読む前に帳票を出されると既定 (切り捨て) のまま出てしまう
  const { primeMoneyRules } = await import('./contexts/finance/services/money-rules.service');
  await primeMoneyRules().catch((e) =>
    console.warn('[startup] primeMoneyRules failed:', (e as Error).message)
  );

  // 定時実行（v4 設定 ⑦）。**その日ぶんの記録があれば何もしない**ので、
  // デプロイのたびに再起動しても督促が二重に出ることはない
  const { startScheduler } = await import('./contexts/platform/services/scheduler.service');
  startScheduler();

  const app = createApp();
  const httpServer = http.createServer(app);

  // Initialize liveops background services (Teams webhook subscriptions)
  await initLiveopsServices().catch((e) =>
    console.warn('[startup] initLiveopsServices failed:', (e as Error).message)
  );

  // Socket.IO for qsheet sync + liveops timer + awards + quiz
  const io = initSocketIO(httpServer);
  initQsheetSocketIO(io);
  initProjectCollabSocketIO(io);
  initLiveopsSocketIO(io);
  initAwardsSocketIO(io);
  initQuizSocketIO(io);
  initInteractivePoller(io);  // v2.9.24: Interactive 投票数を CG にリアルタイム反映
  initIcsSyncPoller();        // v2.9.186: マイカレンダーの ICS 購読同期 (Outlook/Google → ONAiR)
  initGoogleSyncPoller();     // v2.9.190: マイカレンダーの Google OAuth 同期 (Google → ONAiR)
  initMsSyncPoller();         // v2.9.191: マイカレンダーの Outlook OAuth 同期 (Microsoft → ONAiR)
  app.set('io', io);  // quiz.routes.ts等からSocket.IOにアクセスするため

  httpServer.listen(config.port, () => {
    console.log(`GMO ONAiR API running on http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Socket.IO: enabled (qsheet sync, project collab, liveops timer, awards, quiz)`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    shutdownSocketIO();
    shutdownIcsSyncPoller();
    shutdownGoogleSyncPoller();
    shutdownMsSyncPoller();
    httpServer.close();
  });
}

// Prevent unhandled promise rejections from crashing the process
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

main().catch(console.error);
