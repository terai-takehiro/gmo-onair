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
 * ── git が読めないときの扱い ────────────────────────────────
 *
 * ⚠️ **CI では「読めないので飛ばす」を許しません**（レビューでの指摘 #126）。
 *
 * 前の版は `origin/main` が見えなければ黙って通していました。ところが
 * `ci.yml` の `checkout` は**浅い clone**（PR のマージ ref を1コミット）だったので、
 * **`origin/main` はどの PR でも存在せず、この検査は一度も動いていませんでした**。
 * 版の3か所を書き換えても門は緑のまま＝**あるつもりで無かった**わけです。
 *
 * いまは `ci.yml` に `fetch-depth: 0` を入れてありますが、**それが外れた日に
 * また黙る**ので、ここでも守ります: **CI（`process.env.CI`）で比べる相手が
 * 作れなければ 1 で止めます**。手元では今までどおり飛ばします
 * （枝を切った直後など、比べる相手がまだ無いのは普通のことなので）。
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

/** CI か（GitHub Actions は `CI=true` を必ず立てる） */
const inCI = process.env.CI === 'true' || process.env.CI === '1';

/**
 * 比べる相手。**GitHub が渡す PR の base を先に使います** — `origin/main` に
 * 頼ると、既定の浅い clone や `main` 以外を base にした PR で作れません。
 */
function findBase() {
  const cands = [];
  // pull_request のときだけ入る（`refs/remotes/origin/<base>` は checkout が作る）
  if (process.env.GITHUB_BASE_REF) cands.push(`origin/${process.env.GITHUB_BASE_REF}`);
  cands.push('origin/main');
  for (const ref of cands) {
    try {
      git('rev-parse', '--verify', ref);
      return git('merge-base', 'HEAD', ref);
    } catch { /* 次の候補へ */ }
  }
  return null;
}

const base = findBase();
if (!base) {
  if (inCI) {
    console.error(`
[changelog] ✗ 比べる相手（PR の base / origin/main）が見つかりません。

  **CI では飛ばしません。** 前の版はここで黙って通しており、その結果
  この検査は**どの PR でも一度も動いていませんでした**（浅い clone で
  origin/main が無かったため）。飛ばすと「門があるつもりで無い」状態に戻ります。

  直し方: .github/workflows/ci.yml の checkout に fetch-depth: 0 が付いているか
  確かめてください（付けたのは #126 の指摘への対応です）。
`);
    process.exit(1);
  }
  console.log('[changelog] origin/main が見えないので飛ばします（手元なので止めません）');
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

/**
 * **この PR が足した下書き**（レビューでの指摘 #126）。
 *
 * ⚠️ 前の版は `docs/changelog.d/` に**置いてあるファイルを全部数えて**
 * その数を印字するだけでした。すでに 20 件置いてあるので、
 * **この PR が1つも足していなくても「OK（下書き 20 件）」**と出ます。
 * つまり「版を触っていないこと」しか見ておらず、決めごとの片割れ
 * （**代わりに下書きを1つ置く**）は**誰も検査していませんでした** —
 * 忘れた PR は**リリースノートに1行も載らないまま**マージされます。
 *
 * **足したものだけ**を数えます。⚠️ **まだ `git add` していないものも拾います** —
 * 拾わないと、手元で `npm run lint` を回す人が「書いたのに怒られる」ことになり、
 * この検査を信じなくなります。
 */
function addedNotes() {
  const inDir = (f) => f.startsWith('docs/changelog.d/')
    && f.endsWith('.md') && !f.endsWith('/README.md');
  const out = new Set();
  try {
    for (const f of git('diff', '--name-only', '--diff-filter=A', base, '--', 'docs/changelog.d')
      .split('\n').filter(Boolean)) if (inDir(f)) out.add(f);
  } catch { /* 差分が読めないときは下の未追跡だけで見る */ }
  try {
    for (const f of git('ls-files', '--others', '--exclude-standard', '--', 'docs/changelog.d')
      .split('\n').filter(Boolean)) if (inDir(f)) out.add(f);
  } catch { /* 同上 */ }
  return [...out];
}

const dir = join(ROOT, 'docs', 'changelog.d');
const notes = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md')
  : [];
const added = addedNotes();

/**
 * base と何も違わないときは何も見ない（`main` の上・枝を切った直後）。
 * ここで下書きを要求すると、**`main` で `npm run lint` を回すだけで落ちます**。
 */
const touched = changed.length > 0;

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

/**
 * ⚠️ **下書きを1つ置いたかを見る**（レビューでの指摘 #126）。
 * 決めごとは「版の3か所を触らない **代わりに** 下書きを1つ置く」の**対**です。
 * 片方だけ検査していたので、**忘れた PR はリリースノートに載らないまま**
 * マージされていました（`release:notes` は置いてあるものしか集めません）。
 */
if (touched && added.length === 0) {
  console.error(`
[changelog] ✗ この PR は docs/changelog.d/ に下書きを1つも足していません。

  版の3か所（package.json / CLAUDE.md / README.md）を触らない代わりに、
  **載せたい文を1つ置く**のが決めごとです（docs/changelog.d/README.md）。
  置き忘れると **リリースノートにこの PR の行が1つも載りません**
  （npm run release:notes は置いてあるものしか集めないため）。

  枝の名前でファイルを作ってください（/ は - に）:

      docs/changelog.d/${(() => {
    try { return git('rev-parse', '--abbrev-ref', 'HEAD').replace(/\//g, '-'); } catch { return '<枝の名前>'; }
  })()}.md

  中身はそのまま版の履歴に載る1行です（何が起きていたか → なぜ困るか →
  どう直したか → 検証）。リリースの1本なら RELEASE=1 npm run lint。
`);
  process.exit(1);
}

/**
 * **2つ以上は止めません**（警告だけ）。決めごとは 1 PR = 1 ファイルですが、
 * 枝を作り直した回や取り込み直した回に増えることがあり、**止めると
 * 直しようがない**（消すと別の PR の行が消える）。気づける形にはします。
 */
if (added.length > 1) {
  console.warn(`[changelog] ⚠️ この PR が足した下書きが ${added.length} 件あります`
    + `（決めごとは 1 PR = 1 ファイル。直しが増えたら同じファイルに書き足してください）:`);
  for (const f of added) console.warn(`    - ${f}`);
}

console.log(`[changelog] OK（版は触っていません / この PR の下書き ${added.length} 件`
  + ` / 置いてある下書き ${notes.length} 件）`);
