#!/usr/bin/env node
/**
 * import-daily-news.mjs
 *
 * Box で運用してきた「業界ニュース.xlsx」(記入表シート) の過去データを、
 * 日常業務アプリ (dailyops) のデイリーニュース報告 (ops_reports / ops_report_items)
 * へ一括反映するワンオフ インポータ。
 *
 * データソース: server/scripts/data/daily-news-import.json
 *   [{ date:'YYYY-MM-DD', recorder:'掛田', category:'LED', ai_related:true|false|null,
 *      pick:1-5|null, url:'https://...'|null, summary:'...', note:'...'|null }, ...]
 *
 * モデル: 1日 = 1 ops_reports (kind='daily_news', period_key=date, status='published')
 *         各ニュース = ops_report_items (source='human', recorded_by=記入者名)
 *
 * 冪等性: 同一レポート内で同じ URL (無ければ 記入者+内容) の行は既存ならスキップ。
 *         既存レポートの title/body/status は上書きしない (items のみ追加)。
 *
 * SAFETY:
 *   - 既定は dry-run (--commit で実書き込み)
 *   - 接続先 DB 名に "prod" を含む場合、--commit に加えて --yes-prod も必須
 *
 * Usage (VPS コンテナ内):
 *   # まず検証環境で dry-run
 *   docker exec gmo-onair-app_dev-1 node /app/server/scripts/import-daily-news.mjs
 *   # 検証環境へ投入
 *   docker exec gmo-onair-app_dev-1 node /app/server/scripts/import-daily-news.mjs --commit
 *   # 本番へ投入 (dry-run で内容確認後)
 *   docker exec gmo-onair-app_prod-1 node /app/server/scripts/import-daily-news.mjs
 *   docker exec gmo-onair-app_prod-1 node /app/server/scripts/import-daily-news.mjs --commit --yes-prod
 *
 * 必須 env: DATABASE_URL (または DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME)
 * 任意 flag: --data-file=<path> (既定: このスクリプトと同階層の data/daily-news-import.json)
 */

import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 引数
// ============================================================
const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(n);
const getOpt = (n, d) => {
  const p = argv.find((a) => a.startsWith(`${n}=`));
  return p ? p.split('=').slice(1).join('=') : d;
};
const COMMIT = hasFlag('--commit');
const YES_PROD = hasFlag('--yes-prod');
const DATA_FILE = getOpt('--data-file', path.join(__dirname, 'data', 'daily-news-import.json'));

// ============================================================
// DB 設定
// ============================================================
function parseDbConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'onair_dev',
  };
}
const dbCfg = parseDbConfig();
const dbLabel = String(dbCfg.database || dbCfg.connectionString || '').toLowerCase();
const looksProd = dbLabel.includes('prod');
if (looksProd && COMMIT && !YES_PROD) {
  console.error(`[daily-news] REFUSING: database "${dbLabel}" は本番に見えます。--commit に加えて --yes-prod も指定してください。`);
  process.exit(2);
}

