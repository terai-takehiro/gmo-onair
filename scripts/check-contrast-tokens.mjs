#!/usr/bin/env node
/**
 * 「塗りの上に載せる文字の色」を、塗りの無いところに使っていないかを機械で確かめる。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * `tokens.css` の接尾辞の文法（`shared/CLAUDE.md`）はこうです:
 *
 *   --<s>              塗りの色
 *   --<s>-foreground   **塗りの上に載る**文字の色
 *   --<s>-surface      帯の背景（**淡い面**）
 *
 * `--warning-foreground` は **白**（`255 255 255`）です。塗り（`--warning`）の上に
 * 載せる前提の色なので、**淡い帯（`--warning-surface` = #fff7ed）の上に載せると
 * 白地に白**になります。**文字はそこにあるのに読めません。**
 *
 * ⚠️ **型検査にも eslint にも出ません。** クラス名としてはどちらも正しく、
 * 名前も1文字違い（`text-warning` と `text-warning-foreground`）です。
 * `verify:ui` の「薄すぎる文字」は実ブラウザで拾えますが、
 * **開いていないダイアログの中は測れません** — 実際にこの形で
 * **6画面7か所**が残っていました（利用者からの指摘で分かった）。
 * いちばん多かったのが**確認ダイアログの注意書き**で、
 * つまり「押す前にいちばん読んでほしい文」が消えていたことになります。
 *
 * ── 何を見るか ──────────────────────────────────────────────
 *
 * `tokens.css` を読んで、**明るい配色で白（またはそれに近い）** の
 * `--<s>-foreground` を数え上げ、その `text-<s>-foreground` の**近く**に
 * 塗り（`bg-<s>` / `bg-<s>-[5-9]00`）か `var(--<s>)` があるかを見ます。
 * 「近く」の測り方は下の `windowAround` に書いてあります。
 *
 * ── 見ないもの ──────────────────────────────────────────────
 *
 *  ・塗りが**遠く**にあるもの（変数から来る・親のタグが窓の外）…
 *    `ALLOW` に**理由付きで**挙げる（`check-links.mjs` と同じやり方）
 *  ・`client-awards` … `tokens.css` を読まない（自前の変数・自前の tailwind 設定）
 *
 * 使い方: node scripts/check-contrast-tokens.mjs   （`npm run lint` から呼ばれる）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 塗りが**窓の外**にあると分かっていて、それでよいもの（理由を必ず書く）。
 *
 * **親のタグに塗りがあるだけのものはここに書かない** — `windowAround` が見る。
 * チェックの四角（親が `bg-success`・中の `<Check>` が白）はこの製品に
 * いくつもあり、足すたびにこの一覧に書き足すことになるため。
 */
const ALLOW = new Map([
  ['client/src/contexts/sales/pages/projectDetail/review/KptPanel.tsx:154',
    'KPT の記号の丸。塗りは PANES の `badge`（bg-success / bg-destructive / bg-primary）から来るので字面に出ない'],
  ['client-equipment/src/pages/equipmentList/ItemsPanel.tsx:272',
    '選択中の帯（親のタグが bg-primary）の中の ghost ボタン。hover の bg-primary-800 は #004d91（濃い）'],
  ['client/src/contexts/platform/pages/home/MobileAiBar.tsx:81',
    'スマホの青いバーの右端。塗りは linear-gradient(var(--primary) → var(--info)) で、11 行上のボタンにある'],
]);

/* ── どの `-foreground` が「塗りの上でしか読めない」か ───────────────
   `tokens.css` の**明るい配色**（先頭の `:root`）から読む。
   値を決め直したらこの一覧も自動で変わる（コードに焼き込まない） */
