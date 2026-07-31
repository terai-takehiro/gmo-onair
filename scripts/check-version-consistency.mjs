#!/usr/bin/env node
/**
 * バージョン表記が3か所で一致しているかを検査する。
 *
 * なぜ機械で見るか:
 *   バージョンは「ルート package.json が唯一の情報源」と決めてあるが、画面に
 *   出す履歴 (CLAUDE.md) と README の見出しにも同じ番号を手で書く運用だった。
 *   3か所を手で揃えるので、実際にどれかが取り残される。番号がずれると
 *   「本番に出ているのはどれか」が読む場所によって変わってしまう。
 *
 * 見る場所:
 *   1. package.json          "version": "X.Y.Z"           ← 唯一の情報源
 *   2. CLAUDE.md             ## 現在のバージョン の次の行 vX.Y.Z — ...
 *   3. README.md             **現在のバージョン**: vX.Y.Z — ...
 *
 * 各ワークスペースの package.json は**見ない**。あちらは意図的に固定値
 * (更新すると Docker の全ビルドステージが無効化されデプロイが 2〜3 分伸びる。
 *  詳細は docs/deploy-pipeline.md)。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;

/** @type {{ label: string, file: string, version: string | null, hint: string }[]} */
const found = [];

// 1. package.json ─ 唯一の情報源
{
  const pkg = JSON.parse(read('package.json'));
  found.push({
    label: 'package.json',
    file: 'package.json',
    version: typeof pkg.version === 'string' ? pkg.version : null,
    hint: '"version": "X.Y.Z"',
  });
}

// 2. CLAUDE.md ─ 「## 現在のバージョン」の直後にある最初の vX.Y.Z
//    この節は画面の「バージョン履歴」の情報源でもあるので書式を崩せない
//    (scripts/generate-version-history.mjs が同じ形を読む)。
{
  const md = read('CLAUDE.md');
  const section = md.split(/^##\s*現在のバージョン\s*$/m)[1];
  const m = section?.match(new RegExp(String.raw`^v(${SEMVER})\s+—`, 'm'));
  found.push({
    label: 'CLAUDE.md',
    file: 'CLAUDE.md',
    version: m ? m[1] : null,
    hint: '「## 現在のバージョン」の次の行を `vX.Y.Z — **タイトル**。本文` の形にする',
  });
}

// 3. README.md ─ 見出しの「現在のバージョン」
{
  const md = read('README.md');
  const m = md.match(new RegExp(String.raw`\*\*現在のバージョン\*\*:\s*v(${SEMVER})`));
  found.push({
    label: 'README.md',
    file: 'README.md',
    version: m ? m[1] : null,
    hint: '`**現在のバージョン**: vX.Y.Z — ...` の形にする',
  });
}

const missing = found.filter((f) => !f.version);
if (missing.length > 0) {
  console.error('✗ バージョン表記が読み取れませんでした:\n');
  for (const f of missing) {
    console.error(`  ${f.file}: 見つからない`);
    console.error(`    → ${f.hint}\n`);
  }
  process.exit(1);
}

const source = found[0].version;
const mismatched = found.filter((f) => f.version !== source);

if (mismatched.length > 0) {
  console.error('✗ バージョン表記がずれています。\n');
  for (const f of found) {
    const mark = f.version === source ? ' ' : '✗';
    console.error(`  ${mark} ${f.label.padEnd(14)} v${f.version}`);
  }
  console.error(`\n  package.json (v${source}) が唯一の情報源です。ずれている側を合わせてください:`);
  for (const f of mismatched) console.error(`    - ${f.file}: ${f.hint}`);
  console.error('\n  (更新が必要な箇所の一覧は CONTRIBUTING.md「リリースの出し方」にあります)');
  process.exit(1);
}

console.log(`✓ バージョン表記は3か所すべて v${source} で一致`);
