#!/usr/bin/env node
/**
 * check-project-number-history-gaps.mjs
 *
 * 読み取り専用の診断スクリプト（書き込みなし・--commit 相当のフラグも無い）。
 * terai-takehiro/gmo-onair#714・#716 で直した「決算取込が作った案件は
 * project_numbers に1行も残していなかった」不具合について、過去に実害
 * （旧番号の消失）が起きているかを確かめる。
 *
 * 背景: #716 で足した ensureNumberHistory バックフィルは「今後、決算取込が
 * 触れた案件」だけを直すもので、既に起きてしまった消失は救えない
 * （renumberProject() の「退役させる現役の番号」UPDATE が 0 行更新で
 * 終わり、旧番号が gls_number からも project_numbers からも消える）。
 *
 * このスクリプトは3段で調べる:
 *   ① 決算取込 (kessan_marker IS NOT NULL) が作った案件のうち、現在の
 *      gls_number が project_numbers に現役行 (retired_at IS NULL) を
 *      持たないもの（タスクで指定された調査クエリそのもの）。
 *      ⚠️ これは「まだ改番されていない＝現時点では実害なし（旧番号は
 *      projects.gls_number にそのまま残っている）が、次に改番されると
 *      危ない」案件しか拾えない。理由は③参照。
 *   ② ①をkessan_markerに限定しない一般形。案件Excel一括登録
 *      (server/src/contexts/sales/routes/excel.routes.ts の PROJECTS_CONFIG.insert)
 *      など、決算取込以外の経路でも同じ「gls_numberだけ書いてproject_numbersを
 *      残さない」パターンが無いかを洗い出す
 *   ③ **実害（旧番号が既に失われた）を検出する本命クエリ**。
 *      `renumberProject()` は「旧番号を retired_at 付きで更新」が0行でも、
 *      「新番号を project_numbers に追記」は無条件に実行する
 *      （`recordNumberIssued` は ON CONFLICT DO NOTHING なだけで、新番号側に
 *      衝突は起きないため必ず成功する）。つまり **改番が一度でも起きていれば、
 *      「今の gls_number」は必ず project_numbers に現役行を持つ** —
 *      ①②のクエリ（今の番号だけを見る）は改番後の状態を「正常」と誤判定し、
 *      失われた旧番号を検出できない。
 *      実害の証拠は `entity_source = 'manual'`（renumberProject() だけが立てる
 *      印）を持つのに、project_numbers の行数が2未満（＝新番号1行しか無く、
 *      旧番号の退役行が無い＝退役UPDATEが0行だった）という組み合わせ。
 * ①②③ いずれも、ヒットした行には project_numbers の全履歴を添えて出す。
 *
 * Usage (VPS / app_prod または app_dev コンテナ内):
 *   docker exec -it gmo-onair-app_prod-1 node /app/server/scripts/check-project-number-history-gaps.mjs
 *   docker exec -it gmo-onair-app_dev-1  node /app/server/scripts/check-project-number-history-gaps.mjs
 *
 * 必須 env: (DATABASE_URL | DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME)
 * 任意 flag: --json（人間向けの表ではなく JSON で出す）
 */

import pg from 'pg';

const { Client } = pg;
const JSON_OUT = process.argv.includes('--json');

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
const isProd = dbLabel.includes('prod') && !dbLabel.includes('dev');

// 決算取込が作った案件のうち、現在の番号が project_numbers に現役行を持たないもの
const SQL_KESSAN = `
  SELECT p.id, p.gls_number, p.code, p.kessan_marker, p.name, p.updated_at, p.entity_code, p.entity_source, p.entity_note
  FROM projects p
  WHERE p.kessan_marker IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.gls_number IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM project_numbers pn
      WHERE pn.number = p.gls_number AND pn.retired_at IS NULL
    )
  ORDER BY p.updated_at DESC`;

// 一般形: 出どころを問わず、gls_number はあるが project_numbers に現役行が無い案件
const SQL_GENERAL = `
  SELECT p.id, p.gls_number, p.code, p.kessan_marker, p.name, p.updated_at, p.entity_code, p.entity_source, p.entity_note
  FROM projects p
  WHERE p.deleted_at IS NULL
    AND p.gls_number IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM project_numbers pn
      WHERE pn.number = p.gls_number AND pn.retired_at IS NULL
    )
  ORDER BY p.updated_at DESC`;

