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
  // ⚠️ **この一覧は行番号を鍵にしているので、上に行が増えると外れます。**
  // 2026-09-05 の用語統一で、このファイルの冒頭コメントに4行足したところ
  // ChevronUp が 87 → 91 行目へ動き、CI の `checks` が落ちました（PR #568）。
  // 行を足した PR は、ここの番号も一緒に直してください。
  ['client/src/contexts/platform/pages/home/MobileAiBar.tsx:91',
    'スマホの青いバーの右端。塗りは linear-gradient(var(--primary) → var(--info)) で、11 行上のボタンにある'],
  // 段5 PR7 (進行台本の表を v4 の見た目にする)。VTR ロールヘッダーの塗りは
  // 同じ <div> の `bg-gradient-to-r from-info to-info/80`（from-info は不透明の
  // 開始点）から来るが、この検査の FILL 正規表現は `bg-<s>` しか見ておらず
  // `from-<s>` / `to-<s>` のグラデーション記法を塗りと認識しない。
  ['client-techops/src/components/editor/CueTable.tsx:673',
    'VTR ロールヘッダー (bg-gradient-to-r from-info to-info/80) 内の GripVertical'],
  ['client-techops/src/components/editor/CueTable.tsx:674',
    '同上。VTR バッジ'],
  ['client-techops/src/components/editor/CueTable.tsx:675',
    '同上。VTR の絶対時刻表示'],
  ['client-techops/src/components/editor/CueTable.tsx:681',
    '同上。VTR タイトル入力欄の placeholder'],
  ['client-techops/src/components/editor/CueTable.tsx:694',
    '同上。VTR 尺入力欄 (未入力時は bg-warning へ切り替わる。入力済み時の placeholder 色)'],
  ['client-techops/src/components/editor/CueTable.tsx:697',
    '同上。VTR 尺入力欄 (入力済み時の背景 bg-info-foreground/15 の上の文字)'],
  ['client-techops/src/components/editor/CueTable.tsx:702',
    '同上。ロール削除ボタンの既定色 (hover 時は hover:bg-destructive で不透明に塗られる)'],
  // 通常ロールヘッダーも同じ理由 (bg-gradient-to-r from-primary to-primary/80)。
  ['client-techops/src/components/editor/CueTable.tsx:769',
    '通常ロールヘッダー (bg-gradient-to-r from-primary to-primary/80) 内のロール名入力欄 placeholder'],
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
const APPS = ['client', 'client-daily', 'client-equipment', 'client-techops', 'client-live'];

/**
 * 引数でディレクトリを渡すと**そこだけ**を見る（既定は下の APPS ＋ shared）。
 * 1アプリだけ確かめたいときと、**試験が仕込みのファイルを当てる**ときに使う
 * （仕込みを `client/src` に置くと、失敗した回に消し残る）。
 */
const argRoots = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = [];
const walk = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    // ⚠️ **`.ts` も見ること**（レビュー #159・Codex）。この製品はクラス名を
    // `.ts` の**地図**に置く形が多く（`hoursTypes.ts` / `taskList/state.ts` /
    // `inbox/kinds.ts` など10ファイル以上）、Tailwind の `content` も
    // `**/*.{js,ts,jsx,tsx}` で拾っている。`.tsx` だけ見ていると、
    // **地図に1行足すだけで画面に出るのに検査は OK と言う**
    else if (/\.tsx?$/.test(e.name)) files.push(f);
  }
};
if (argRoots.length) {
  for (const r of argRoots) walk(path.resolve(r));
} else {
  for (const a of APPS) walk(path.join(ROOT, a, 'src'));
  walk(path.join(ROOT, 'shared/src'));
}

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

/**
 * 「塗り」と数えてよい `bg-<s>` の書き方（レビュー #159・Codex の2件目）。
 *
 * **いつでも不透明に塗られているものだけ**を塗りと数える。緩めると、
 * 淡い帯の上の白い文字を**素通し**する（どちらも実際に素通りすることを確かめた）:
 *
 * | 書き方 | なぜ塗りではないか |
 * | --- | --- |
 * | `hover:bg-warning` | **押していないときは塗られていない**。ふだんは淡い帯のまま |
 * | `bg-warning/10` | **10% の色**。下の淡い面が透けるので、白い文字は読めないまま |
 * | `bg-warning-surface` | 淡い面（`-surface` / `-border` はそもそも塗りではない） |
 *
 * ⚠️ **`/100` は通すこと**（レビュー #160・Codex）。`bg-warning/100` は
 * **`bg-warning` と同じ不透明**なのに、`/` を一律で撥ねると**塗りではない**と
 * 判定してしまう。この検査は `npm run lint` に入っているので、
 * **その書き方をした人は lint が通らず何も進められない**（締めすぎも害になる）。
 *
 * ・`(?<![-:\w])` … 直前が `:` なら `hover:` などの**条件つき**、
 *   `-` や英数字なら別の語の一部
 * ・`(?![\w-]|/(?!100\b))` … 直後が `-` なら `-surface` 等、
 *   `/` なら半透明。**ただし `/100` は不透明なので通す**
 * ・`bg-<s>-[5-9]00` は濃い段（例 `bg-primary-800` = #004d91）なので塗りと数える
 *
 * ⚠️ **条件つきでも、文字色が「同じ条件」なら塗り**（`sameCond`）。
 * `data-[state=checked]:bg-primary` と `data-[state=checked]:text-primary-foreground`
 * は**必ず一緒に効く**ので白い文字が淡い面に載ることはない（チェックボックス2件が実際にこの形）。
 * 見るのは「条件がついているか」ではなく「**文字色と塗りの条件が揃っているか**」。
 */
const FILL = (s) => new RegExp(`(?<![-:\\w])bg-${s}(?:-[5-9]00)?(?![\\w-]|/(?!100\\b))`);

/** 条件つきの塗り。`text-…` に付いていたのと**同じ前置き**のものだけを塗りと数える */
const SAME_COND = (cond, s) =>
  new RegExp(`${cond.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}bg-${s}(?:-[5-9]00)?(?![\\w-]|/(?!100\\b))`);

/** `at` にあるクラス名の**前置き**（`hover:` / `data-[state=checked]:` …）を取り出す */
function condOf(src, at) {
  let i = at;
  while (i > 0 && !/[\s'"`({]/.test(src[i - 1])) i--;
  return src.slice(i, at);
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
      const cond = condOf(src, m.index);
      const filled = FILL(s).test(near)
        || new RegExp(`var\\(--${s}\\)`).test(near)
        || (cond !== '' && SAME_COND(cond, s).test(near));
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
