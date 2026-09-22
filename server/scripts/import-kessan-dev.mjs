#!/usr/bin/env node
/**
 * import-kessan-dev.mjs
 *
 * 決算データ (freee 総勘定元帳 CSV / ローカルファイル) を ONAiR の予算管理・案件管理
 * テーブルへ取り込む【検証(dev)専用】ワンオフ インポータ。
 *
 *   - 販管費 (sga_expenses)  : 7xxx 勘定科目 → そのまま (project 不要)
 *   - 売上   (revenues)      : 5000 売上高   → GLS(案件) + 顧客 に紐付け
 *   - 仕入   (purchases)     : 6xxx 売上原価 → GLS(案件) + 取引先 に紐付け (複数GLSは均等按分)
 *
 * 二重計上防止: 総勘定元帳は複式簿記のため「勘定科目」列が P/L 科目 (5/6/7xxx)
 *               の行(=各科目の元帳行)のみを採用する。貸借科目(現預金/売掛/未払
 *               /消費税)の行は相手科目に P/L が出ても採用しない。
 *
 * 冪等性: commit 時はまず当月マーカー `[kessan:<period>]` の既存行を削除してから
 *         挿入し直す (dev のみ・手入力データには触れない)。
 *
 * SAFETY:
 *   - DB 名が prod っぽい場合は実行拒否
 *   - 既定は dry-run (--commit で実書き込み)
 *   - 売上/仕入で案件/顧客/取引先が未登録の場合、--create-masters 指定時のみ新規作成
 *
 * Usage (VPS / app_dev コンテナ内):
 *   # まず dry-run で内容確認 (既定 scope=sga)
 *   docker exec -it gmo-onair-app_dev-1 node /app/server/scripts/import-kessan-dev.mjs --file=/path/to/gl.csv
 *   # 販管費を投入
 *   docker exec -it gmo-onair-app_dev-1 node /app/server/scripts/import-kessan-dev.mjs --file=/path/to/gl.csv --scope=sga --commit
 *   # 全部 (案件/顧客/取引先も新規作成しつつ) 投入
 *   docker exec -it gmo-onair-app_dev-1 node /app/server/scripts/import-kessan-dev.mjs --file=/path/to/gl.csv --scope=all --create-masters --commit
 *
 * 必須 env: (DATABASE_URL | DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME)
 * 必須 flag: --file=<path> (freee 総勘定元帳 CSV)
 * 任意 flag: --period=YYYY-MM (既定: GL の最頻取引月)
 */

import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { Client } = pg;

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
const EXCLUDE_FIXED = hasFlag('--exclude-fixed-cogs'); // 既定: GLS無しの固定原価は固定原価プロジェクトへ計上
const FIXED_CODE = 'FIXED-COGS';
const FIXED_NAME = '固定原価（スタジオ償却負担額等）';
const FIXED_CUSTOMER = '（固定費・社内）';
const SCOPE = getOpt('--scope', 'sga'); // sga | revenues | purchases | all
const FILE_PATH = getOpt('--file', '');
if (!FILE_PATH) {
  console.error('[kessan] --file=<path> でCSVファイルを指定してください。');
  process.exit(2);
}
const NO_DB = hasFlag('--no-db'); // DB に接続せず抽出サマリのみ表示 (パース検証用)
let PERIOD = getOpt('--period', ''); // YYYY-MM (空なら自動判定)
const SCOPES = SCOPE === 'all' ? ['sga', 'revenues', 'purchases'] : [SCOPE];

// ============================================================
// DB 設定 + prod ガード
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
if (dbLabel.includes('prod') || dbLabel.includes('production')) {
  console.error(`[kessan] REFUSING: database "${dbLabel}" looks like production. 本スクリプトは検証(dev)専用です。`);
  process.exit(2);
}

