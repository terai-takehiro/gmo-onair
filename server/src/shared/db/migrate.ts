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

  /*
   * idx_episodes_project_number（回番号の一意索引・最後の砦）は、既存データに重複が
   * あると migration 260/267 が**作らないまま正常終了する**設計（デプロイを止めないため）。
   * その環境は _migrations に記録済みで二度と再挑戦しないので、ここで毎回有無を確かめ、
   * 無ければ復旧手順ごと大きく残す。**throw はしない**（索引の欠落でデプロイは止めない）。
   */
  const episodesExists = await pool.query(`SELECT to_regclass('episodes') AS t`);
  if (episodesExists.rows[0]?.t) {
    const idx = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_episodes_project_number'`
    );
    if (idx.rows.length === 0) {
      console.error(
        [
          '⚠️ [episodes] 一意索引 idx_episodes_project_number がありません',
          '  （既存の重複データのため migration 260/267 が作成を見送った環境です。',
          '   回番号の重複はアプリ側の getNextEpisodeNumberAtomic() だけで防がれている状態）。',
          '  重複の確認: SELECT project_id, episode_number, COUNT(*) FROM episodes',
          '              WHERE deleted_at IS NULL GROUP BY 1, 2 HAVING COUNT(*) > 1;',
          '  直したら手動で: CREATE UNIQUE INDEX idx_episodes_project_number',
          '                  ON episodes (project_id, episode_number) WHERE deleted_at IS NULL;',
        ].join('\n')
      );
    }

    /*
     * idx_episodes_code_unique（episode_code の一意索引・最後の砦）も同じ理由で
     * migration 275 が作成を見送ることがある。無ければ復旧手順ごと残す
     * （**throw はしない**）。
     */
    const codeIdx = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_episodes_code_unique'`
    );
    if (codeIdx.rows.length === 0) {
      console.error(
        [
          '⚠️ [episodes] 一意索引 idx_episodes_code_unique がありません',
          '  （既存の重複データのため migration 275 が作成を見送った環境です。',
          '   episode_code の重複はアプリ側の重複チェックだけで防がれている状態）。',
          '  重複の確認: SELECT episode_code, COUNT(*) FROM episodes',
          '              WHERE deleted_at IS NULL GROUP BY 1 HAVING COUNT(*) > 1;',
          '  直したら手動で: CREATE UNIQUE INDEX idx_episodes_code_unique',
          '                  ON episodes (episode_code) WHERE deleted_at IS NULL;',
        ].join('\n')
      );
    }
  }

  /*
   * legal_entities（SCS/GSS/GMO の3行）と org_transition（'default' の1行）は
   * migration 284 が必ず作る土台。無いと計上会社まわりの API が全部落ちるが、
   * 既存パターン（episodes の一意索引チェック）に揃え、**throw はしない**
   * （デプロイを止めない。詳細: docs/reorg-2026-10-plan.md）。
   */
  const legalEntitiesCount = await pool.query(
    `SELECT count(*)::int AS n FROM legal_entities WHERE code IN ('SCS', 'GSS', 'GMO')`
  );
  if ((legalEntitiesCount.rows[0]?.n ?? 0) !== 3) {
    console.error(
      [
        '⚠️ [legal_entities] SCS/GSS/GMO の3行がありません',
        '  （migration 284 が未適用、または誰かが削除した環境）。',
        '  計上会社まわりの API・画面が動きません。',
        '  直したら手動で: 284_legal_entities.sql の INSERT 文を code=\'GJV\'→\'SCS\'・',
        '  number_prefix=\'GJV-\'→\'SCS-\' に読み替えて実行してください',
        '  （293_rename_gjv_to_scs.sql 適用後は CHECK 制約が SCS/GSS/GMO のみを許すため、',
        '  284 をそのまま再実行すると GJV の INSERT が弾かれます）。',
      ].join('\n')
    );
  }
  const orgTransitionCount = await pool.query(
    `SELECT count(*)::int AS n FROM org_transition WHERE id = 'default'`
  );
  if ((orgTransitionCount.rows[0]?.n ?? 0) !== 1) {
    console.error(
      [
        '⚠️ [org_transition] \'default\' 行がありません（migration 284 が未適用の環境）。',
        '  直したら手動で: INSERT INTO org_transition (id) VALUES (\'default\');',
      ].join('\n')
    );
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
