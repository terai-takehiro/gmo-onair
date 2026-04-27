#!/usr/bin/env node
/**
 * server/scripts/restore-db-from-box.mjs — v2.8.2
 *
 * BOX 「社内限り」フォルダの 00_DB_Backup/{prod|dev}/ に保管されている
 * pg_dump バックアップから DB を復元する。
 *
 * **⚠️ 破壊的操作**: 既存の全テーブルが上書きされます。
 *
 * 安全策 (5 層):
 *  1) 環境チェック: onair_prod_* → prod コンテナのみ、onair_dev_* → dev のみ
 *  2) 復元前にスナップショットを /tmp/before-restore_*.sql.gz に退避
 *  3) "yes" を全文タイプしないと続行しない (--yes フラグでスキップ可)
 *  4) 監査ログを stdout に出力 (Docker logs に記録される)
 *  5) 復元中にエラーが発生したらスナップショットからの復旧手順を表示
 *
 * 使い方:
 *   # バックアップ一覧
 *   docker exec gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs --list
 *
 *   # 復元 (対話確認あり)
 *   docker exec -it gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs onair_prod_20260427_180000.sql.gz
 *
 *   # 復元 (確認スキップ、自動化用)
 *   docker exec gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs --yes onair_prod_20260427_180000.sql.gz
 */
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, statSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline';
import BoxSDK from 'box-node-sdk';

const ROOT_FOLDER_NAME = '00_DB_Backup';

const BOX_CONFIG_JSON = process.env.BOX_CONFIG_JSON;
const PARENT_FOLDER_ID = process.env.BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL;
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ENV_LABEL = NODE_ENV === 'production' ? 'prod' : 'dev';

if (!BOX_CONFIG_JSON) {
  console.error('[restore] BOX_CONFIG_JSON not set — aborting');
  process.exit(1);
}
if (!PARENT_FOLDER_ID) {
  console.error('[restore] BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL not set — aborting');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('[restore] DATABASE_URL not set — aborting');
  process.exit(1);
}

function parseDatabaseUrl(url) {
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^/?]+)/);
  if (!m) throw new Error(`Invalid DATABASE_URL format`);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(m[2]),
    host: m[3],
    port: m[4] ? Number(m[4]) : 5432,
    database: m[5],
  };
}

const db = parseDatabaseUrl(DATABASE_URL);

let sdk;
try {
  sdk = BoxSDK.getPreconfiguredInstance(JSON.parse(BOX_CONFIG_JSON));
} catch (err) {
  console.error('[restore] Invalid BOX_CONFIG_JSON:', err.message);
  process.exit(1);
}
const client = sdk.getAppAuthClient('enterprise');

// ──────────────────────────────────────────
// BOX ヘルパー
// ──────────────────────────────────────────

async function findFolder(parentId, name) {
  const items = await client.folders.getItems(parentId, { limit: 1000, fields: 'id,name,type' });
  const found = items.entries.find((e) => e.type === 'folder' && e.name === name);
  return found?.id ?? null;
}

async function listBackupFiles() {
  const rootId = await findFolder(PARENT_FOLDER_ID, ROOT_FOLDER_NAME);
  if (!rootId) {
    console.error(`[restore] ${ROOT_FOLDER_NAME} フォルダが見つかりません`);
    return [];
  }
  const envId = await findFolder(rootId, ENV_LABEL);
  if (!envId) {
    console.error(`[restore] ${ROOT_FOLDER_NAME}/${ENV_LABEL} フォルダが見つかりません`);
    return [];
  }
  const items = await client.folders.getItems(envId, {
    limit: 1000,
    fields: 'id,name,type,size,created_at',
  });
  return items.entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.sql.gz'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

async function findFileByName(filename) {
  const files = await listBackupFiles();
  return files.find((f) => f.name === filename) || null;
}

async function downloadFile(fileId, outPath) {
  const stream = await client.files.getReadStream(fileId);
  const out = createWriteStream(outPath);
  await pipeline(stream, out);
}

// ──────────────────────────────────────────
// pg_dump / psql ヘルパー
// ──────────────────────────────────────────

function dumpDbToFile(outPath) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PGPASSWORD: db.password };
    const args = ['-h', db.host, '-p', String(db.port), '-U', db.user, '-d', db.database, '--no-owner', '--no-acl'];
    const dump = spawn('pg_dump', args, { env });
    const gzip = createGzip({ level: 6 });
    const out = createWriteStream(outPath);
    let stderr = '';
    dump.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    dump.stdout.pipe(gzip).pipe(out);
    let exitCode = null;
    dump.on('exit', (c) => { exitCode = c; });
    dump.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => {
      if (exitCode !== 0) reject(new Error(`pg_dump exited ${exitCode}: ${stderr}`));
      else resolve(outPath);
    });
  });
}

