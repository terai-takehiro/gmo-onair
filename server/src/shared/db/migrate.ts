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
      /*
       * ⚠️ **マイグレーションには時間制限を掛けない。** プールには
       * `statement_timeout`（既定 60 秒・`connection.ts`）を入れてあるが、
       * 大きな表への `CREATE INDEX` はそれを超えることがある。途中で切られると
       * `ROLLBACK` してデプロイが止まり、**次回も同じ所で止まり続ける**。
       *
       * ⚠️ **`SET LOCAL`**（`SET` ではない）。`pg` は接続をプールへ返すときに
       * セッションの状態を戻さないので、素の `SET` だと**この接続を次に使った
       * リクエストまで時間制限が消えたまま**になる。`SET LOCAL` なら
       * COMMIT/ROLLBACK のどちらでもこの取引の終わりで戻る。
       */
      await client.query('SET LOCAL statement_timeout = 0');
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