// ヒットした案件ごとに、project_numbers に「どんな行であれ」履歴が残っているか
// （0件 = そもそも一度も記録されたことがない。1件以上 = 別の番号の行がある
//   ＝ 改番されて旧番号が退役"すべきだった"のに出来ていない疑いが濃い）
const SQL_ANY_HISTORY = `
  SELECT number, entity_code, scheme, assigned_at, retired_at, reason
  FROM project_numbers WHERE project_id = $1 ORDER BY assigned_at`;

// ③ 本命: 決算取込が作り、かつ実際に改番された（entity_source='manual'）のに、
// project_numbers の行数が2未満（新番号1行だけ・旧番号の退役行が無い）案件。
// これが「旧番号が実際に失われた」ことの確度が最も高い証拠。
const SQL_CONFIRMED_HARM = `
  SELECT p.id, p.gls_number AS current_number, p.code, p.kessan_marker, p.name,
         p.updated_at, p.entity_code, p.entity_source, p.entity_note,
         (SELECT COUNT(*) FROM project_numbers pn WHERE pn.project_id = p.id) AS history_row_count
  FROM projects p
  WHERE p.kessan_marker IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.entity_source = 'manual'
    AND (SELECT COUNT(*) FROM project_numbers pn WHERE pn.project_id = p.id) < 2
  ORDER BY p.updated_at DESC`;

async function main() {
  const client = new Client(dbCfg);
  await client.connect();
  try {
    console.error(`[check] 接続先 DB: ${dbCfg.database || '(connectionString)'} ${isProd ? '⚠️  本番' : '(検証/その他)'}`);

    const kessanRows = (await client.query(SQL_KESSAN)).rows;
    const generalRows = (await client.query(SQL_GENERAL)).rows;
    const harmRows = (await client.query(SQL_CONFIRMED_HARM)).rows;
    // 一般形からkessan分を除いた「決算取込以外」の行だけ
    const kessanIds = new Set(kessanRows.map((r) => r.id));
    const otherRows = generalRows.filter((r) => !kessanIds.has(r.id));

    const enrich = async (rows) => {
      const out = [];
      for (const r of rows) {
        const history = (await client.query(SQL_ANY_HISTORY, [r.id])).rows;
        out.push({ ...r, number_history: history, history_count: history.length });
      }
      return out;
    };

    const kessanEnriched = await enrich(kessanRows);
    const otherEnriched = await enrich(otherRows);
    const harmEnriched = await enrich(harmRows);

    if (JSON_OUT) {
      console.log(JSON.stringify(
        { database: dbCfg.database, isProd, confirmed_harm: harmEnriched, at_risk_kessan: kessanEnriched, at_risk_other: otherEnriched },
        null, 2,
      ));
      return;
    }

    const printRows = (rows, fmt) => {
      for (const r of rows) {
        console.log(fmt(r));
        if (r.history_count === 0) {
          console.log(`    project_numbers: 0件（一度も記録されたことがない）`);
        } else {
          console.log(`    project_numbers: ${r.history_count}件 ↓`);
          for (const h of r.number_history) {
            console.log(`      number=${h.number} scheme=${h.scheme} retired_at=${h.retired_at ?? '(現役)'} reason=${h.reason ?? '-'}`);
          }
        }
      }
    };

    console.log(`\n③【本命】旧番号が実際に失われた疑いが濃い案件: ${harmEnriched.length} 件`);
    printRows(harmEnriched, (r) => `  - 現在の番号=${r.current_number}  id=${r.id}  code=${r.code}  marker=${r.kessan_marker}  name=${r.name}\n` +
      `    updated_at=${r.updated_at}  entity_note=${r.entity_note ?? '-'}`);
    if (harmEnriched.length === 0) console.log('  (該当なし＝現時点で確認できる実害なし)');

    console.log(`\n① 決算取込 (kessan_marker) 起因・まだ改番されていないが要バックフィル: ${kessanEnriched.length} 件`);
    printRows(kessanEnriched, (r) => `  - ${r.gls_number}  id=${r.id}  code=${r.code}  marker=${r.kessan_marker}  name=${r.name}\n` +
      `    updated_at=${r.updated_at}  entity_source=${r.entity_source ?? '-'}`);
    if (kessanEnriched.length === 0) console.log('  (該当なし)');

    console.log(`\n② 決算取込以外の出どころで同じ穴に落ちている案件: ${otherEnriched.length} 件`);
    printRows(otherEnriched, (r) => `  - ${r.gls_number}  id=${r.id}  code=${r.code}  kessan_marker=${r.kessan_marker ?? '(null=決算取込以外)'}  name=${r.name}\n` +
      `    updated_at=${r.updated_at}`);
    if (otherEnriched.length === 0) console.log('  (該当なし)');
    console.log('');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[check] failed:', err.message);
  process.exit(1);
});
