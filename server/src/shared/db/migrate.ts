import fs from 'fs';
import path from 'path';
import { initDb, getDb, saveDb, closeDb } from './connection';

export async function runMigrations(): Promise<void> {
  await initDb();
  const db = getDb();

  // マイグレーション管理テーブルを作成
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    // 実行済みチェック
    const stmt = db.prepare('SELECT name FROM _migrations WHERE name = ?');
    stmt.bind([file]);
    const alreadyRun = stmt.step();
    stmt.free();

    if (alreadyRun) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    try {
      db.run(sql);
      // 実行済みとして記録
      const insert = db.prepare('INSERT INTO _migrations (name) VALUES (?)');
      insert.bind([file]);
      insert.step();
      insert.free();
    } catch (err) {
      console.error(`Migration failed: ${file}`, err);
      throw err;
    }
  }
  saveDb();
  console.log('Migrations complete.');
}

if (require.main === module) {
  runMigrations().then(() => closeDb());
}
