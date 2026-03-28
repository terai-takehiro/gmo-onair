import fs from 'fs';
import { config } from '../../config';
import { runMigrations } from './migrate';
import { seed } from './seed';
import { closeDb } from './connection';

async function reset() {
  if (fs.existsSync(config.dbPath)) {
    fs.unlinkSync(config.dbPath);
    console.log('Database file deleted.');
  }
  await runMigrations();
  await seed();
  closeDb();
  console.log('Database reset complete.');
}

reset();
