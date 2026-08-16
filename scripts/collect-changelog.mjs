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
 * 3. **4件目を `docs/version-history.md` へ移す**（この節は毎ターン文脈に載るため）
 * 4. `README.md` の「現在のバージョン」を差し替え、前の版を「旧 …」に落とす
 * 5. `package.json` の `version` を上げる
 * 6. 集めた `changelog.d/*.md` を消す
 */
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'docs', 'changelog.d');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));

if (!version) {
  console.error('使い方: npm run release:notes -- 4.0.30 [--dry]');
  process.exit(1);
}

/** `README.md` は説明なので集めない */
const entries = readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
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
const line = `v${version} — ${bodies.join(' ')}`;

console.log(`[release:notes] ${ordered.length} 件を v${version} にまとめます:`);
for (const f of ordered) console.log(`  - ${f}`);

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
const size = Buffer.byteLength(line, 'utf8');
if (size > MAX_ENTRY_BYTES) {
  console.error(`[release:notes] この版の行が大きすぎます: ${(size / 1024).toFixed(0)}KB（目安 ${Math.round(MAX_ENTRY_BYTES / 1024)}KB）

  CLAUDE.md の「## 現在のバージョン」は**毎ターン文脈に載ります**。
  ${entries.length} 本ぶんの全文をそのまま入れると、全作業のコストが上がります。

  ・全文は docs/version-history.md の「## 過去のバージョン」直下へ（(…) で包んだ1行）
  ・CLAUDE.md には要約だけを置く（同じ版番号で始める）
  画面の「バージョン履歴」は両方を読み、同じ版なら**長いほう**を出します。`);
  process.exit(1);
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
if (archived) {
  const hp = join(ROOT, 'docs', 'version-history.md');
  const h = readFileSync(hp, 'utf8');
  const m = '## 過去のバージョン\n\n';
  const at = h.indexOf(m) + m.length;
  if (!dry) writeFileSync(hp, `${h.slice(0, at)}(${archived})\n\n${h.slice(at)}`);
  console.log(`[release:notes] ${archived.slice(0, 24)}… をアーカイブへ移しました`);
}

// ── README.md ────────────────────────────────────────────────
const rp = join(ROOT, 'README.md');
const readme = readFileSync(rp, 'utf8').split('\n');
const ri = readme.findIndex((l) => l.startsWith('**現在のバージョン**:'));
if (ri < 0) throw new Error('README.md に「**現在のバージョン**:」がありません');
const prev = readme[ri].replace('**現在のバージョン**: v', '旧 v');
readme[ri] = `**現在のバージョン**: ${line}`;
readme.splice(ri + 2, 0, prev, '');
if (!dry) writeFileSync(rp, readme.join('\n'));

// ── package.json ─────────────────────────────────────────────
const pp = join(ROOT, 'package.json');
const pkg = readFileSync(pp, 'utf8');
if (!dry) writeFileSync(pp, pkg.replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${version}"`));

// ── 集めたファイルを消す ─────────────────────────────────────
if (!dry) for (const f of ordered) rmSync(join(DIR, f));

console.log(dry
  ? '[release:notes] --dry なので何も書いていません'
  : `[release:notes] v${version} にしました（check:version と generate-version-history を回してください）`);
