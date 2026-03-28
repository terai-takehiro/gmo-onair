import fs from 'fs';
import path from 'path';
import { initDb, getDb, saveDb, closeDb } from './connection';

export async function runMigrations(): Promise<void> {
  await initDb();
  const db = getDb();
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    db.run(sql);
  }
  saveDb();
  console.log('Migrations complete.');
}

if (require.main === module) {
  runMigrations().then(() => closeDb());
}