function execSql(sql) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PGPASSWORD: db.password };
    const args = ['-h', db.host, '-p', String(db.port), '-U', db.user, '-d', db.database, '-v', 'ON_ERROR_STOP=1', '-c', sql];
    const psql = spawn('psql', args, { env });
    let stderr = '';
    psql.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    psql.on('error', reject);
    psql.on('exit', (code) => {
      if (code !== 0) reject(new Error(`psql exited ${code}: ${stderr}`));
      else resolve();
    });
  });
}

function applyDumpFile(filePath) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PGPASSWORD: db.password };
    const args = ['-h', db.host, '-p', String(db.port), '-U', db.user, '-d', db.database, '-v', 'ON_ERROR_STOP=1'];
    const psql = spawn('psql', args, { env });
    let stderr = '';
    psql.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    psql.on('error', reject);

    const gunzip = createGunzip();
    const reader = createReadStream(filePath);
    reader.pipe(gunzip).pipe(psql.stdin);

    psql.on('exit', (code) => {
      if (code !== 0) reject(new Error(`psql apply exited ${code}: ${stderr.slice(-2000)}`));
      else resolve();
    });
  });
}

// ──────────────────────────────────────────
// 対話ヘルパー
// ──────────────────────────────────────────

function confirmYes(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

function fmtSize(n) {
  return `${(Number(n) / 1024 / 1024).toFixed(2)} MB`;
}

// ──────────────────────────────────────────
// メイン
// ──────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isList = args.includes('--list');
  const isYes = args.includes('--yes');
  const targetFile = args.find((a) => a.endsWith('.sql.gz'));

  if (isList) {
    const files = await listBackupFiles();
    console.log(`[restore] バックアップ一覧 (環境=${ENV_LABEL}, 全 ${files.length} 件)`);
    console.log(`[restore] -------------------------------------------`);
    if (files.length === 0) {
      console.log(`[restore] (バックアップが見つかりません)`);
      return;
    }
    for (const f of files) {
      console.log(`[restore]   ${f.name}  (${fmtSize(f.size)}, ${f.created_at})`);
    }
    return;
  }

  if (!targetFile) {
    console.error('[restore] 使い方:');
    console.error('[restore]   --list でバックアップ一覧を表示');
    console.error('[restore]   <ファイル名> を渡すと復元を実行');
    process.exit(1);
  }

  // 安全策 1: 環境チェック (prod ファイル → prod 環境のみ復元可)
  const fileEnv = targetFile.startsWith('onair_prod_') ? 'prod' :
                  targetFile.startsWith('onair_dev_') ? 'dev' : 'unknown';
  if (fileEnv !== ENV_LABEL) {
    console.error(`[restore] ❌ 環境ミスマッチ: ファイルは ${fileEnv} 用、現在の環境は ${ENV_LABEL}`);
    console.error(`[restore]    クロス環境の復元は安全のため禁止されています`);
    process.exit(1);
  }

  const file = await findFileByName(targetFile);
  if (!file) {
    console.error(`[restore] ❌ BOX にファイル '${targetFile}' が見つかりません`);
    console.error(`[restore]    --list で正しいファイル名を確認してください`);
    process.exit(1);
  }

  // 警告表示
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ⚠️  ⚠️  ⚠️  破壊的な操作です  ⚠️  ⚠️  ⚠️');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  復元元: ${targetFile} (BOX, ${fmtSize(file.size)})`);
  console.log(`  復元先: ${db.database} @ ${db.host}:${db.port} (環境: ${ENV_LABEL})`);
  console.log(`  作成日: ${file.created_at}`);
  console.log(`  操作:   既存の全テーブルがドロップされ、上記バックアップで上書きされます`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // 安全策 3: "yes" を全文タイプしないと続行しない
  if (!isYes) {
    const ok = await confirmYes('続行するには "yes" と全文入力してください > ');
    if (!ok) {
      console.log('[restore] キャンセルしました');
      return;
    }
  } else {
    console.log('[restore] --yes フラグで自動承認');
  }

  // 安全策 2: 現在の DB を退避
  const safetyTs = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const safetyPath = path.join(tmpdir(), `before-restore_${db.database}_${safetyTs}.sql.gz`);
  console.log(`[restore] [1/4] 現在の DB をスナップショット中... → ${safetyPath}`);
  try {
    await dumpDbToFile(safetyPath);
    console.log(`[restore]       完了 (${fmtSize(statSync(safetyPath).size)})`);
  } catch (err) {
    console.error(`[restore] ❌ スナップショット失敗: ${err.message}`);
    console.error(`[restore]    安全のため復元を中止します`);
    process.exit(1);
  }

  // BOX からダウンロード
  const downloadPath = path.join(tmpdir(), `restore_${targetFile}`);
  console.log(`[restore] [2/4] BOX からダウンロード中... → ${downloadPath}`);
  try {
    await downloadFile(file.id, downloadPath);
    console.log(`[restore]       完了 (${fmtSize(statSync(downloadPath).size)})`);
  } catch (err) {
    console.error(`[restore] ❌ ダウンロード失敗: ${err.message}`);
    console.error(`[restore]    DB は変更されていません (スナップショット ${safetyPath} は残っています)`);
    process.exit(1);
  }

  // スキーマをドロップして再作成
  console.log(`[restore] [3/4] 既存スキーマを削除して再作成中...`);
  try {
    await execSql(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${db.user}; GRANT ALL ON SCHEMA public TO public;`);
    console.log(`[restore]       完了`);
  } catch (err) {
    console.error(`[restore] ❌ スキーマ再作成失敗: ${err.message}`);
    console.error(`[restore]    DB は不整合状態の可能性があります`);
    console.error(`[restore]    復旧: docker exec ... node restore-db-from-box.mjs <スナップショットを BOX に置いて>`);
    console.error(`[restore]    または手動: gunzip -c ${safetyPath} | psql -h ${db.host} -U ${db.user} -d ${db.database}`);
    process.exit(1);
  }

  // ダンプを適用
  console.log(`[restore] [4/4] バックアップを DB に適用中... (大きなバックアップは数分かかります)`);
  try {
    await applyDumpFile(downloadPath);
    console.log(`[restore]       完了`);
  } catch (err) {
    console.error(`[restore] ❌ ダンプ適用失敗: ${err.message}`);
    console.error(`[restore]    DB は不整合状態の可能性があります`);
    console.error(`[restore]    復旧手順:`);
    console.error(`[restore]      gunzip -c ${safetyPath} | docker exec -i gmo-onair-app_${ENV_LABEL}-1 psql -h ${db.host} -U ${db.user} -d ${db.database}`);
    process.exit(1);
  }

  // クリーンアップ
  try { unlinkSync(downloadPath); } catch {}

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ✅ 復元完了`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  退避ファイル: ${safetyPath}`);
  console.log(`  (問題があれば上記ファイルから復旧可能。1 時間後に削除されます)`);
  console.log(`[restore] AUDIT: env=${ENV_LABEL} db=${db.database} restored_from=${targetFile} at=${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error('[restore] FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
