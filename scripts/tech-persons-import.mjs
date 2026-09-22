#!/usr/bin/env node
/**
 * 技術人員（qsheet_tech_persons）の一度きりの取り込み
 *
 * 背景・決めごとは docs/design/v4/tech-docs.md §9-2、使い方は docs/ops/tech-persons-import.md。
 *
 * ⚠️ **氏名は個人情報**。入力ファイル（BOX から抽出した JSON／人が作る CSV）は
 *    このリポジトリに絶対にコミットしない（.gitignore の対象外の場所に置く場合は
 *    自分で気をつけること。scratchpad などリポジトリの外に置くのが安全）。
 * ⚠️ migration にも seed にも入れない。このスクリプトを管理者が手元で
 *    onair_dev → （指示があれば）onair_prod の順に直接回す。
 *
 * 使い方:
 *   node scripts/tech-persons-import.mjs --input <file.json|file.csv> [--dry-run] [--database-url <url>]
 *
 * 入力（JSON・BOX の抽出フォーマット）:
 *   { "sheets": [ { "fileId", "name", "event", "dates": ["YYYY-MM-DD"], "company",
 *                    "issueDate", "rows": [ { "role", "name", "day" } ] } ] }
 *
 * 入力（CSV・人が用意する代替。ヘッダー行必須）:
 *   company,name,kana,roles
 *   株式会社ヌーベルバーグ,山田 太郎,ヤマダ タロウ,SW|CAM
 *
 * 振る舞い:
 *   - 氏名の全角/半角スペースを半角1つに正規化し前後を trim。空になった行は捨てる
 *   - 役職が「社内業務」（研修）の行は捨てる
 *   - JSON は (event, dates) が同じシート同士を「同じ回の改訂」とみなし、
 *     発行日 (issueDate) が新しいほう（同着なら (ver2)/(Ver2) の付くほう）だけを採用する
 *   - (会社, 氏名) ごとに役職を頻度順に集約し qsheet_tech_persons.main_roles に入れる
 *   - 会社は名前の完全一致で照合。無ければ作る（short_name は 株式会社/有限会社 を削った形）
 *   - 人は (会社, 氏名) の一致で照合。無ければ作る。あれば main_roles だけ更新し、
 *     kana・active・note は既にある値を上書きしない（note に「取り込み: n 回」のような
 *     文言も書かない。参加回数は qsheet_tech_staff_rows から数える設計 — §9-2）
 *   - 削除は一切しない
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const TRAINING_ROLE = '社内業務';

// ── 引数 ──────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { input: null, dryRun: false, databaseUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--database-url') args.databaseUrl = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else {
      console.error(`不明な引数です: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function printHelp() {
  console.log(`使い方: node scripts/tech-persons-import.mjs --input <file.json|file.csv> [--dry-run] [--database-url <url>]

  --input <file>         BOX 抽出の JSON、または company,name,kana,roles の CSV
  --dry-run              書き込まない。何が起きるかだけ表示する
  --database-url <url>   省略時は環境変数 DATABASE_URL を使う
`);
}

// ── 氏名の正規化 ──────────────────────────────────────────

function normalizeName(raw) {
  if (raw == null) return '';
  let s = String(raw);
  s = s.replace(/　/g, ' '); // 全角スペース → 半角
  s = s.replace(/\s+/g, ' ');    // 連続する空白 → 1つ
  return s.trim();
}

function shortNameOf(companyName) {
  return companyName.replace(/^(株式会社|有限会社)/, '').trim() || companyName;
}

// ── 集約 ──────────────────────────────────────────────────

/**
 * @returns {Map<string, { company: string, name: string,
 *   roleCounts: Map<string, number>, roleFirstSeen: Map<string, number>,
 *   events: Set<string>, lastDay: string|null }>}
 */
function newAggregate() {
  return new Map();
}

function personKey(company, name) {
  return `${company}\u0000${name}`;
}

function addRow(agg, seq, { company, name, role, event, day }) {
  const key = personKey(company, name);
  let entry = agg.get(key);
  if (!entry) {
    entry = { company, name, roleCounts: new Map(), roleFirstSeen: new Map(), events: new Set(), lastDay: null };
    agg.set(key, entry);
  }
  if (role) {
    entry.roleCounts.set(role, (entry.roleCounts.get(role) || 0) + 1);
    if (!entry.roleFirstSeen.has(role)) entry.roleFirstSeen.set(role, seq.n++);
  }
  if (event) entry.events.add(event);
  if (day && (!entry.lastDay || day > entry.lastDay)) entry.lastDay = day;
}

function mainRolesOrdered(entry) {
  return [...entry.roleCounts.entries()]
    .sort((a, b) => (b[1] - a[1]) || (entry.roleFirstSeen.get(a[0]) - entry.roleFirstSeen.get(b[0])))
    .map(([role]) => role);
}

