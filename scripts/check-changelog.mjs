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
 *   RELEASE=1 npm run lint      （または枝のいずれかのセグメントの先頭が `release`。`release/4.6.11`・`claude/release-…`）
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
import { isNoteFile } from './lib/changelog-summary.mjs';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

/**
 * いま見ている枝の名前。
 *
 * ⚠️ **CI では `git` に訊いても分かりません**（レビューでの指摘 #147・P1）。
 * `pull_request` の仕事は **GitHub が作ったマージ用の ref を切り離した頭で**
 * 取り出すので、`rev-parse --abbrev-ref HEAD` は枝の名前ではなく
 * **`HEAD` という文字**を返します。**元の枝の名前は環境変数で渡ってきます**
 * （`GITHUB_HEAD_REF` = PR の出どころ／`GITHUB_REF_NAME` = push のとき）。
 */
function branchName() {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  try {
    const local = git('rev-parse', '--abbrev-ref', 'HEAD');
    if (local && local !== 'HEAD') return local;
  } catch { /* git が読めない */ }
  return process.env.GITHUB_REF_NAME ?? '';
}

/**
 * リリースの1本か。
 *
 * ⚠️ **CI には `RELEASE=1` を渡す仕組みが無い**（`ci.yml` は素の `npm run lint`
 * を呼ぶだけ）。手元の `RELEASE=1 npm run lint` は人が打つ前提で、CI が
 * 自動で立てることはない。つまり CI 上でリリース PR を通す道は**枝の名前だけ**。
 *
 * 前は `/^release\//`（先頭が `release/`）だけを見ていたが、Claude Code の
 * Web セッションが作る枝は `claude/<内容>-<乱数>` の形固定で、`release/` に
 * 付け替えられないことがある（リリース専用の作業でも `claude/release-…` に
 * しかならない）。**セグメントの先頭が `release`** であれば通す
 * （`claude/release-version-update-xxxxx` も拾う。`feature/pre-release-notes`
 * のように単語の途中に `release` があるだけの枝は拾わない）。
 */
function isRelease() {
  if (process.env.RELEASE === '1') return true;
  return /(^|\/)release(?:[-/]|$)/.test(branchName());
}

/*
 * ⚠️ **ここを通せなくすると、リリースが出せなくなります**（同じ指摘）。
 *
 * リリースの PR は**版の3か所を必ず書き換えます**（`docs/branching.md` の決めごと）。
 * 前の版は「比べる相手が無ければ飛ばす」で**たまたま**通っていました
 * （浅い clone で `origin/main` が見えなかったため）。
 * `fetch-depth: 0` を入れて比べられるようにした結果、**その偶然が消え**、
 * 枝の名前を `git` に訊いていたこの関数が `HEAD` を見て
 * 「リリースではない」と判断し、**必須チェックがリリース PR を止めます**。
 *
 * つまり**門を直したことが、リリースを塞ぐ**形でした。
 */
if (isRelease()) {
  console.log('[changelog] リリースなので版の変更を許します'
    + `（${process.env.RELEASE === '1' ? 'RELEASE=1' : branchName()}）`);
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

/**
 * 追加された版の番号のうち、削除された行には無かった（＝新しく現れた）ものを返す。
 *
 * ⚠️ **見出し行に本文が同居している**（`CLAUDE.md` の `vX.Y.Z — 本文`・
 * `README.md` の `**現在のバージョン**: vX.Y.Z — **見出し**`）ため、**本文だけを書き換えても
 * git diff は行ごと `-`／`+` になる**。単に「`+vX.Y.Z` の行があるか」を見ると、
 * 既存バージョンの本文を短くしただけの直しまで「版を上げた」と誤検知する
 * （レビューでの指摘・Codex #209）。**削除された行にも同じ版番号があれば見送る。**
 */
function newVersionNumbers(diffText, lineRe) {
  const collect = (sign) => {
    const re = new RegExp(`^${sign}${lineRe.source}`, 'gm');
    return [...diffText.matchAll(re)].map((m) => m[1]);
  };
  const added = collect('\\+');
  const removed = new Set(collect('-'));
  return added.filter((v) => !removed.has(v));
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
    if (newVersionNumbers(d, /\*\*現在のバージョン\*\*: v(\d+\.\d+\.\d+)/gm).length) {
      out.push('README.md の「現在のバージョン」');
    }
  }
  if (changed.includes('CLAUDE.md')) {
    const d = git('diff', base, '--', 'CLAUDE.md');
    if (newVersionNumbers(d, /v(\d+\.\d+\.\d+) — /gm).length) {
      out.push('CLAUDE.md の版の行');
    }
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
  /*
   * ⚠️ **`_summary.md` はここでも下書きに数えないこと**（レビューでの指摘・P2）。
   * 集める側（`collect-changelog.mjs`）は要約なので**集めません**。片方だけが
   * 外していると、**`_summary.md` だけを足した PR が門を通り抜けて**、
   * **版の履歴に1行も載らないまま**マージされます。判定は1か所（`isNoteFile`）。
   */
  const inDir = (f) => f.startsWith('docs/changelog.d/') && isNoteFile(f);
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
  ? readdirSync(dir).filter(isNoteFile)
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
  （リリースの1本なら RELEASE=1 npm run lint、または枝の名前を release/… か claude/release-… にしてください）
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

      docs/changelog.d/${(branchName() || '<枝の名前>').replace(/\//g, '-')}.md

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
