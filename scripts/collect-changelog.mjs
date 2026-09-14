#!/usr/bin/env node
/**
 * `docs/changelog.d/*.md` を1つの版にまとめて `CLAUDE.md` に積む（リリースのとき）
 *
 * ── なぜこの道具が要るか ────────────────────────────────────
 *
 * 版の番号は**マージされた順**で決まるのに、前は**作業を始めた時点で**番号を取り、
 * `CLAUDE.md` の履歴の**いちばん上**に書き足していました。並行して2本出すと
 * **必ず同じ行を取り合います**（実測: 直近2週間で `CLAUDE.md` 55 コミット・
 * `README.md` 42・`package.json` 45 — ぶつかったのは毎回この3か所だけで、
 * コードは1度も競合していません）。
 *
 * 作業 PR は `docs/changelog.d/<枝の名前>.md` を**1つ足すだけ**にして、
 * 番号と履歴への差し込みは**リリースの1本**（この道具）に寄せます。
 *
 * ── 使い方 ──────────────────────────────────────────────────
 *
 *   npm run release:notes -- 4.0.30          # 集めて書き込む
 *   npm run release:notes -- 4.0.30 --dry    # 何が起きるか出すだけ
 *
 * ── やること ────────────────────────────────────────────────
 *
 * 1. `docs/changelog.d/*.md` を **git の履歴順**（マージされた順）で集める
 *    — ファイルの更新時刻で並べると、あとから直した PR が先頭に来ます
 * 2. `vX.Y.Z — <集めた本文>` を `CLAUDE.md`「## 現在のバージョン」の先頭に置く
 *    — ⚠️ **全文が 12KB を超えたら、要約を `CLAUDE.md` に・全文をアーカイブに分ける**
 *      （下記。要約は `docs/changelog.d/_summary.md` に書いておけばそれを使う）
 * 3. **4件目を `docs/version-history.md` へ移す**（この節は毎ターン文脈に載るため）
 * 4. `README.md` の「現在のバージョン」を差し替える（**番号と見出しだけ**。本文は置かない）
 * 5. `package.json` の `version` を上げる
 * 6. 集めた `changelog.d/*.md` を消す
 */
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUMMARY_FILE, isNoteFile, titleOf, buildSummaryBody, descriptionLengthOf } from './lib/changelog-summary.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs', 'changelog.d');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));

if (!version) {
  console.error('使い方: npm run release:notes -- 4.0.30 [--dry]');
  process.exit(1);
}

/** `README.md` は説明、`_summary.md` は要約なので集めない */
const entries = readdirSync(DIR).filter(isNoteFile);
if (entries.length === 0) {
  console.error(`[release:notes] ${DIR} に載せるものがありません（作業 PR がファイルを置きます）`);
  process.exit(1);
}

/**
 * **マージされた順**に並べる。ファイルの更新時刻ではありません —
 * あとから直した PR が先頭に来てしまい、読む順番が実際の順番とずれます。
 * git が使えないとき（tarball から展開したとき等）は名前順に落とします。
 */
function mergedOrder(files) {
  try {
    const at = new Map();
    for (const f of files) {
      const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%ct', '-1', '--', `docs/changelog.d/${f}`],
        { cwd: ROOT, encoding: 'utf8' }).trim();
      at.set(f, Number(out) || 0);
    }
    return [...files].sort((a, b) => (at.get(a) - at.get(b)) || a.localeCompare(b));
  } catch {
    console.warn('[release:notes] git の履歴が読めないので名前順にします');
    return [...files].sort();
  }
}

const ordered = mergedOrder(entries);
const bodies = ordered.map((f) => readFileSync(join(DIR, f), 'utf8').trim().replace(/\s*\n\s*/g, ''));
const fullLine = `v${version} — ${bodies.join(' ')}`;

console.log(`[release:notes] ${ordered.length} 件を v${version} にまとめます:`);
for (const f of ordered) console.log(`  - ${f}`);

/*
 * **1本ずつの長さも見る**（決めごと: `docs/changelog.d/README.md`「載せたい文を1つ置く」）。
 *
 * ⚠️ **止めません**（警告だけ）。長い下書きにも書くべき中身があることはあり、
 * ここで落とすと**リリースの日に人の文章を削る**ことになります。
 * ただし黙っていると、全部が長くなって毎回下の上限に当たります
 * （実際にそうなりました）。**数えて出す**のが目的です。
 */
