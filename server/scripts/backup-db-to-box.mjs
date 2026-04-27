#!/usr/bin/env node
/**
 * server/scripts/backup-db-to-box.mjs — v2.7.12
 *
 * GMO ONAiR の PostgreSQL DB を pg_dump で吸い出し、gzip 圧縮して
 * BOX 「社内限り」フォルダ配下の `00_DB_Backup/{prod|dev}/` に
 * `{db_name}_YYYYMMDD_HHMMSS.sql.gz` として保存する。
 *
 * - 30 日以上前のファイルは BOX 上で自動削除 (ローテーション)
 * - prod / dev コンテナそれぞれで cron 実行する想定 (NODE_ENV で識別)
 * - 親フォルダ `00_DB_Backup` および `prod` / `dev` が存在しなければ自動作成
 *
 * 環境変数 (本番 / 開発コンテナの env が既にセット済み):
 *   BOX_CONFIG_JSON                      — BOX JWT App 設定 JSON (1 行)
 *   BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL — 社内限り親フォルダ ID
 *   DATABASE_URL                          — postgres://USER:PASS@HOST:PORT/DBNAME
 *   NODE_ENV                              — production または development
 *
 * 実行例 (cron from VPS host):
 *   0 *\/3 * * * docker exec gmo-onair-app_prod-1 node /app/server/scripts/backup-db-to-box.mjs
 *   30 *\/3 * * * docker exec gmo-onair-app_dev-1  node /app/server/scripts/backup-db-to-box.mjs
 */
import { spawn } from 'node:child_process';
import { createWriteStream, createReadStream, statSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import BoxSDK from 'box-node-sdk';

const RETENTION_DAYS = 30;
const ROOT_FOLDER_NAME = '00_DB_Backup';

const BOX_CONFIG_JSON = process.env.BOX_CONFIG_JSON;
const PARENT_FOLDER_ID = process.env.BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL;
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ENV_LABEL = NODE_ENV === 'production' ? 'prod' : 'dev';

if (!BOX_CONFIG_JSON) {
  console.error('[backup] BOX_CONFIG_JSON not set — aborting');
  process.exit(1);
}
if (!PARENT_FOLDER_ID) {
  console.error('[backup] BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL not set — aborting (need 社内限り parent folder)');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('[backup] DATABASE_URL not set — aborting');
  process.exit(1);
}

/** DATABASE_URL を分解。pg_dump へ個別引数で渡すため */
function parseDatabaseUrl(url) {
  // postgresql://USER:PASS@HOST:PORT/DBNAME
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^/?]+)/);
  if (!m) throw new Error(`Invalid DATABASE_URL format: ${url.slice(0, 30)}…`);
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
  const config = JSON.parse(BOX_CONFIG_JSON);
  sdk = BoxSDK.getPreconfiguredInstance(config);
} catch (err) {
  console.error('[backup] Invalid BOX_CONFIG_JSON:', err.message);
  process.exit(1);
}
const client = sdk.getAppAuthClient('enterprise');

/** 親 ID 配下に同名フォルダがあれば ID を返し、無ければ作成して ID を返す */
async function findOrCreateFolder(parentId, name) {
  const items = await client.folders.getItems(parentId, {
    limit: 1000,
    fields: 'id,name,type',
  });
  const found = items.entries.find((e) => e.type === 'folder' && e.name === name);
  if (found) return found.id;
  console.log(`[backup] Creating folder '${name}' under parent ${parentId}`);
  const created = await client.folders.create(parentId, name);
  return created.id;
}

/** 指定フォルダ配下のファイル一覧 (subfolder は無視) */
async function listFilesInFolder(folderId) {
  const items = await client.folders.getItems(folderId, {
    limit: 1000,
    fields: 'id,name,type,created_at,size',
  });
  return items.entries.filter((e) => e.type === 'file');
}

async function uploadFile(folderId, filename, filePath) {
  const stream = createReadStream(filePath);
  const result = await client.files.uploadFile(folderId, filename, stream);
  // BOX SDK の戻りは { entries: [...] } または { ... } の場合あり
  return result.entries?.[0] || result;
}

async function deleteOldFiles(folderId, retentionDays) {
  const files = await listFilesInFolder(folderId);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const f of files) {
    const created = new Date(f.created_at).getTime();
    if (Number.isFinite(created) && created < cutoff) {
      try {
        await client.files.delete(f.id);
        console.log(`[backup] Deleted old file '${f.name}' (created ${f.created_at})`);
        deleted += 1;
      } catch (err) {
        console.warn(`[backup] Failed to delete file '${f.name}':`, err.message);
      }
    }
  }
  return deleted;
}

/** pg_dump → gzip → 一時ファイルに書き出す */
function dumpDbToFile(outPath) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PGPASSWORD: db.password };
    const args = [
      '-h', db.host,
      '-p', String(db.port),
      '-U', db.user,
      '-d', db.database,
      '--no-owner',
      '--no-acl',
    ];
    const dump = spawn('pg_dump', args, { env });
    const gzip = createGzip({ level: 6 });
    const out = createWriteStream(outPath);

    let stderr = '';
    dump.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    dump.stdout.pipe(gzip).pipe(out);

    let dumpExitCode = null;
    dump.on('exit', (code) => {
      dumpExitCode = code;
    });
    dump.on('error', reject);
    out.on('error', reject);

    out.on('finish', () => {
      if (dumpExitCode !== 0) {
        reject(new Error(`pg_dump exited with code ${dumpExitCode}: ${stderr.trim()}`));
        return;
      }
      if (stderr.trim()) {
        // 警告がある場合のみ表示。NOTICE は無視
        const trimmed = stderr.trim();
        if (!/^pg_dump: [^:]*notice/i.test(trimmed)) {
          console.warn('[backup] pg_dump stderr:', trimmed);
        }
      }
      resolve(outPath);
    });
  });
}

function makeTimestamp() {
  // YYYYMMDD_HHMMSS (UTC)
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

async function main() {
  const startTime = Date.now();
  console.log(
    `[backup] Starting at ${new Date().toISOString()} (env=${ENV_LABEL}, db=${db.database}@${db.host}:${db.port})`,
  );

  // 1. フォルダ階層を確保: 社内限り親 / 00_DB_Backup / {prod|dev}
  const dbBackupRootId = await findOrCreateFolder(PARENT_FOLDER_ID, ROOT_FOLDER_NAME);
  const envFolderId = await findOrCreateFolder(dbBackupRootId, ENV_LABEL);

  // 2. pg_dump → gzip → /tmp
  const ts = makeTimestamp();
  const filename = `${db.database}_${ts}.sql.gz`;
  const tmpPath = path.join(tmpdir(), filename);

  try {
    await dumpDbToFile(tmpPath);
    const size = statSync(tmpPath).size;
    console.log(
      `[backup] Dumped ${db.database} → ${tmpPath} (${(size / 1024 / 1024).toFixed(2)} MB)`,
    );

    // 3. BOX へアップロード
    const uploaded = await uploadFile(envFolderId, filename, tmpPath);
    console.log(`[backup] Uploaded to BOX: ${uploaded.id || '?'} ${uploaded.name || filename}`);

    // 4. 古いファイル削除
    const deleted = await deleteOldFiles(envFolderId, RETENTION_DAYS);
    if (deleted > 0) {
      console.log(`[backup] Cleaned up ${deleted} file(s) older than ${RETENTION_DAYS} days`);
    }
  } finally {
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[backup] Completed in ${elapsed}s`);
}

main().catch((err) => {
  console.error('[backup] FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
