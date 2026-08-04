#!/usr/bin/env node
//
// 1ファイルが大きくなりすぎるのを止める。
//
// なぜこれがあるか:
//   1か所直すために全部読む必要があるファイルは、変更のコストがそのまま行数に比例する。
//   着手時点で 2,000 行超が3本 (最大 ProjectFormPage.tsx 2,178行)、1,000 行超が10本あり、
//   「案件詳細の1タブを直すのに 2,178 行読む」状態だった。
//   v4 で画面を作り直すときに分割していく (案件詳細は7タブ = 7ファイルが自然)。
//
// 方式: ラチェット (基準より増えたときだけ止める)
//   既存の超過分を一度に直すのは無理なので、いまの行数を基準として記録し、
//   **新しく超えたファイル**と**既存の超過ファイルが増えたとき**だけ止める。
//   減ったら基準を締める (--update で書き直す)。
//
// 実行:
//   node scripts/check-file-size.mjs            # 検査 (npm run lint から呼ばれる)
//   node scripts/check-file-size.mjs --update   # 基準を今の状態に書き直す
//   node scripts/check-file-size.mjs --list     # 超過ファイルを行数順に出す
//
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'scripts/file-size-baseline.json');
const LIMIT = 400;

// v4 で作り直す対象だけを見る。凍結アプリ (qsheet / techsheet / live / awards) は
// 画面を触らないので、いま大きいままでも構わない。
const SCAN = ['client/src', 'client-daily/src', 'client-equipment/src', 'shared/src'];

// 生成物・巨大な定数表・マニュアル本文は対象外。
// (分割しても読む量が減らない or 人が読む文書のため)
const SKIP = [
  /\/manual\/content\.tsx$/,            // 利用マニュアルの本文 (文書)
  /\/db\/migrations\//,                 // SQL
  /\.d\.ts$/,
  /\/__generated__\//,
];

const args = process.argv.slice(2);
const MODE = args.includes('--update') ? 'update' : args.includes('--list') ? 'list' : 'check';

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = SCAN.flatMap((d) => walk(path.join(ROOT, d)))
  .map((p) => path.relative(ROOT, p))
  .filter((rel) => !SKIP.some((re) => re.test(`/${rel}`)))
  .sort();

const lines = new Map();
for (const rel of files) {
  const n = readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length;
  if (n > LIMIT) lines.set(rel, n);
}

if (MODE === 'list') {
  const rows = [...lines].sort((a, b) => b[1] - a[1]);
  console.log(`${LIMIT} 行を超えるファイル: ${rows.length} 本`);
  for (const [rel, n] of rows) console.log(`  ${String(n).padStart(5)}  ${rel}`);
  process.exit(0);
}

if (MODE === 'update') {
  const obj = Object.fromEntries([...lines].sort((a, b) => b[1] - a[1]));
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ limit: LIMIT, note: 'scripts/check-file-size.mjs の基準。減ったら --update で締める。増やさないこと。', files: obj }, null, 2)}\n`
  );
  console.log(`[file-size] 基準を更新: ${lines.size} 本 (上限 ${LIMIT} 行)`);
  process.exit(0);
}

// ── 検査 ────────────────────────────────────────────────────
if (!existsSync(BASELINE)) {
  console.error(`[file-size] 基準がありません: ${path.relative(ROOT, BASELINE)}`);
  console.error('  初回は `node scripts/check-file-size.mjs --update` で作ってください。');
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).files ?? {};

const added = [];   // 新しく上限を超えたファイル
const grown = [];   // 既存の超過ファイルが増えた
const shrunk = [];  // 減った (基準を締められる)

for (const [rel, n] of lines) {
  const base = baseline[rel];
  if (base === undefined) added.push([rel, n]);
  else if (n > base) grown.push([rel, n, base]);
  else if (n < base) shrunk.push([rel, n, base]);
}
const fixed = Object.keys(baseline).filter((rel) => !lines.has(rel));

let bad = false;

if (added.length) {
  bad = true;
  console.error(`\n✗ ${LIMIT} 行を超えた新しいファイル (${added.length} 本)`);
  for (const [rel, n] of added) console.error(`    ${n} 行  ${rel}`);
  console.error(
    `\n  1か所直すのに ${LIMIT} 行以上を読む形になっています。役割で分けてください。\n` +
      '  (例: タブごと / 表の列定義とフォーム / 一覧と詳細)\n' +
      '  どうしても分けられない理由があるなら --update で基準に入れ、PR に理由を書いてください。'
  );
}

if (grown.length) {
  bad = true;
  console.error(`\n✗ 超過ファイルがさらに増えました (${grown.length} 本)`);
  for (const [rel, n, base] of grown) console.error(`    ${base} → ${n} 行 (+${n - base})  ${rel}`);
  console.error('\n  もともと上限を超えているファイルです。足すのではなく、分ける方向で直してください。');
}

if (shrunk.length || fixed.length) {
  console.log(`\n· 減ったファイル: ${shrunk.length + fixed.length} 本`);
  for (const rel of fixed) console.log(`    ${baseline[rel]} 行 → ${LIMIT} 行以下  ${rel}`);
  for (const [rel, n, base] of shrunk) console.log(`    ${base} → ${n} 行 (-${base - n})  ${rel}`);
  console.log('  `node scripts/check-file-size.mjs --update` で基準を締められます。');
}

if (bad) process.exit(1);
console.log(`[file-size] OK (上限 ${LIMIT} 行 / 基準の超過 ${Object.keys(baseline).length} 本は据え置き)`);