// ============================================================
// CSV パーサ (引用符・セル内改行・"" エスケープ・CRLF 対応)
// ============================================================
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ============================================================
// 変換ヘルパ
// ============================================================
const toInt = (s) => {
  const n = parseInt(String(s ?? '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};
const normDate = (s) => String(s ?? '').trim().replace(/\//g, '-').slice(0, 10);
const acct = (s) => {
  const m = String(s ?? '').trim().match(/^(\d+)\s+(.*)$/);
  return m ? { code: parseInt(m[1], 10), name: m[2].trim() } : { code: NaN, name: String(s ?? '').trim() };
};
const firstNonEmpty = (...xs) => xs.map((x) => String(x ?? '').trim()).find((x) => x.length > 0) || '';
function parseGls(memo) {
  const out = [];
  const re = /GLS(\d+(?:,\d+)*)/g;
  let m;
  while ((m = re.exec(String(memo ?? '')))) for (const n of m[1].split(',')) out.push('GLS' + n.trim());
  return [...new Set(out)];
}
function stripGlsName(memo) {
  const nm = String(memo ?? '')
    .replace(/(仕入|売上)?GLS\d+(?:,\d+)*/g, '')
    .replace(/XP\d+/g, '')
    .replace(/^[\s/、,]+/, '')
    .trim();
  return (nm || String(memo ?? '').trim()).slice(0, 80);
}
function mapTax(z) {
  const s = String(z ?? '');
  if (s.includes('8%') || s.includes('軽')) return 'tax8';
  if (s.includes('対象外') || s.includes('非課税') || s.includes('不課税')) return 'exempt';
  if (s.includes('10%') || s.includes('課')) return 'tax10';
  return 'tax10';
}
const invQualified = (...xs) => {
  const s = xs.map((x) => String(x ?? '')).join(' ');
  if (s.includes('80%') || s.includes('非適格') || s.includes('50%')) return 0;
  return 1; // 既定は適格 (適格表記/空)
};
const yen = (n) => '¥' + Number(n).toLocaleString();

// ============================================================
// メイン
// ============================================================
async function main() {
  console.log(`[kessan] mode=${COMMIT ? 'COMMIT' : 'DRY-RUN'} scope=${SCOPES.join(',')} createMasters=${CREATE_MASTERS} db=${dbLabel}`);

  // --- GL 取得 + パース ---
  console.log(`[kessan] ${FILE_PATH} を読み込み中...`);
  const csv = readFileSync(FILE_PATH, 'utf8');
  const rows = parseCsv(csv);
  const header = rows[0];
  const idx = (name) => header.indexOf(name);
  const C = {
    no: idx('取引No'), date: idx('取引日'), acct: idx('勘定科目'), sub: idx('補助科目'),
    partner: idx('取引先'), tax: idx('税区分'), inv: idx('インボイス'),
    cacct: idx('相手勘定科目'), csub: idx('相手補助科目'),
    cpartner: idx('相手取引先'), ctax: idx('相手税区分'), cinv: idx('相手インボイス'),
    memo: idx('摘要'), debit: idx('借方金額'), credit: idx('貸方金額'),
  };
  // freee は取引先名を「相手補助科目」(先頭にコード) に持つことが多い。コードを除去して名称化。
  const stripCode = (s) => String(s ?? '').trim().replace(/^\d+\s+/, '').trim();
  const party = (r) => stripCode(firstNonEmpty(r[C.csub], r[C.cpartner], r[C.partner]));
  const data = rows.slice(1).filter((r) => r.length > C.credit && String(r[C.no] ?? '').trim());
  console.log(`[kessan] データ行 ${data.length} 件`);

  // period 自動判定 (取引月の最頻値)
  if (!PERIOD) {
    const counts = {};
    for (const r of data) {
      const ym = normDate(r[C.date]).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) counts[ym] = (counts[ym] || 0) + 1;
    }
    PERIOD = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '0000-00';
  }
  const MARKER = `[kessan:${PERIOD}]`;
  console.log(`[kessan] 対象期間 period=${PERIOD}  マーカー=${MARKER}`);

  // --- 抽出 (勘定科目列が P/L 科目の行のみ) ---
  const sga = [], rev = [], pur = [];
  const unassignedPur = [];
  for (const r of data) {
    const a = acct(r[C.acct]);
    if (!Number.isFinite(a.code)) continue;
    const debit = toInt(r[C.debit]);
    const credit = toInt(r[C.credit]);
    const memo = r[C.memo] ?? '';
    const sub = r[C.sub] ?? '';
    const date = normDate(r[C.date]);
    const tax = mapTax(r[C.tax]);
    const no = String(r[C.no] ?? '').trim();

    if (a.code >= 7000 && a.code <= 7999) {
      const amount = debit - credit; // 費用は借方+、戻しは-
      if (amount === 0) continue;
      sga.push({
        no, date, amount, tax_category: tax,
        invoice_qualified: invQualified(r[C.inv], r[C.cinv]),
        vendor_name: party(r) || `（${a.name}）`,
        description: [a.name, sub, memo].map((x) => String(x ?? '').trim()).filter(Boolean).join(' / ').slice(0, 240),
      });
    } else if (a.code === 5000) {
      const amount = credit - debit; // 売上は貸方+
      if (amount === 0) continue;
      const gls = parseGls(memo);
      rev.push({
        no, date, amount, tax_category: tax,
        customer_name: party(r) || '(顧客不明)',
        gls: gls[0] || null,
        project_name: stripGlsName(memo),
        memo: String(memo).trim(),
      });
    } else if (a.code >= 6000 && a.code <= 6999) {
      const amount = debit - credit; // 原価は借方+
      if (amount === 0) continue;
      const gls = parseGls(memo);
      const base = {
        no, date, tax_category: tax,
        invoice_qualified: invQualified(r[C.inv], r[C.cinv]),
        vendor_name: party(r) || `（${a.name}）`,
        description: [a.name, sub, memo].map((x) => String(x ?? '').trim()).filter(Boolean).join(' / ').slice(0, 240),
      };
      if (gls.length === 0) {
        unassignedPur.push({ ...base, amount, reason: 'GLSなし' });
      } else {
        // 複数GLSは均等按分 (端数は先頭に寄せる)
        const per = Math.floor(amount / gls.length);
        const rem = amount - per * gls.length;
        gls.forEach((g, i) => pur.push({ ...base, gls: g, amount: per + (i === 0 ? rem : 0), split: gls.length }));
      }
    }
  }

  const sum = (arr) => arr.reduce((s, x) => s + x.amount, 0);
  console.log('\n========== 抽出サマリ ==========');
  console.log(`販管費(7xxx): ${sga.length} 件 / 合計 ${yen(sum(sga))}`);
  console.log(`売上(5000)  : ${rev.length} 件 / 合計 ${yen(sum(rev))}`);
  console.log(`仕入(6xxx)  : ${pur.length} 件 / 合計 ${yen(sum(pur))}` +
              (unassignedPur.length
                ? `  ＋GLS無し固定原価 ${unassignedPur.length} 件 ${yen(sum(unassignedPur))} → ${EXCLUDE_FIXED ? '除外' : `「${FIXED_NAME}」(${FIXED_CODE}) へ計上`}`
                : ''));

  if (NO_DB) {
    console.log('\n[kessan] --no-db: DB 接続せず抽出サマリのみ。サンプル:');
    sga.slice(0, 8).forEach((x) => console.log(`  [販管費] ${x.date} ${yen(x.amount)} ${x.tax_category} ${x.vendor_name} | ${x.description.slice(0, 80)}`));
    rev.forEach((x) => console.log(`  [売上] ${x.date} ${yen(x.amount)} ${x.tax_category} ${x.gls || 'GLS?'} ${x.customer_name} | ${x.project_name}`));
    pur.slice(0, 10).forEach((x) => console.log(`  [仕入] ${x.date} ${yen(x.amount)} ${x.tax_category} ${x.gls}${x.split > 1 ? `(1/${x.split})` : ''} ${x.vendor_name}`));
    if (unassignedPur.length) {
      console.log(`  -- GLS無し固定原価 (${EXCLUDE_FIXED ? '除外' : `${FIXED_CODE} へ計上`}) --`);
      unassignedPur.slice(0, 10).forEach((x) => console.log(`  [固定原価] ${x.date} ${yen(x.amount)} ${x.vendor_name} | ${x.description.slice(0, 80)}`));
    }
    return;
  }

  // --- DB 接続 ---
  const client = new Client(dbCfg);
  await client.connect();
  try {
    // 案件作成に使う担当ユーザー
    let userId = null;
    const u = await client.query('SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1');
    userId = u.rows[0]?.id || null;

    // projects.customer_id / purchases.vendor_id は companies.id を直接指す。
    // Phase 3-3-9（`customers`/`vendors` テーブル削除）以降、この dev 専用
    // インポータも companies だけを見る（company-directory.service.ts の
    // createCustomerRecord/createVendorRecord と同じ形）。
    const masterCache = { customers: new Map(), vendors: new Map(), projects: new Map() };
    async function findCustomer(name) {
      if (masterCache.customers.has(name)) return masterCache.customers.get(name);
      const r = await client.query('SELECT id FROM companies WHERE is_customer = TRUE AND name=$1 AND deleted_at IS NULL LIMIT 1', [name]);
      const id = r.rows[0]?.id || null;
      masterCache.customers.set(name, id);
      return id;
    }
    async function findVendor(name) {
      if (masterCache.vendors.has(name)) return masterCache.vendors.get(name);
      const r = await client.query('SELECT id FROM companies WHERE is_vendor = TRUE AND name=$1 AND deleted_at IS NULL LIMIT 1', [name]);
      const id = r.rows[0]?.id || null;
      masterCache.vendors.set(name, id);
      return id;
    }
    async function findProject(gls) {
      if (masterCache.projects.has(gls)) return masterCache.projects.get(gls);
      const r = await client.query('SELECT id, customer_id FROM projects WHERE gls_number=$1 AND deleted_at IS NULL LIMIT 1', [gls]);
      const v = r.rows[0] || null;
      masterCache.projects.set(gls, v);
      return v;
    }

    // ---- 事前照合レポート (dry-run/commit 共通) ----
    if (SCOPES.includes('revenues') || SCOPES.includes('purchases')) {
      const glsNeeded = new Set([...rev.filter((x) => x.gls).map((x) => x.gls), ...pur.map((x) => x.gls)]);
      const missingProj = [];
      for (const g of glsNeeded) if (!(await findProject(g))) missingProj.push(g);
      const custNeeded = new Set(rev.map((x) => x.customer_name));
      const missingCust = [];
      for (const c of custNeeded) if (!(await findCustomer(c))) missingCust.push(c);
      console.log('\n========== マスタ照合 ==========');
      console.log(`必要案件(GLS) ${glsNeeded.size} 件中 未登録 ${missingProj.length}: ${missingProj.join(', ') || '—'}`);
      console.log(`必要顧客 ${custNeeded.size} 件中 未登録 ${missingCust.length}: ${missingCust.slice(0, 20).join(', ') || '—'}`);
      if ((missingProj.length || missingCust.length) && !CREATE_MASTERS) {
        console.log('  → 未登録マスタがあります。--create-masters を付けると自動作成します (dev)。');
      }
      const revNoGls = rev.filter((x) => !x.gls);
      if (revNoGls.length) console.log(`  ⚠ 売上で GLS 未抽出 ${revNoGls.length} 件 (案件紐付け不可)`);
    }

    if (!COMMIT) {
      console.log('\n[kessan] DRY-RUN のため DB 書き込みは行いません。サンプルを表示します。');
      if (SCOPES.includes('sga')) sga.slice(0, 8).forEach((x) => console.log(`  [販管費] ${x.date} ${yen(x.amount)} ${x.tax_category} ${x.vendor_name} | ${x.description}`));
      if (SCOPES.includes('revenues')) rev.slice(0, 12).forEach((x) => console.log(`  [売上] ${x.date} ${yen(x.amount)} ${x.tax_category} ${x.gls || 'GLS?'} ${x.customer_name} | ${x.project_name}`));
      if (SCOPES.includes('purchases')) pur.slice(0, 10).forEach((x) => console.log(`  [仕入] ${x.date} ${yen(x.amount)} ${x.tax_category} ${x.gls}${x.split > 1 ? `(1/${x.split}按分)` : ''} ${x.vendor_name}`));
      await client.end();
      console.log('\n[kessan] DRY-RUN 完了。実投入は --commit を付けて再実行してください。');
      return;
    }

    if (!userId && (SCOPES.includes('revenues') || SCOPES.includes('purchases'))) {
      throw new Error('案件作成に必要な users が見つかりません。先に dev をシードしてください。');
    }

    await client.query('BEGIN');
    const counts = { sga: 0, rev: 0, pur: 0, projCreated: 0, projRevived: 0, custCreated: 0, vendCreated: 0, skipped: 0 };

    // Phase 3-3-9（`customers`/`vendors` テーブル削除）以降、`companies` に
    // 行を作るだけでよい（返すのは companies.id — customer_id/vendor_id 系の
    // FKはそちらを直接指す）。
    async function ensureCustomer(name) {
      let id = await findCustomer(name);
      if (id) return id;
      if (!CREATE_MASTERS) return null;
      const companyId = randomUUID();
      await client.query(
        'INSERT INTO companies (id, name, notes, is_customer, is_gmo_group, created_by) VALUES ($1,$2,$3,TRUE,FALSE,$4)',
        [companyId, name, MARKER, userId]
      );
      masterCache.customers.set(name, companyId); counts.custCreated++;
      return companyId;
    }
    async function ensureVendor(name) {
      let id = await findVendor(name);
      if (id) return id;
      if (!CREATE_MASTERS) return null;
      const companyId = randomUUID();
      await client.query(
        'INSERT INTO companies (id, name, notes, is_vendor, is_gmo_group, created_by) VALUES ($1,$2,$3,TRUE,FALSE,$4)',
        [companyId, name, MARKER, userId]
      );
      masterCache.vendors.set(name, companyId); counts.vendCreated++;
      return companyId;
    }
    async function ensureProject(key, name, customerId, isFixed = false) {
      const cacheKey = isFixed ? `__fixed__${key}` : key;
      // キャッシュ命中でも null (= 事前照合レポートで「未登録」と記録された値) の場合は
      // ここで作成/復活を試みる必要があるため early-return しない
      // (kessan-import.service.ts の ensureProject と同じ挙動。ここを .has() にすると
      // --create-masters を指定しても事前照合でキャッシュされた null がそのまま
      // 返ってしまい、いつまでも新規作成・復活の対象にならない)。
      const cached = masterCache.projects.get(cacheKey);
      if (cached) return cached;
      const col = isFixed ? 'code' : 'gls_number';
      const r = await client.query(`SELECT id, customer_id FROM projects WHERE ${col}=$1 AND deleted_at IS NULL LIMIT 1`, [key]);
      let p = r.rows[0] || null;
      if (!p) {
        if (!CREATE_MASTERS) { masterCache.projects.set(cacheKey, null); return null; }

        // 失注・放置ネタの自動整理 (project-purge.service.ts) で論理削除された案件が、
        // 決算データ上はこの code/gls_number の実績を持っていた、というケースがある。
        // projects.code / gls_number は deleted_at を見ない素の UNIQUE 制約のため、
        // 削除済み行を無視してこのまま INSERT すると duplicate key で失敗する
        // (kessan-import.service.ts と同一ロジック)。復活させて使う。
        // 改番済み（旧GLS番号→SCS-/GSS-/GMO-）の案件がその後パージされている場合、
        // 元帳には退役した旧番号のまま残っていることがある。project_numbers
        // 経由でも引けるようにしないと、旧番号を永続的に持つはずの削除済み案件を
        // 見逃して重複案件を作ってしまう (Codex レビュー指摘・PR #713)。
        const dead = await client.query(
          isFixed
            ? `SELECT id, customer_id FROM projects WHERE code=$1 AND deleted_at IS NOT NULL LIMIT 1`
            : `SELECT id, customer_id FROM projects
                 WHERE (code=$1 OR gls_number=$1 OR id = (SELECT project_id FROM project_numbers WHERE number=$1))
                   AND deleted_at IS NOT NULL LIMIT 1`,
          [key],
        );
        if (dead.rows[0]) {
          const rid = dead.rows[0].id;
          // stage も新規作成パスと同じ 'a_won' に戻す (Codex レビュー指摘・PR #713)。
          // 削除時点の stage (e_lost・放置 neta) のままだと project-purge.service.ts の
          // PURGE_JUNK_STAGE_SQL に該当し続け、決算取込で入る revenues は invoice_issued
          // を立てないため PURGE_HAS_MONEY_SQL の対象にもならず、次回の自動整理で
          // この案件と今入れた売上がまた一緒に削除されてしまう。
          await client.query(`UPDATE projects SET deleted_at = NULL, stage = 'a_won', updated_at = NOW() WHERE id = $1`, [rid]);
          p = { id: rid, customer_id: dead.rows[0].customer_id };
          counts.projRevived = (counts.projRevived || 0) + 1;
        } else {
          const id = randomUUID();
          await client.query(
            `INSERT INTO projects (id, code, gls_number, name, customer_id, stage, assigned_to, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,'a_won',$6,$7,$8)`,
            [id, key, isFixed ? null : key, name || key, customerId, userId, MARKER, userId]
          );
          p = { id, customer_id: customerId };
          counts.projCreated++;
        }
      }
      masterCache.projects.set(cacheKey, p);
      return p;
    }

    // 冪等性: 当月マーカーの既存行を削除して入れ直す (dev のみ)
    if (SCOPES.includes('sga')) {
      await client.query(`DELETE FROM sga_expenses WHERE notes LIKE $1`, [`${MARKER}%`]);
      for (const x of sga) {
        await client.query(
          `INSERT INTO sga_expenses (id, billing_key, vendor_name, description, amount, tax_category,
             invoice_qualified, expense_type, source, recognition_date, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'spot','accounting',$8,$9,$10)`,
          [randomUUID(), `KESSAN-${PERIOD}-${x.no}`, x.vendor_name, x.description, x.amount,
           x.tax_category, x.invoice_qualified, x.date, `${MARKER} ${x.no}`, userId]
        );
        counts.sga++;
      }
    }

    if (SCOPES.includes('revenues')) {
      await client.query(`DELETE FROM revenues WHERE notes LIKE $1`, [`${MARKER}%`]);
      for (const x of rev) {
        if (!x.gls) { counts.skipped++; continue; }
        const customerId = await ensureCustomer(x.customer_name);
        if (!customerId) { counts.skipped++; continue; }
        const proj = await ensureProject(x.gls, x.project_name, customerId);
        if (!proj) { counts.skipped++; continue; }
        await client.query(
          `INSERT INTO revenues (id, billing_key, project_id, customer_id, tax_category, amount,
             recognition_date, status, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed',$8,$9)`,
          [randomUUID(), `KESSAN-${PERIOD}-REV-${x.no}`, proj.id, proj.customer_id || customerId,
           x.tax_category, x.amount, x.date, `${MARKER} ${x.no} ${x.memo}`.slice(0, 240), userId]
        );
        counts.rev++;
      }
    }

    if (SCOPES.includes('purchases')) {
      await client.query(`DELETE FROM purchases WHERE notes LIKE $1`, [`${MARKER}%`]);
      for (const x of pur) {
        const proj = await ensureProject(x.gls, x.gls, null);
        if (!proj) { counts.skipped++; continue; }
        const vendorId = await ensureVendor(x.vendor_name);
        if (!vendorId) { counts.skipped++; continue; }
        await client.query(
          `INSERT INTO purchases (id, project_id, vendor_id, tax_category, invoice_qualified, amount,
             description, recognition_date, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [randomUUID(), proj.id, vendorId, x.tax_category, x.invoice_qualified, x.amount,
           x.description, x.date, `${MARKER} ${x.no}${x.split > 1 ? ` (1/${x.split}按分)` : ''}`.slice(0, 240), userId]
        );
        counts.pur++;
      }
      // GLS無しの固定原価 → 固定原価プロジェクトへ計上 (既定)
      if (!EXCLUDE_FIXED && unassignedPur.length) {
        const fixedCust = await ensureCustomer(FIXED_CUSTOMER);
        const fixedProj = fixedCust ? await ensureProject(FIXED_CODE, FIXED_NAME, fixedCust, true) : null;
        if (!fixedProj) {
          console.log(`  ⚠ 固定原価プロジェクトを作成できません (--create-masters 未指定?) → ${unassignedPur.length} 件スキップ`);
          counts.skipped += unassignedPur.length;
        } else {
          for (const x of unassignedPur) {
            const vendorId = await ensureVendor(x.vendor_name);
            if (!vendorId) { counts.skipped++; continue; }
            await client.query(
              `INSERT INTO purchases (id, project_id, vendor_id, tax_category, invoice_qualified, amount,
                 description, recognition_date, notes, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [randomUUID(), fixedProj.id, vendorId, x.tax_category, x.invoice_qualified, x.amount,
               x.description, x.date, `${MARKER} ${x.no} [固定原価]`.slice(0, 240), userId]
            );
            counts.pur++;
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log('\n========== 投入結果 (COMMIT) ==========');
    console.log(`販管費 ${counts.sga} / 売上 ${counts.rev} / 仕入 ${counts.pur}`);
    console.log(`新規作成: 案件 ${counts.projCreated} / 顧客 ${counts.custCreated} / 取引先 ${counts.vendCreated}`);
    if (counts.projRevived) console.log(`復活: 失注等で削除済みだったが決算データに実績があった案件 ${counts.projRevived} 件`);
    if (counts.skipped) console.log(`スキップ ${counts.skipped} 件 (マスタ未作成 / GLS未抽出)`);
    console.log('[kessan] 完了。');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[kessan] error:', err);
  process.exit(1);
});