const SOFT_ENTRY_BYTES = 3_000;
const longOnes = ordered
  .map((f, i) => ({ f, n: Buffer.byteLength(bodies[i], 'utf8') }))
  .filter((x) => x.n > SOFT_ENTRY_BYTES);
if (longOnes.length) {
  console.warn(`[release:notes] ⚠️ 長い下書きが ${longOnes.length} 件あります`
    + `（目安 ${SOFT_ENTRY_BYTES} バイト／1本）:`);
  for (const x of longOnes) console.warn(`  - ${x.n} バイト  ${x.f}`);
}

// ── CLAUDE.md ────────────────────────────────────────────────
const claudePath = join(ROOT, 'CLAUDE.md');
const claude = readFileSync(claudePath, 'utf8').split('\n');
const head = claude.findIndex((l) => l.startsWith('## 現在のバージョン'));
if (head < 0) throw new Error('CLAUDE.md に「## 現在のバージョン」がありません');

const isEntry = (l) => /^v\d+\.\d+\.\d+ — /.test(l);
const firstEntry = claude.findIndex((l, i) => i > head && isEntry(l));
if (firstEntry < 0) throw new Error('CLAUDE.md に版の行が1つもありません');

/*
 * ⚠️ **1件が大きすぎたら止める。**
 *
 * この節は**毎ターン文脈に載る**ので、貯めると全作業のコストが上がります
 * （v3.2.2 の時点で 680KB ＝ 本文の 96% が履歴でした）。ところが件数の警告
 * （`generate-version-history.mjs`）は**行の数しか見ていない**ので、
 * **1行が 118KB でも「3件」で素通り**します — 実際に PR 28 本の版で
 * `CLAUDE.md` が **39KB → 151KB** になり、そのまま出るところでした。
 *
 * PR が多い版は、**要約を CLAUDE.md に・全文をアーカイブに**入れてください
 * （`docs/version-history.md`。画面の履歴は両方を読んで**長いほう**を採ります）。
 */
const MAX_ENTRY_BYTES = 12_000;
const fullSize = Buffer.byteLength(fullLine, 'utf8');
const split = fullSize > MAX_ENTRY_BYTES;

/*
 * **超えたら、止めずに分ける。**
 *
 * ⚠️ 前の版はここで `exit 1` して「要約を CLAUDE.md に・全文をアーカイブに
 * 入れてください」と**案内するだけ**でした。ところが**その分割をやる仕組みが
 * どこにも無い**ので、踏んだ人は手で `CLAUDE.md` と `docs/version-history.md` を
 * 編集することになります。**リリースを出そうとした人だけが踏む門**で、
 * しかも「どう書けば画面が正しく読むか」（見出しは要約側・本文はアーカイブ側・
 * 同じ版なら長いほうを採る）は `generate-version-history.mjs` を読まないと分かりません。
 * 実際に `main` で 19KB になり、**次のリリースのノートが作れない**状態になりました。
 *
 * いまは**この道具が両方書きます**:
 *   ・全文  → `docs/version-history.md`「## 過去のバージョン」直下（`(…)` で包んだ1行）
 *   ・要約  → `CLAUDE.md`（`README.md` には番号と見出しだけ）
 * 画面の「バージョン履歴」は両方を読み、**同じ版なら長いほう（＝全文）**を出します。
 *
 * ⚠️ **要約の中身までは作れません。** `_summary.md` があればそれを使い、
 * 無ければ**収録した見出しを並べたもの**を置きます（`buildSummaryBody`）。
 * どちらにせよ**人が読み直してください** — そのために下で警告を出します。
 */
