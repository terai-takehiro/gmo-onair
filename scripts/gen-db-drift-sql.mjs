#!/usr/bin/env node
/**
 * DB ドリフト監査 SQL を生成する（テーブル・列・FK の3段）
 *
 * ── なぜこれがあるか ────────────────────────────────────────
 *
 * 「migration ファイルだけから作った『あるべき姿』」と「実際の dev/prod DB」を
 * 突き合わせる作業を、これまで人が手でSQLを組み立てて行っていた
 * （`docs/reviews/phase3-2-plan.md`「2026-08-19 引き継ぎメモ」参照）。
 * このスクリプトはその**組み立て**を自動化する — 突き合わせの**実行**は
 * VPS（dev/prod への接続が要る）で人が行う。
 *
 * `scripts/v4-progress.mjs` と同じ考え方: **手で書くと実態とずれる**ので、
 * 「あるべき姿」は毎回ローカルの検証用 Postgres から実際に読み取る。
 *
 * ── 使い方 ──────────────────────────────────────────────────
 *
 *   npm run verify:up                        # まだなら検証用 Postgres を立てる
 *   node scripts/gen-db-drift-sql.mjs > /tmp/db-drift-check.sql
 *
 * 生成した SQL を VPS に運んで実行する（dev/prod どちらも同じ手順）:
 *
 *   docker cp /tmp/db-drift-check.sql gmo-onair-app_dev-1:/tmp/
 *   docker exec -it gmo-onair-app_dev-1 sh -c 'psql "$DATABASE_URL" -f /tmp/db-drift-check.sql'
 *
 * 結果は3段（テーブル・列・FK）で、`kind` 列が
 * `only_in_dev`（migration に無いのに実DBにある＝未追跡）／
 * `only_in_migrations`（実DBに無いが migration にはある＝実DBで消えている）
 * を示す。**0行なら差分なし。**
 *
 * ⚠️ **接続先はこのスクリプト自身の DATABASE_URL ではなく、生成した SQL を
 * 実行する側（VPS 上の psql）の接続先で決まる。** このスクリプトはあくまで
 * 「あるべき姿」を埋め込んだ SQL 文字列を作るだけで、dev/prod には一切繋がない。
 */
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:5433/onair_verify';

/** SQL の文字列リテラルとして安全に埋め込む（`'` を `''` にエスケープするだけで足りる） */
function esc(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const tables = (await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'
     ORDER BY table_name`
  )).rows.map((r) => r.table_name);

  const columns = (await client.query(
    `SELECT table_name || '.' || column_name AS col
     FROM information_schema.columns
     WHERE table_schema='public'
     ORDER BY table_name, ordinal_position`
  )).rows.map((r) => r.col);

  const fks = (await client.query(
    `SELECT conname || '|' || conrelid::regclass::text || '|' || confrelid::regclass::text AS fk
     FROM pg_constraint
     WHERE contype='f' AND connamespace='public'::regnamespace
     ORDER BY conname`
  )).rows.map((r) => r.fk);

  await client.end();

  const valuesList = (items) => items.map((i) => `  (${esc(i)})`).join(',\n');

  const sql = `-- ============================================================
-- DB ドリフト監査（テーブル・列・FK）
-- ${new Date().toISOString().slice(0, 10)} 時点の migration ファイルから
-- scripts/gen-db-drift-sql.mjs が生成（手で書いていない・実態とずれない）
--
-- 使い方: このファイルを実行したい環境（dev/prod）の psql で -f 実行する。
-- kind='only_in_dev' … migration に無いのに実DBにある（未追跡の変更）
-- kind='only_in_migrations' … 実DBに無いが migration にはある（実DBで列/テーブルが消えている）
-- 0行なら差分なし。
-- ============================================================

-- ── ① テーブル ──────────────────────────────────────────────
WITH expected(name) AS (
  VALUES
${valuesList(tables)}
),
actual AS (
  SELECT table_name AS name FROM information_schema.tables
  WHERE table_schema='public' AND table_type='BASE TABLE'
)
SELECT 'table' AS category, 'only_in_dev' AS kind, name FROM actual WHERE name NOT IN (SELECT name FROM expected)
UNION ALL
SELECT 'table', 'only_in_migrations', name FROM expected WHERE name NOT IN (SELECT name FROM actual)
ORDER BY 2, 3;

-- ── ② 列 ────────────────────────────────────────────────────
WITH expected(col) AS (
  VALUES
${valuesList(columns)}
),
actual AS (
  SELECT table_name || '.' || column_name AS col
  FROM information_schema.columns WHERE table_schema='public'
)
SELECT 'column' AS category, 'only_in_dev' AS kind, col FROM actual WHERE col NOT IN (SELECT col FROM expected)
UNION ALL
SELECT 'column', 'only_in_migrations', col FROM expected WHERE col NOT IN (SELECT col FROM actual)
ORDER BY 2, 3;

-- ── ③ 外部キー制約 ──────────────────────────────────────────
WITH expected(fk) AS (
  VALUES
${valuesList(fks)}
),
actual AS (
  SELECT conname || '|' || conrelid::regclass::text || '|' || confrelid::regclass::text AS fk
  FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace
)
SELECT 'fk' AS category, 'only_in_dev' AS kind, fk FROM actual WHERE fk NOT IN (SELECT fk FROM expected)
UNION ALL
SELECT 'fk', 'only_in_migrations', fk FROM expected WHERE fk NOT IN (SELECT fk FROM actual)
ORDER BY 2, 3;
`;

  process.stdout.write(sql);
}

main().catch((err) => {
  console.error('[gen-db-drift-sql] 失敗:', err.message);
  console.error('先に `npm run verify:up` で検証用 Postgres を立ててください。');
  process.exit(1);
});
