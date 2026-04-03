import fs from 'fs';
import path from 'path';
import { initDb, getDb, closeDb } from './connection';

export async function runMigrations(): Promise<void> {
  await initDb();
  const pool = getDb();

  // マイグレーション管理テーブルを作成
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    executed_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    // 実行済みチェック
    const result = await pool.query('SELECT name FROM _migrations WHERE name = $1', [file]);

    if (result.rows.length > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Migration failed: ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('Migrations complete.');
}

if (require.main === module) {
  runMigrations()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
