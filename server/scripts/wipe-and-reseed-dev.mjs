#!/usr/bin/env node
/**
 * wipe-and-reseed-dev.mjs
 *
 * Truncates all public-schema tables (CASCADE) in the DEV database so that
 * the next app_dev startup repopulates from scratch via seed() / seedSubApps()
 * / seedTasks() / seedExpansion().
 *
 * SAFETY:
 *   - Refuses to run if DB_NAME / DATABASE_URL looks like production
 *   - Requires --yes flag confirmation
 *
 * Usage:
 *   docker exec -it gmo-onair-app_dev-1 node /app/server/scripts/wipe-and-reseed-dev.mjs --yes
 *   # then restart app_dev container:
 *   docker restart gmo-onair-app_dev-1
 */

import pg from 'pg';

const { Client } = pg;

function parseDbConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'onair_dev',
  };
}

async function main() {
  const yes = process.argv.includes('--yes');
  const cfg = parseDbConfig();
  const dbLabel = cfg.database || cfg.connectionString || '(unknown)';

  const dbStr = String(dbLabel).toLowerCase();
  if (dbStr.includes('prod') || dbStr.includes('production')) {
    console.error(`[wipe] REFUSING: database "${dbLabel}" looks like production.`);
    process.exit(2);
  }
  if (!yes) {
    console.error(`[wipe] Will TRUNCATE all public tables in: ${dbLabel}`);
    console.error('[wipe] Pass --yes to confirm.');
    process.exit(1);
  }

  const client = new Client(cfg);
  await client.connect();
  console.log(`[wipe] connected to ${dbLabel}`);

  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
  );
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => t !== 'pg_migrations' && !t.startsWith('_'));

  if (tables.length === 0) {
    console.log('[wipe] no tables found, nothing to do');
    await client.end();
    return;
  }

  const quoted = tables.map((t) => `"${t}"`).join(', ');
  console.log(`[wipe] truncating ${tables.length} tables...`);
  await client.query(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
  console.log('[wipe] done. Restart the container to trigger re-seed.');

  await client.end();
}

main().catch((err) => {
  console.error('[wipe] error:', err);
  process.exit(1);
});
