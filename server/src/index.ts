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
import { initLiveopsSocketIO, initLiveopsServices } from './contexts/liveops';
import { initAwardsSocketIO } from './contexts/awards';
import { initQuizSocketIO } from './contexts/quiz';

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

  const app = createApp();
  const httpServer = http.createServer(app);

  // Initialize liveops background services (Teams webhook subscriptions)
  await initLiveopsServices().catch((e) =>
    console.warn('[startup] initLiveopsServices failed:', (e as Error).message)
  );

  // Socket.IO for qsheet sync + liveops timer + awards + quiz
  const io = initSocketIO(httpServer);
  initQsheetSocketIO(io);
  initLiveopsSocketIO(io);
  initAwardsSocketIO(io);
  initQuizSocketIO(io);
  app.set('io', io);  // quiz.routes.ts等からSocket.IOにアクセスするため

  httpServer.listen(config.port, () => {
    console.log(`GMO ONAiR API running on http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Socket.IO: enabled (qsheet sync, liveops timer, awards, quiz)`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    shutdownSocketIO();
    httpServer.close();
  });
}

// Prevent unhandled promise rejections from crashing the process
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

main().catch(console.error);