// ============================================================
// メイン
// ============================================================
async function main() {
  console.log(`[daily-news] mode=${COMMIT ? 'COMMIT' : 'DRY-RUN'} db=${dbLabel} dataFile=${DATA_FILE}`);

  const raw = readFileSync(DATA_FILE, 'utf8');
  /** @type {Array<{date:string, recorder:string, category:string|null, ai_related:boolean|null, pick:number|null, url:string|null, summary:string, note:string|null}>} */
  const items = JSON.parse(raw);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`データファイルが空か配列ではありません: ${DATA_FILE}`);
  }

  // 日付ごとにグループ化
  const byDate = new Map();
  for (const it of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.date)) {
      console.warn(`[daily-news] 日付形式が不正なためスキップ: ${JSON.stringify(it)}`);
      continue;
    }
    if (!byDate.has(it.date)) byDate.set(it.date, []);
    byDate.get(it.date).push(it);
  }
  const dates = [...byDate.keys()].sort();
  console.log(`[daily-news] 入力: ${items.length} 件 / ${dates.length} 日分 (${dates[0]} 〜 ${dates[dates.length - 1]})`);

  if (!COMMIT) {
    console.log('\n[daily-news] DRY-RUN のためDB接続・書き込みは行いません。サンプル (先頭3日分):');
    for (const d of dates.slice(0, 3)) {
      console.log(`  -- ${d} (${byDate.get(d).length} 件) --`);
      for (const it of byDate.get(d).slice(0, 3)) {
        console.log(`    [${it.category ?? '-'}]${it.ai_related ? '[AI]' : ''}${it.pick ? `[採用${it.pick}]` : ''} ${it.recorder}: ${it.summary.slice(0, 60)}`);
      }
    }
    console.log('\n[daily-news] DRY-RUN 完了。実投入は --commit を付けて再実行してください。');
    return;
  }

  const client = new Client(dbCfg);
  await client.connect();
  try {
    const counts = { reportsCreated: 0, reportsExisting: 0, itemsAdded: 0, itemsSkipped: 0 };

    for (const date of dates) {
      const dayItems = byDate.get(date);

      // 1) レポート本体を確保 (無ければ作成。既存なら title/body/status は触らない)
      let reportId;
      const existing = await client.query(
        `SELECT id FROM ops_reports WHERE kind='daily_news' AND period_key=$1 AND deleted_at IS NULL`,
        [date],
      );
      if (existing.rows[0]) {
        reportId = existing.rows[0].id;
        counts.reportsExisting++;
      } else {
        reportId = randomUUID();
        await client.query(
          `INSERT INTO ops_reports (id, kind, period_key, title, body, status, created_by, published_at)
           VALUES ($1, 'daily_news', $2, '', '', 'published', 'import-daily-news', NOW())`,
          [reportId, date],
        );
        counts.reportsCreated++;
      }

      // 2) 既存行の重複キー (url 優先、無ければ 記入者+内容) を収集
      const existingRows = await client.query(
        `SELECT url, recorded_by, content FROM ops_report_items WHERE report_id=$1 AND deleted_at IS NULL`,
        [reportId],
      );
      const seenUrls = new Set(existingRows.rows.filter((r) => r.url).map((r) => r.url));
      const seenFallback = new Set(
        existingRows.rows.filter((r) => !r.url).map((r) => `${r.recorded_by}${r.content}`),
      );

      const maxOrderRes = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM ops_report_items WHERE report_id=$1`,
        [reportId],
      );
      let sortOrder = Number(maxOrderRes.rows[0]?.m ?? 0);

      for (const it of dayItems) {
        const dedupeKey = it.url || null;
        const fallbackKey = `${it.recorder}${it.summary}`;
        if (dedupeKey && seenUrls.has(dedupeKey)) { counts.itemsSkipped++; continue; }
        if (!dedupeKey && seenFallback.has(fallbackKey)) { counts.itemsSkipped++; continue; }

        sortOrder += 1;
        await client.query(
          `INSERT INTO ops_report_items
             (id, report_id, category, content, note, url, ai_related, pick, recorded_by, source, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'human',$10)`,
          [
            randomUUID(), reportId, it.category ?? null, it.summary, it.note ?? null,
            it.url ?? null, it.ai_related ?? null, it.pick ?? null, it.recorder, sortOrder,
          ],
        );
        if (dedupeKey) seenUrls.add(dedupeKey); else seenFallback.add(fallbackKey);
        counts.itemsAdded++;
      }
    }

    console.log('\n========== 投入結果 (COMMIT) ==========');
    console.log(`レポート: 新規 ${counts.reportsCreated} / 既存流用 ${counts.reportsExisting}`);
    console.log(`ニュース行: 追加 ${counts.itemsAdded} / 重複スキップ ${counts.itemsSkipped}`);
    console.log('[daily-news] 完了。再実行しても重複追加されません (URL または 記入者+内容 で重複判定)。');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[daily-news] error:', err);
  process.exit(1);
});
