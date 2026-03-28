import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { config } from '../../config';

let db: Database | null = null;

export async function initDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function saveDb(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(config.dbPath, buffer);
  }
}

export function closeDb(): void {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

// Helper: sql.js uses different API than better-sqlite3
// Wrap common patterns for easier use

export interface Row {
  [key: string]: unknown;
}

export function queryAll(sql: string, params: unknown[] = []): Row[] {
  const d = getDb();
  const stmt = d.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results: Row[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as Row);
  }
  stmt.free();
  return results;
}

export function queryOne(sql: string, params: unknown[] = []): Row | undefined {
  const results = queryAll(sql, params);
  return results[0];
}

export function execute(sql: string, params: unknown[] = []): void {
  const d = getDb();
  if (params.length > 0) {
    const stmt = d.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  } else {
    d.run(sql);
  }
  saveDb();
}

export function execMultiple(sql: string): void {
  const d = getDb();
  d.run(sql);
  saveDb();
}
