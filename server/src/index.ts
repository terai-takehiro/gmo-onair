import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { initDb } from './shared/db/connection';
import { runMigrations } from './shared/db/migrate';
import { seed } from './shared/db/seed';
import { seedSubApps } from './shared/db/seed-subapps';
import { ensureStaffPermissions } from './shared/db/ensure-permissions';
import { initSocketIO, shutdownSocketIO } from './contexts/interactive/socket';
import { initQsheetSocketIO } from './contexts/qsheet/socket';
import { initLiveopsSocketIO } from './contexts/liveops';

async function main() {
  await initDb();
  console.log('[startup] DB connected');
  await runMigrations();
  console.log('[startup] Migrations complete');

  // 毎回起動時に権限を保全 (idempotent)
  await ensureStaffPermissions();

  // SKIP_SEED=true で本番環境のダミーデータ投入をスキップ
  if (process.env.SKIP_SEED !== 'true') {
    await seed();
    console.log('[startup] Seed complete');
    await seedSubApps().catch((err) => {
      console.warn('[seed-subapps] warn:', err?.message ?? err);
      if (err?.stack) console.warn('[seed-subapps] stack:', err.stack);
    });
  } else {
    // 本番: マスター管理者だけは必ず作成
    const { ensureAdminUser } = await import('./shared/db/seed-admin');
    await ensureAdminUser();
    console.log('[startup] Seed skipped (SKIP_SEED=true) — admin user ensured');
  }

  const app = createApp();
  const httpServer = http.createServer(app);

  // Socket.IO for interactive events + qsheet sync + liveops timer
  const io = initSocketIO(httpServer);
  initQsheetSocketIO(io);
  initLiveopsSocketIO(io);
  app.set('io', io);  // quiz.routes.ts等からSocket.IOにアクセスするため

  httpServer.listen(config.port, () => {
    console.log(`GMO ONAiR API running on http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Socket.IO: enabled (interactive events, qsheet sync, liveops timer)`);
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
