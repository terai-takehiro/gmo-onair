import { Pool, PoolClient, types } from 'pg';

// pg は NUMERIC(OID 1700) と BIGINT(OID 20) をデフォルトで文字列として返す。
// 四則演算で意図せず文字列連結にならないよう、アプリ起動時に数値パーサーを設定する。
types.setTypeParser(1700, parseFloat);  // NUMERIC
types.setTypeParser(20,   (v) => parseInt(v, 10)); // BIGINT (INT8)

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

  /*
   * ⚠️ **既定のままだと財務画面で詰まる。** `pg` の `max` は既定 10 で、
   * `connectionTimeoutMillis` は既定 0（＝無限に待つ）。財務ダッシュボードは
   * 1回の絞り込みで 6 本の API を同時に叩き、`/monthly-summary` は単独で
   * 5 本の SQL を `Promise.all` で走らせる。**2人が同時に開くだけで 10 本を超え**、
   * 超えたぶんは無限に待って nginx の 60 秒に達し 504（画面には
   * 「サーバー側で処理が止まりました」）になっていた。
   *
   * - `max`: 20。Postgres 既定の `max_connections=100` に対し、本番・検証・
   *   スクレイパー2本が同じインスタンスを共有する（`docker-compose.yml`）ので、
   *   1プロセスで取りすぎない範囲に留める
   * - `connectionTimeoutMillis`: 10 秒で諦めて 500 を返す。**無限に待つより、
   *   待たせている本人に早く返して接続を解放するほうが全体は速い**
   * - `statement_timeout`: 60 秒。**504 で応答が切られてもサーバー側のクエリは
   *   走り続ける**（過去に BOX の一括片づけで踏んだのと同じ罠・
   *   `docs/reviews/codex-findings-v4.md`）。走り続けたクエリが接続を掴んだままだと
   *   詰まりが自力で解けないので、DB 側からも切る。nginx が `/api/` を 60 秒で
   *   切るので、**それより長く走っても誰も受け取れない**＝ここが上限で困らない。
   *   ⚠️ **マイグレーションだけは除外している**（`migrate.ts` が接続ごとに 0 に戻す）
   *   — 大きな表への `CREATE INDEX` は 60 秒を超えうるし、途中で切れると
   *   トランザクションごと巻き戻って**デプロイが進まなくなる**
   */
  pool = new Pool({
    connectionString,
    client_encoding: 'UTF8',
    max: Number(process.env.DB_POOL_MAX ?? 20),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 60_000),
  });

  /*
   * **プールのエラーで落とさない。** アイドル接続が DB 側から切られたときに
   * `Pool` が `error` を投げ、誰も受けていないと Node ごと落ちる。
   */
  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });

  // Force UTF-8 on every new physical connection so Japanese text is never
  // mojibaked even if the cluster was initialised with a non-UTF8 default.
  pool.on('connect', (client) => {
    client.query("SET client_encoding TO 'UTF8'").catch(() => {
      /* ignore: server may already be UTF8 */
    });
  });

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

// トランザクション用の軽量クライアント。既存の execute/queryOne/queryAll と同じ
// `?` プレースホルダを受け付ける。
export interface TxClient {
  execute(sql: string, params?: unknown[]): Promise<void>;
  queryOne(sql: string, params?: unknown[]): Promise<Row | undefined>;
  queryAll(sql: string, params?: unknown[]): Promise<Row[]>;
}

/**
 * fn を単一のトランザクション (BEGIN/COMMIT) 内で実行する。fn が throw したら
 * ROLLBACK する。DELETE→再INSERT のような複数書き込みで、途中失敗による部分破壊
 * (明細の全損等) を防ぐために使う。
 */
export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const p = getDb();
  const client: PoolClient = await p.connect();
  const tx: TxClient = {
    async execute(sql, params = []) { await client.query(convertPlaceholders(sql), params); },
    async queryAll(sql, params = []) { const r = await client.query(convertPlaceholders(sql), params); return r.rows; },
    async queryOne(sql, params = []) { const r = await client.query(convertPlaceholders(sql), params); return r.rows[0]; },
  };
  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