let line = fullLine;
if (split) {
  const sp = join(DIR, SUMMARY_FILE);
  const handWritten = existsSync(sp)
    ? readFileSync(sp, 'utf8').trim().replace(/\s*\n\s*/g, '')
    : null;
  const body = handWritten || buildSummaryBody(ordered.map((f, i) => titleOf(bodies[i])));
  line = `v${version} — ${body}`;

  /*
   * ⚠️ **要約が全文より「長い」と、画面から全文が消えます**（レビューでの指摘・P2）。
   *
   * ここの上限は**バイト**（`CLAUDE.md` が毎ターン文脈に載る費用はバイトで効く）ですが、
   * 生成側が同じ版の2つを見比べるのは**文字数**です。日本語は 1文字 3バイトなので、
   * **全文が日本語ばかり・要約が英数字ばかり**だと、バイトでは要約のほうが小さいのに
   * **文字数では要約のほうが長い**という組み合わせが作れます。そうなると生成側は
   * **要約を本文に採り、アーカイブの全文を捨てます**。⚠️ **エラーは出ません。**
   *
   * **生成側と同じ数え方**（`descriptionLengthOf`）で確かめて、そうなる要約を止めます。
   */
  const summaryDesc = descriptionLengthOf(line);
  const fullDesc = descriptionLengthOf(fullLine);
  if (summaryDesc >= fullDesc) {
    console.error(`[release:notes] 要約が全文より長い（または同じ）ので止めます: `
      + `要約 ${summaryDesc} 文字 / 全文 ${fullDesc} 文字

  画面の「バージョン履歴」は同じ版が2つあるとき**長いほう**を本文に採ります。
  このままだと**要約が採られ、アーカイブの全文が画面から消えます**（エラーは出ません）。
  docs/changelog.d/${SUMMARY_FILE} を短くしてください。`);
    process.exit(1);
  }

  const summarySize = Buffer.byteLength(line, 'utf8');
  if (summarySize > MAX_ENTRY_BYTES) {
    console.error(`[release:notes] 要約も大きすぎます: ${(summarySize / 1024).toFixed(0)}KB`
      + `（目安 ${Math.round(MAX_ENTRY_BYTES / 1024)}KB）

  CLAUDE.md の「## 現在のバージョン」は**毎ターン文脈に載ります**。
  docs/changelog.d/${SUMMARY_FILE} を短くしてください。`);
    process.exit(1);
  }

  console.log(`[release:notes] 全文が ${(fullSize / 1024).toFixed(0)}KB`
    + `（目安 ${Math.round(MAX_ENTRY_BYTES / 1024)}KB）なので分けます:`);
  console.log('  ・全文  → docs/version-history.md の「## 過去のバージョン」直下');
  console.log('  ・要約  → CLAUDE.md（README.md は番号と見出しだけ）');
  if (handWritten) {
    console.log(`  要約は docs/changelog.d/${SUMMARY_FILE} の中身を使いました`);
  } else {
    console.warn(`[release:notes] ⚠️ 要約を機械で組み立てました（収録した見出しを並べただけです）。`);
    console.warn(`  **その版が何だったかを1文で言う**のは人にしかできません。`);
    console.warn(`  出す前に CLAUDE.md の先頭の行を読み直してください`);
    console.warn(`  （次からは docs/changelog.d/${SUMMARY_FILE} に書いておくとそれを使います）。`);
  }
}

claude.splice(firstEntry, 0, line, '');

// **最新3件だけ残す。** 4件目はアーカイブへ（この節は毎ターン文脈に載る）
const kept = [];
let archived = null;
for (let i = firstEntry; i < claude.length; i += 1) {
  if (!isEntry(claude[i])) continue;
  kept.push(i);
  if (kept.length === 4) { archived = claude[i]; claude.splice(i, 2); break; }
}

if (!dry) writeFileSync(claudePath, claude.join('\n'));

// ── docs/version-history.md ──────────────────────────────────
/*
 * アーカイブへ入れるものは最大2つ:
 *   ① 分けたときの**この版の全文**（`CLAUDE.md` には要約しか置いていないので、
 *      ここに入れないと**画面の履歴からその版の中身が消えます**）
 *   ② `CLAUDE.md` から溢れた**4件目**
 * **新しい順に並べる。** ① のほうが ② より新しいので先に書きます。
 */
const toArchive = [];
if (split) toArchive.push(fullLine);
if (archived) toArchive.push(archived);

/**
 * `vX.Y.Z` を `[X, Y, Z]`（数値）に。比較できない形は `null`（新しい順の対象外にする）。
 */
