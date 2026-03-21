import { createApp } from './app';
import { config } from './config';
import { initDb } from './db/connection';
import { runMigrations } from './db/migrate';
import { seed } from './db/seed';

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

main().catch(console.error);
