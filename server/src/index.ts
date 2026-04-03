import { createApp } from './app';
import { config } from './config';
import { initDb } from './shared/db/connection';
import { runMigrations } from './shared/db/migrate';
import { seed } from './shared/db/seed';

async function main() {
  await initDb();
  await runMigrations();
  await seed();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`GMO ONAiR API running on http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
  });
}

// Prevent unhandled promise rejections from crashing the process
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

main().catch(console.error);
