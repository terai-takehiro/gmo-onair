#!/usr/bin/env node
/**
 * import-kessan-dev.mjs
 *
 * 決算データ (freee 総勘定元帳/仕訳帳 CSV、MoneyForward xlsx) を ONAiR の
 * 予算管理・案件管理テーブルへ取り込む【検証(dev)専用】CLI。
 *
 * 抽出・マスタ突合・投入のロジックは一切持たない薄いラッパー。実体は
 * Web UI (管理画面「決算インポート」) からも呼ばれる
 * server/src/contexts/platform/services/kessan-import.service.ts の
 * runKessanImport() 一本 (ビルド済みの server/dist を読む)。
 *
 * ⚠️ 以前はここに CSV 抽出・税区分判定・GLS 番号抽出などのロジックを丸ごと
 *    複製していたが、本体側の改修 (MoneyForward 対応・仕訳帳対応・重複検出・
 *    表記ゆれ吸収した名寄せ・entity_code 対応 等) に追従できず長期間メンテが
 *    分岐し、`--commit` が `column "notes" of relation "projects" does not
 *    exist` 等で必ず失敗する状態になっていた。二重管理をやめて本体を直接呼ぶ
 *    構成にすることで、今後は本体の改修がそのまま CLI にも反映される。
 *
 * SAFETY:
 *   - DATABASE_URL が prod っぽい場合は実行拒否 (本番は Web UI から system_admin
 *     が実行する運用。このツールは検証専用)
 *   - 既定は dry-run (--commit で実書き込み)。dry-run でも DB 接続してマスタ照合・
 *     重複候補チェックまで行うため、--no-db (旧・DB非接続のパース確認専用モード)
 *     より確認内容が濃い。そのため --no-db は廃止した
 *
 * Usage (VPS / app_dev コンテナ内。server/dist を含むビルド済みイメージが前提):
 *   docker exec -it gmo-onair-app_dev-1 node server/scripts/import-kessan-dev.mjs --file=/path/to/gl.csv
 *   docker exec -it gmo-onair-app_dev-1 node server/scripts/import-kessan-dev.mjs --file=/path/to/gl.csv --scope=sga --commit
 *   docker exec -it gmo-onair-app_dev-1 node server/scripts/import-kessan-dev.mjs --file=/path/to/gl.csv --scope=all --create-masters --skip-duplicates --commit
 *
 * 必須 env: DATABASE_URL (本体の shared/db/connection.ts と同じ唯一の接続元。
 *           VPS の app_dev コンテナには docker-compose.yml で設定済み)
 * 必須 flag: --file=<path> (freee 総勘定元帳/仕訳帳 CSV、または MoneyForward xlsx)
 * 任意 flag:
 *   --scope=sga|revenues|purchases|all  (既定 sga)
 *   --period=YYYY-MM                    (既定: GL の取引月から自動判定)
 *   --create-masters                    (未登録の案件・顧客・取引先を作成)
 *   --exclude-fixed-cogs                (GLS無し原価を固定原価Pjへ計上せず除外)
 *   --skip-duplicates                   (手入力と同一と判定した重複候補行を投入しない)
 *   --commit                            (実書き込み。既定は dry-run)
 *
 * ローカルで試す場合は先に `npm run build --workspace=server` で server/dist を
 * 作ってから実行する (このスクリプトが読むのは常に dist。VPS の実行環境と揃えるため
 * `npm run dev` のように tsx で src/ を直接読むことはしない)。
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

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
const CREATE_MASTERS = hasFlag('--create-masters');
const EXCLUDE_FIXED = hasFlag('--exclude-fixed-cogs');
const SKIP_DUPLICATES = hasFlag('--skip-duplicates');
const SCOPE = getOpt('--scope', 'sga');
const FILE_PATH = getOpt('--file', '');
const PERIOD = getOpt('--period', '');

if (!FILE_PATH) {
  console.error('[kessan] --file=<path> でCSV(freee)またはxlsx(MoneyForward)ファイルを指定してください。');
  process.exit(2);
}
if (!['sga', 'revenues', 'purchases', 'all'].includes(SCOPE)) {
  console.error(`[kessan] --scope は sga|revenues|purchases|all のいずれか (指定値: ${SCOPE})`);
  process.exit(2);
}
if (PERIOD && !/^\d{4}-\d{2}$/.test(PERIOD)) {
  console.error(`[kessan] --period は YYYY-MM 形式で指定してください (指定値: ${PERIOD})`);
  process.exit(2);
}

// ============================================================
// prod ガード (本体 runKessanImport は本番でも実行できる設計 — Web UI 側で
// targetDb/isProd を画面表示した上で system_admin が判断する運用のため。
// このスクリプトには確認画面が無いので、従来通り prod らしき接続先は拒否する)
// ============================================================
function maskDbUrl(url) {
  return url.replace(/\/\/([^:/@]+):([^:@]*)@/, '//$1:***@');
}
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/onair_db';
const dbLabel = DATABASE_URL.toLowerCase();
if (dbLabel.includes('prod') || dbLabel.includes('production')) {
  console.error(`[kessan] REFUSING: DATABASE_URL "${maskDbUrl(DATABASE_URL)}" は prod らしき接続先です。本スクリプトは検証(dev)専用です。`);
  process.exit(2);
}

const yen = (n) => '¥' + Number(n).toLocaleString();

function printReport(report) {
  console.log(`[kessan] 対象期間 period=${report.period}  範囲=${report.dateRange.from || '?'}〜${report.dateRange.to || '?'}`);
  console.log(`[kessan] 取込元=${report.sourceFile}  db=${report.targetDb}${report.isProd ? ' ⚠️PROD' : ''}`);
  if (report.warnings.length) {
    console.log('\n========== 警告 ==========');
    report.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }

  console.log('\n========== 抽出サマリ ==========');
  console.log(`販管費(7xxx): ${report.summary.sga.count} 件 / 合計 ${yen(report.summary.sga.amount)}`);
  console.log(`売上(5000)  : ${report.summary.revenues.count} 件 / 合計 ${yen(report.summary.revenues.amount)}`);
  console.log(`仕入(6xxx)  : ${report.summary.purchases.count} 件 / 合計 ${yen(report.summary.purchases.amount)}` +
    (report.summary.fixedCogs.count
      ? `  ＋GLS無し固定原価 ${report.summary.fixedCogs.count} 件 ${yen(report.summary.fixedCogs.amount)} → ${report.summary.fixedCogs.routed}`
      : ''));

  const m = report.masters;
  if (m.missingProjects.length || m.missingCustomers.length || m.missingVendors.length) {
    console.log('\n========== マスタ照合 ==========');
    if (m.missingProjects.length) console.log(`未登録案件(GLS) ${m.missingProjects.length}: ${m.missingProjects.join(', ')}`);
    if (m.missingCustomers.length) console.log(`未登録顧客 ${m.missingCustomers.length}: ${m.missingCustomers.slice(0, 20).join(', ')}`);
    if (m.missingVendors.length) console.log(`未登録取引先 ${m.missingVendors.length}: ${m.missingVendors.slice(0, 20).join(', ')}`);
    if (!CREATE_MASTERS) console.log('  → --create-masters を付けると自動作成します (dev)。');
  }

  const dupTotal = report.duplicates.sga + report.duplicates.revenues + report.duplicates.purchases;
  if (dupTotal > 0) {
    console.log('\n========== 重複候補 (既存の手入力分と同一 金額+内容+年月) ==========');
    console.log(`販管費 ${report.duplicates.sga} / 売上 ${report.duplicates.revenues} / 仕入 ${report.duplicates.purchases}`);
    report.duplicates.samples.forEach((s) => console.log(`  ${s}`));
  }

  if (report.dryRun) {
    console.log('\n[kessan] DRY-RUN のため DB 書き込みは行いません。サンプルを表示します。');
    report.samples.sga.forEach((s) => console.log(`  [販管費] ${s}`));
    report.samples.revenues.forEach((s) => console.log(`  [売上] ${s}`));
    report.samples.purchases.forEach((s) => console.log(`  [仕入] ${s}`));
    console.log('\n[kessan] DRY-RUN 完了。実投入は --commit を付けて再実行してください。');
    return;
  }

  const c = report.committed;
  console.log('\n========== 投入結果 (COMMIT) ==========');
  console.log(`販管費 ${c.sga} / 売上 ${c.revenues} / 仕入 ${c.purchases}`);
  console.log(`新規作成: 案件 ${m.created.projects} / 顧客 ${m.created.customers} / 取引先 ${m.created.vendors}`);
  if (m.revivedProjects.length) console.log(`復活: 失注等で削除済みだったが決算データに実績があった案件 ${m.revivedProjects.length} 件 (${m.revivedProjects.join('、')})`);
  if (c.skipped) console.log(`スキップ ${c.skipped} 件 (マスタ未作成 / GLS未抽出 / 表記の衝突で名寄せ不可)`);
  if (c.dupSkipped) console.log(`重複スキップ ${c.dupSkipped} 件 (--skip-duplicates)`);
  console.log('[kessan] 完了。');
}

async function main() {
  if (!existsSync(DIST_DIR)) {
    throw new Error(
      `${DIST_DIR} が見つかりません。先に \`npm run build --workspace=server\` を実行してください` +
      ` (VPS の Docker イメージには server/dist が同梱済みです)。`
    );
  }
  const { initDb, closeDb } = await import(join(DIST_DIR, 'shared', 'db', 'connection.js'));
  const { runKessanImport } = await import(join(DIST_DIR, 'contexts', 'platform', 'services', 'kessan-import.service.js'));

  const fileName = basename(FILE_PATH);
  const buffer = readFileSync(FILE_PATH);
  const opts = {
    scope: SCOPE,
    commit: COMMIT,
    createMasters: CREATE_MASTERS,
    excludeFixed: EXCLUDE_FIXED,
    skipDuplicates: SKIP_DUPLICATES,
    period: PERIOD || undefined,
    file: { buffer, name: fileName },
  };
  console.log(`[kessan] mode=${COMMIT ? 'COMMIT' : 'DRY-RUN'} scope=${SCOPE} createMasters=${CREATE_MASTERS} skipDuplicates=${SKIP_DUPLICATES} file=${fileName}`);

  await initDb();
  try {
    // CLI には認証ユーザーが無いため null を渡す。runKessanImport 側が
    // (ユーザー未指定時と同じく) 最古の生存ユーザーへ自動フォールバックする。
    const report = await runKessanImport(opts, null);
    printReport(report);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('[kessan] error:', err);
  process.exit(1);
});