// ── JSON（BOX 抽出）の読み込み ────────────────────────────

function sheetGroupKey(sheet) {
  const dates = [...(sheet.dates || [])].sort();
  return `${sheet.event || ''}|${JSON.stringify(dates)}`;
}

function isVer2(sheetName) {
  return /\((ver2|Ver2)\)/i.test(sheetName || '');
}

/** 同じ (event, dates) のシートが複数あれば、発行日が新しいほう（同着は (ver2) が付くほう）だけ残す */
function pickWinningSheets(sheets) {
  const groups = new Map();
  for (const sheet of sheets) {
    const key = sheetGroupKey(sheet);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sheet);
  }
  const winners = [];
  const supersededRowCount = { count: 0 };
  for (const group of groups.values()) {
    if (group.length === 1) {
      winners.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      const ad = a.issueDate || '';
      const bd = b.issueDate || '';
      if (ad !== bd) return ad < bd ? 1 : -1; // issueDate 新しい順
      return (isVer2(b.name) ? 1 : 0) - (isVer2(a.name) ? 1 : 0); // 同着は (ver2) を勝たせる
    });
    winners.push(sorted[0]);
    for (const loser of sorted.slice(1)) supersededRowCount.count += (loser.rows || []).length;
  }
  return { winners, supersededRowCount: supersededRowCount.count };
}

function loadFromJson(json) {
  const agg = newAggregate();
  const seq = { n: 0 };
  const skipped = { training: 0, emptyName: 0, superseded: 0 };

  const sheets = Array.isArray(json.sheets) ? json.sheets : [];
  const { winners, supersededRowCount } = pickWinningSheets(sheets);
  skipped.superseded = supersededRowCount;

  for (const sheet of winners) {
    const company = (sheet.company || '').trim();
    const event = sheet.event || '';
    const fallbackDay = (sheet.dates && sheet.dates[0]) || null;
    for (const row of sheet.rows || []) {
      const role = (row.role || '').trim();
      if (role === TRAINING_ROLE) { skipped.training++; continue; }
      const name = normalizeName(row.name);
      if (!name) { skipped.emptyName++; continue; }
      const day = row.day || fallbackDay;
      addRow(agg, seq, { company, name, role, event, day });
    }
  }
  return { agg, skipped };
}

// ── CSV（人が用意する代替）の読み込み ─────────────────────

/** 簡易 CSV パーサ（ダブルクォート対応・改行はクォート内のみ許容） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function loadFromCsv(text) {
  const agg = newAggregate();
  const seq = { n: 0 };
  const skipped = { training: 0, emptyName: 0, superseded: 0 };

  const rows = parseCsv(text);
  if (rows.length === 0) return { agg, skipped };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {
    company: header.indexOf('company'),
    name: header.indexOf('name'),
    kana: header.indexOf('kana'),
    roles: header.indexOf('roles'),
  };
  if (idx.company === -1 || idx.name === -1) {
    throw new Error('CSV のヘッダーに company・name が必要です（例: company,name,kana,roles）');
  }

  for (const r of rows.slice(1)) {
    if (r.every((c) => c.trim() === '')) continue;
    const company = (r[idx.company] || '').trim();
    const name = normalizeName(r[idx.name]);
    if (!name) { skipped.emptyName++; continue; }
    const rolesRaw = idx.roles >= 0 ? (r[idx.roles] || '') : '';
    const roles = rolesRaw.split('|').map((s) => s.trim()).filter(Boolean);
    const key = personKey(company, name);
    if (!agg.has(key)) {
      agg.set(key, { company, name, roleCounts: new Map(), roleFirstSeen: new Map(), events: new Set(), lastDay: null, kana: idx.kana >= 0 ? (r[idx.kana] || '').trim() : '' });
    }
    const entry = agg.get(key);
    // CSV は「役職の並び順＝優先度」とみなし、前に書かれた役職ほど重みを大きくする
    roles.forEach((role, i) => {
      if (role === TRAINING_ROLE) return;
      entry.roleCounts.set(role, (entry.roleCounts.get(role) || 0) + (roles.length - i));
      if (!entry.roleFirstSeen.has(role)) entry.roleFirstSeen.set(role, seq.n++);
    });
  }
  return { agg, skipped };
}

// ── DB ────────────────────────────────────────────────────

async function findCompanyId(client, name) {
  const { rows } = await client.query(
    `SELECT id FROM qsheet_tech_companies WHERE name = $1 AND deleted_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 1`,
    [name],
  );
  return rows[0]?.id ?? null;
}

async function createCompany(client, name) {
  const id = crypto.randomUUID();
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM qsheet_tech_companies`,
  );
  const sortOrder = rows[0]?.next ?? 1;
  await client.query(
    `INSERT INTO qsheet_tech_companies (id, name, short_name, sort_order) VALUES ($1, $2, $3, $4)`,
    [id, name, shortNameOf(name), sortOrder],
  );
  return id;
}

async function findPerson(client, companyId, name) {
  const { rows } = await client.query(
    `SELECT id, main_roles FROM qsheet_tech_persons WHERE tech_company_id = $1 AND name = $2 AND deleted_at IS NULL ORDER BY created_at ASC, id ASC LIMIT 1`,
    [companyId, name],
  );
  return rows[0] ?? null;
}

async function createPerson(client, companyId, name, roles, kana) {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO qsheet_tech_persons (id, tech_company_id, name, kana, main_roles) VALUES ($1, $2, $3, $4, $5)`,
    [id, companyId, name, kana || '', roles],
  );
  return id;
}

/** 既存の main_roles と今回の集約を合わせ、頻度順に並べ直す（既存を先頭寄りに扱う） */
function mergeMainRoles(existingRoles, entry) {
  const weight = new Map();
  const existing = existingRoles || [];
  existing.forEach((role, i) => {
    weight.set(role, (weight.get(role) || 0) + (existing.length - i) * 1000); // 既存を優先
  });
  for (const [role, count] of entry.roleCounts.entries()) {
    weight.set(role, (weight.get(role) || 0) + count);
  }
  const order = [...existing];
  for (const role of entry.roleCounts.keys()) if (!order.includes(role)) order.push(role);
  return order.sort((a, b) => (weight.get(b) - weight.get(a)));
}