function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** `a` が `b` より新しければ正、同じなら 0、古ければ負（配列の辞書式比較）。 */
function cmpSemver(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

if (toArchive.length) {
  const hp = join(ROOT, 'docs', 'version-history.md');
  let h = readFileSync(hp, 'utf8');
  /*
   * ⚠️ **見出しは行頭で探す**（`generate-version-history.mjs` の `headingIndex` と同じ理由）。
   * 素の `indexOf` だと**前置きの中の引用**に当たり、版を見出しより前に置いてしまいます。
   * そうなると**その版は画面から消えます**（生成側は見出しより後だけを読む）。
   */
  const headingRe = /^## 過去のバージョン$/m;
  const headingMatch = headingRe.exec(h);
  if (!headingMatch) throw new Error('docs/version-history.md に「## 過去のバージョン」がありません');
  // 見出しの直後の位置。挿む先は常にここより後ろなので、挿入のたびにずれない
  const headIdx = headingMatch.index + headingMatch[0].length;

  /*
   * ⚠️ **常に見出し直下に挿む固定位置だと、新しい版より古い版を先頭に置いてしまう**
   * （Codex レビュー指摘・P2）。既存のエントリの版番号と比べて、**自分より新しい
   * エントリの直後・自分より古いエントリの直前**（＝新しい順を保つ位置）に挿む。
   * 比較できない既存エントリ（書式が崩れている等）はまたいで先へ進む。
   */
  for (const line of toArchive) {
    const ver = parseSemver(line);
    const entryRe = /\n\n\(v(\d+\.\d+\.\d+) — /g;
    entryRe.lastIndex = headIdx;
    let insertAt = h.length; // 比較できるエントリが1つも無ければ末尾
    let m;
    while ((m = entryRe.exec(h))) {
      const existing = parseSemver(m[1]);
      if (!ver || !existing || cmpSemver(existing, ver) < 0) {
        insertAt = m.index;
        break;
      }
    }
    if (!dry) h = `${h.slice(0, insertAt)}\n\n(${line})${h.slice(insertAt)}`;
    console.log(`[release:notes] ${line.slice(0, 24)}… をアーカイブへ入れました`);
  }
  if (!dry) writeFileSync(hp, h);
}

// ── README.md ────────────────────────────────────────────────
/*
 * README は入口の文書なので、置くのは**版の番号と見出しだけ**。
 * 本文は `CLAUDE.md`（最新3件）と `docs/version-history.md`（全件）にあり、
 * 画面の「バージョン履歴」もその2つから作る（README は読まない）。
 * 前は本文の全文と「旧 vX.Y.Z — …」を3件まで README に積んでいたが、1件が数KB
 * あるので README の半分以上が履歴になり、入口として読めなくなっていた。
 * `check-version-consistency.mjs` は `**現在のバージョン**: vX.Y.Z` の形だけを見る。
 */
const rp = join(ROOT, 'README.md');
const readme = readFileSync(rp, 'utf8').split('\n');
const ri = readme.findIndex((l) => l.startsWith('**現在のバージョン**:'));
if (ri < 0) throw new Error('README.md に「**現在のバージョン**:」がありません');
const lineTitle = titleOf(line.slice(`v${version} — `.length));
readme[ri] = `**現在のバージョン**: v${version} — **${lineTitle}**`;
// 古い形（本文つき・「旧 v…」の並び）が残っていれば落とす
while (ri + 1 < readme.length) {
  const next = readme[ri + 1];
  if (next === '' && readme[ri + 2]?.startsWith('旧 v')) { readme.splice(ri + 1, 2); continue; }
  if (next.startsWith('旧 v')) { readme.splice(ri + 1, 1); continue; }
  break;
}
if (!dry) writeFileSync(rp, readme.join('\n'));

// ── package.json ─────────────────────────────────────────────
const pp = join(ROOT, 'package.json');
const pkg = readFileSync(pp, 'utf8');
if (!dry) writeFileSync(pp, pkg.replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${version}"`));

// ── 集めたファイルを消す ─────────────────────────────────────
/*
 * ⚠️ **`_summary.md` も消す。** 残すと**次の版がこの版の要約を名乗ります** —
 * 中身は違うのに文章は前の版のまま、という**気づきにくい間違い**になります
 * （版の行は番号で始まるので、番号だけ新しくて中身が古い1行ができる）。
 */
if (!dry) {
  for (const f of ordered) rmSync(join(DIR, f));
  const sp = join(DIR, SUMMARY_FILE);
  if (existsSync(sp)) rmSync(sp);
}

console.log(dry
  ? '[release:notes] --dry なので何も書いていません'
  : `[release:notes] v${version} にしました（check:version と generate-version-history を回してください）`);
