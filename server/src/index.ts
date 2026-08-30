import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { initDb } from './shared/db/connection';
import { runMigrations } from './shared/db/migrate';
import { seed } from './shared/db/seed';
import { seedSubApps } from './shared/db/seed-subapps';
import { seedTasks } from './shared/db/seed-tasks';
import { seedAwards } from './shared/db/seed-awards';
import { seedGraphics } from './shared/db/seed-graphics';
import { seedRental } from './shared/db/seed-rental';
import { ensureStaffPermissions } from './shared/db/ensure-permissions';
import { initSocketIO, shutdownSocketIO } from './shared/socket';
import { initQsheetSocketIO } from './contexts/qsheet/socket';
import { initProjectCollabSocketIO } from './contexts/sales/collab-socket';
import { initLiveopsSocketIO, initLiveopsServices } from './contexts/liveops';
import { initIcsSyncPoller, shutdownIcsSyncPoller, initGoogleSyncPoller, shutdownGoogleSyncPoller, initMsSyncPoller, shutdownMsSyncPoller } from './contexts/schedule';
import { initAwardsSocketIO } from './contexts/awards';
import { initGraphicsSocketIO } from './contexts/graphics';
import { initQuizSocketIO, initInteractivePoller, shutdownInteractivePoller } from './contexts/quiz';
// awards (リアルタイムCG) / quiz は「凍結」相当に戻した (2026-08-25)。Socket.IO・ポーラーも生かす
// (client-awards/CLAUDE.md 参照)

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
    await seedAwards().catch((err) => {
      console.warn('[seed-awards] warn:', err?.message ?? err);
    });
    await seedGraphics().catch((err) => {
      console.warn('[seed-graphics] warn:', err?.message ?? err);
    });
    // ⚠️ SKIP_RENTAL_SEED=true の環境（検証VPSの app_dev）では飛ばす。
    // rental_scraper_dev コンテナが実際のクロール結果を qsheet_rental_items へ
    // 同期するようになったため、ここでダミーの8件を先に入れてしまうと
    // 「見えている件数が実データかサンプルか」を画面から区別できなくなる
    // （実際に検証環境で「数件しか無い」という報告を受け、原因がこのサンプル
    // データだったと判明したため2026-08-22に追加）。ローカル開発（npm run dev /
    // npm run verify:up）ではこのフラグを立てていないので今までどおりサンプルが入る。
    if (process.env.SKIP_RENTAL_SEED === 'true') {
      console.log('[seed-rental] SKIP_RENTAL_SEED=true のためスキップ（rental_scraper_dev がクロール結果を同期する）');
    } else {
      await seedRental().catch((err) => {
        console.warn('[seed-rental] warn:', err?.message ?? err);
      });
    }
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

  // Socket.IO for qsheet sync + liveops timer
  const io = initSocketIO(httpServer);
  initQsheetSocketIO(io);
  initProjectCollabSocketIO(io);
  initLiveopsSocketIO(io);
  initAwardsSocketIO(io);
  initGraphicsSocketIO(io);
  initQuizSocketIO(io);
  initInteractivePoller(io);
  initIcsSyncPoller();        // v2.9.186: マイカレンダーの ICS 購読同期 (Outlook/Google → ONAiR)
  initGoogleSyncPoller();     // v2.9.190: マイカレンダーの Google OAuth 同期 (Google → ONAiR)
  initMsSyncPoller();         // v2.9.191: マイカレンダーの Outlook OAuth 同期 (Microsoft → ONAiR)
  app.set('io', io);  // quiz.routes.ts等からSocket.IOにアクセスするため

  httpServer.listen(config.port, () => {
    console.log(`GMO ONAiR API running on http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Socket.IO: enabled (qsheet sync, project collab, liveops timer)`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    shutdownSocketIO();
    shutdownInteractivePoller();
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
