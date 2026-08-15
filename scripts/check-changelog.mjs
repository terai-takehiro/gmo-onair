#!/usr/bin/env node
/**
 * **作業 PR が版の番号を取っていないか**を見る（`npm run lint` の1つ）
 *
 * ── 何を止めるか ────────────────────────────────────────────
 *
 * 版の番号は**マージされた順**で決まるのに、作業を始めた時点で番号を取ると、
 * 先にマージされた別の PR と**必ず取り合い**になります。
 * ぶつかる場所はいつも同じ3か所（`package.json` / `CLAUDE.md` の「現在のバージョン」/
 * `README.md` の版）で、**コードは1度も競合していません**
 * （実測: 直近2週間で `CLAUDE.md` 55 コミット・`README.md` 42・`package.json` 45）。
 *
 * そこで**作業 PR ではこの3か所を触らない**ことにし、代わりに
 * `docs/changelog.d/<枝の名前>.md` を1つ置きます（新しいファイルなので衝突しません）。
 * 番号と履歴への差し込みは**リリースの1本**（`npm run release:notes`）に寄せます。
 *
 * ── リリースのときは通す ────────────────────────────────────
 *
 *   RELEASE=1 npm run lint      （または枝の名前が `release/` で始まる）
 *
 * ── git が読めないときは止めない ────────────────────────────
 *
 * CI が浅く clone していると `origin/main` が無いことがあります。
 * **そのときは何も言わずに通します** — 検査のために CI を落とすのは本末転倒で、
 * この検査が守っているのは「衝突を減らす」ことであって正しさではありません。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

/** リリースの1本か */
function isRelease() {
  if (process.env.RELEASE === '1') return true;
  try {
    return /^release\//.test(git('rev-parse', '--abbrev-ref', 'HEAD'));
  } catch {
    return false;
  }
}

if (isRelease()) {
  console.log('[changelog] リリースの枝なので版の変更を許します');
  process.exit(0);
}

let base;
try {
  git('rev-parse', '--verify', 'origin/main');
  base = git('merge-base', 'HEAD', 'origin/main');
} catch {
  console.log('[changelog] origin/main が見えないので飛ばします');
  process.exit(0);
}

let changed;
try {
  changed = git('diff', '--name-only', base, '--').split('\n').filter(Boolean);
} catch {
  console.log('[changelog] 差分が読めないので飛ばします');
  process.exit(0);
}

/** 版の番号そのものを動かしたか（本文だけの直しは見ない） */
function bumpedVersion() {
  const out = [];
  if (changed.includes('package.json')) {
    const d = git('diff', base, '--', 'package.json');
    if (/^[+-]\s*"version":/m.test(d)) out.push('package.json の "version"');
  }
  if (changed.includes('README.md')) {
    const d = git('diff', base, '--', 'README.md');
    if (/^\+\*\*現在のバージョン\*\*:/m.test(d)) out.push('README.md の「現在のバージョン」');
  }
  if (changed.includes('CLAUDE.md')) {
    const d = git('diff', base, '--', 'CLAUDE.md');
    if (/^\+v\d+\.\d+\.\d+ — /m.test(d)) out.push('CLAUDE.md の版の行');
  }
  return out;
}

const bumped = bumpedVersion();
const dir = join(ROOT, 'docs', 'changelog.d');
const notes = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md')
  : [];

if (bumped.length > 0) {
  console.error('\n[changelog] ✗ 作業 PR で版の番号を取っています:\n');
  for (const b of bumped) console.error(`    - ${b}`);
  console.error(`
  版の番号は**マージされた順**で決まるので、ここで取ると
  先に入った別の PR と必ずぶつかります（直すたびに main を取り込み直すことになります）。

  代わりに **docs/changelog.d/<枝の名前>.md** に載せたい文を書いてください。
  番号と履歴への差し込みはリリースのときに **npm run release:notes -- X.Y.Z** がやります。
  （リリースの1本なら RELEASE=1 npm run lint、または枝の名前を release/ で始めてください）
`);
  process.exit(1);
}

console.log(`[changelog] OK（版は触っていません / 置いてある下書き ${notes.length} 件）`);