const tokensCss = fs.readFileSync(path.join(ROOT, 'shared/src/client/tokens.css'), 'utf8');
// ⚠️ 素の `indexOf('.dark')` で切らないこと — **注釈**に「暗い配色 (`.dark`) の値は
// 作っていない」と書いてあり、そこに当たって手前で切れる。**行頭の規則**で探す
const darkAt = tokensCss.search(/^\.dark\s*\{/m);
const light = darkAt >= 0 ? tokensCss.slice(0, darkAt) : tokensCss;
const WHITE_FG = [];
for (const m of light.matchAll(/--([a-z-]+)-foreground:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
  const [, name, r, g, b] = m;
  // 相対輝度が高い = 淡い面の上では読めない
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin(+r) + 0.7152 * lin(+g) + 0.0722 * lin(+b);
  if (lum > 0.5) WHITE_FG.push(name);
}
if (WHITE_FG.length < 4) {
  console.error('[contrast] tokens.css から `-foreground` を読めませんでした（書き方が変わった？）');
  process.exit(1);
}

/* ── 走査するファイル ────────────────────────────────────── */
const APPS = ['client', 'client-daily', 'client-equipment', 'client-qsheet', 'client-techsheet', 'client-live'];
const files = [];
const walk = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.tsx$/.test(e.name)) files.push(f);
  }
};
for (const a of APPS) walk(path.join(ROOT, a, 'src'));
walk(path.join(ROOT, 'shared/src'));

/**
 * 塗りを探す範囲。**その行の前後**を見る。
 *
 * 塗りは3通りの置かれ方をする:
 *   ① 同じ行            `bg-primary text-primary-foreground`（cva の variant・素の className）
 *   ② 同じタグの別の行  `cn(...)` を複数行に折ったとき
 *   ③ **親のタグ**      `<span class="bg-success"><Check class="text-success-foreground" /></span>`
 *
 * ③ があるのでタグ1つでは足りない。JSX を本当に構文解析するのが正しいが、
 * この検査のためだけに構文木を持ち込むほどではないので**行の窓**で見る。
 * ⚠️ 窓である以上、**手前の兄弟**の塗りを拾うことがある（緩い側に外れる）。
 * 締めすぎて「読めない文字」を通すより、緩めて `ALLOW` に書かせるほうを選んでいる。
 */
const BACK = 8;
const FWD = 2;
function windowAround(lines, lineNo) {
  return lines.slice(Math.max(0, lineNo - 1 - BACK), lineNo + FWD).join('\n');
}

const bad = [];
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  for (const s of WHITE_FG) {
    const re = new RegExp(`text-${s}-foreground(?![a-z-])`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const lineNo = src.slice(0, m.index).split('\n').length;
      const key = `${rel}:${lineNo}`;
      if (ALLOW.has(key)) continue;
      const near = windowAround(lines, lineNo);
      // `bg-<s>` の塗り。`-surface` / `-border` は**淡い面**なので塗りではない
      const filled = new RegExp(`bg-${s}(?![a-z-])`).test(near)
        || new RegExp(`bg-${s}-[5-9]00`).test(near)
        || new RegExp(`var\\(--${s}\\)`).test(near);
      if (!filled) bad.push([key, s, lines[lineNo - 1].trim().slice(0, 120)]);
    }
  }
}

if (bad.length) {
  console.error(`[contrast] 塗りの無いところに「塗りの上の文字色」を使っています（${bad.length} 件）`);
  console.error('           **白地に白**になります。文字はあるのに読めません（型検査にも eslint にも出ません）');
  for (const [key, s, line] of bad) {
    console.error(`\n  ${key}   text-${s}-foreground`);
    console.error(`      ${line}`);
  }
  console.error('\n  直し方: 淡い帯（bg-<s>-surface）の上なら **text-<s>**（濃いほう）か');
  console.error('          長い本文なら text-secondary-foreground を使う。');
  console.error('          塗りが親のタグや変数から来ていて正しいなら、');
  console.error('          scripts/check-contrast-tokens.mjs の ALLOW に理由付きで足す');
  process.exit(1);
}
console.log(`[contrast] OK (塗り前提の色 ${WHITE_FG.length} 種 / ${files.length} ファイルを確認)`);