async function updatePersonRoles(client, personId, roles) {
  await client.query(
    `UPDATE qsheet_tech_persons SET main_roles = $2, updated_at = NOW() WHERE id = $1`,
    [personId, roles],
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) { printHelp(); process.exit(args.help ? 0 : 1); }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`入力ファイルが見つかりません: ${inputPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const ext = path.extname(inputPath).toLowerCase();

  let agg, skipped;
  if (ext === '.csv') {
    ({ agg, skipped } = loadFromCsv(raw));
  } else {
    ({ agg, skipped } = loadFromJson(JSON.parse(raw)));
  }

  // 表示（company → persons → roles）
  const printable = [...agg.values()]
    .sort((a, b) => a.company.localeCompare(b.company, 'ja') || a.name.localeCompare(b.name, 'ja'))
    .map((e) => ({
      company: e.company || '(会社なし)',
      person: e.name,
      roles: mainRolesOrdered(e).join('|') || '(なし)',
      events: e.events.size,
      lastDay: e.lastDay || '',
    }));
  console.table(printable);

  const databaseUrl = args.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL が未設定です。--database-url を渡すか環境変数を設定してください。');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  const summary = {
    companiesCreated: 0,
    companiesMatched: 0,
    personsCreated: 0,
    personsMatched: 0,
    sqlStatements: 0,
  };
  const companyIdCache = new Map();

  try {
    await client.query('BEGIN');

    for (const entry of agg.values()) {
      const companyName = entry.company;
      if (!companyName) continue; // 会社名が無い行は個人だけでは紐付けられないので飛ばす（入力側の不備）

      let companyId = companyIdCache.get(companyName);
      if (companyId === undefined) {
        companyId = await findCompanyId(client, companyName);
        summary.sqlStatements++;
        if (companyId) {
          summary.companiesMatched++;
        } else {
          companyId = await createCompany(client, companyName);
          summary.sqlStatements++;
          summary.companiesCreated++;
        }
        companyIdCache.set(companyName, companyId);
      }

      const roles = mainRolesOrdered(entry);
      const existing = await findPerson(client, companyId, entry.name);
      summary.sqlStatements++;
      if (!existing) {
        await createPerson(client, companyId, entry.name, roles, entry.kana);
        summary.sqlStatements++;
        summary.personsCreated++;
      } else {
        const merged = mergeMainRoles(existing.main_roles, entry);
        await updatePersonRoles(client, existing.id, merged);
        summary.sqlStatements++;
        summary.personsMatched++;
      }
    }

    if (args.dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('');
  console.log(args.dryRun ? '── dry-run（書き込みなし。ROLLBACK 済み） ──' : '── 取り込み結果 ──');
  console.log(`会社: 新規作成 ${summary.companiesCreated} 件 / 既存に一致 ${summary.companiesMatched} 件`);
  console.log(`人: 新規作成 ${summary.personsCreated} 件 / 既存に一致（main_roles を更新） ${summary.personsMatched} 件`);
  console.log(`捨てた行: 社内業務 ${skipped.training} 件 / 氏名が空 ${skipped.emptyName} 件 / 改訂で上書きされた ${skipped.superseded} 件`);
  console.log(`発行した SQL: ${summary.sqlStatements} 文`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
