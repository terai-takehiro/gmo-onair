import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/onair_db';

/**
 * Convert sql.js style `?` placeholders to PostgreSQL `$1, $2, $3...` format.
 * This allows existing queries throughout the codebase to remain unchanged.
 */
function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index++;
    return `$${index}`;
  });
}

export async function initDb(): Promise<Pool> {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;

  pool = new Pool({ connectionString });

  // Verify the connection works
  const client = await pool.connect();
  client.release();

  return pool;
}

export function getDb(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

export function saveDb(): void {
  // No-op: PostgreSQL persists data automatically
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Helper types and functions

export interface Row {
  [key: string]: unknown;
}

export async function queryAll(sql: string, params: unknown[] = []): Promise<Row[]> {
  const p = getDb();
  const pgSql = convertPlaceholders(sql);
  const result = await p.query(pgSql, params);
  return result.rows;
}

export async function queryOne(sql: string, params: unknown[] = []): Promise<Row | undefined> {
  const rows = await queryAll(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const p = getDb();
  const pgSql = convertPlaceholders(sql);
  await p.query(pgSql, params);
}

export async function execMultiple(sql: string): Promise<void> {
  const p = getDb();
  await p.query(sql);
}
