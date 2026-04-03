import { initDb, getDb, closeDb } from './connection';
import { runMigrations } from './migrate';
import { seed } from './seed';

async function reset() {
  await initDb();
  const pool = getDb();

  // Drop all tables and recreate
  await pool.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
  console.log('All tables dropped.');

  await runMigrations();
  await seed();
  await closeDb();
  console.log('Database reset complete.');
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
