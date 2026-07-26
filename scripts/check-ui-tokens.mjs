#!/usr/bin/env node
/**
 * 部品と数字のサイズを画面ごとにバラバラに書けなくする — デザイン 6章
 *
 * ── なぜ検査を足すか ────────────────────────────────────
 *
 * 部品を用意しても、**手で書いても動く**ので直すきっかけが無いまま増える。
 * 実際に数えたら、金額を手で書いた箇所が14か所、万円に丸める関数が4本
 * (名前も丸め方も違う)、ページ見出しの重複が38か所 (書き方が3種類) あった。
 *
 * だから「入れたら止まる」形にする。`npm run lint` の前に走る。
 *
 * ── 何を止めるか（止める理由も一緒に出す）──────────────
 *
 *  1. `¥` を数字と一緒に手で書く    → 桁が揃わない・丸め方が揃わない
 *  2. 万円に丸める式をその場に書く   → 負の数で結果が変わる (Math.round vs toFixed)
 *  3. 大きい数字に `text-*` を直書き → 同じ数字が画面で違う大きさになる
 *  4. ページ見出しの `text-xl lg:text-2xl font-bold` を直書き → 見出しの大きさがばらつく
 *
 * **部品そのもの (`shared/src/client/ui/`) と グラフの軸などは対象から外す**
 * (そこが実装本体なので、そこで書けないと部品が作れない)。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** 見るディレクトリ (画面のコード) */
const TARGET_DIRS = [
  'client/src', 'client-qsheet/src', 'client-equipment/src', 'client-techsheet/src',
  'client-live/src', 'client-awards/src', 'client-daily/src',
];

/** 対象から外すもの (部品の実装そのもの・自動生成・出力用CG) */
const SKIP = [
  'shared/src/client/ui/',
  '/components/ui/',            // 各アプリの再エクスポート層
  '/cg/',                       // 出力用CG (画面設計の対象外。放送の絵)
  '/quiz/QuizCG',
  'client-awards/src/pages/Output',
];

const RULES = [
  {
    id: 'money-by-hand',
    // `¥` のすぐ後ろに `{` か `${` が来る = 金額を手で組み立てている
    re: /¥\s*\$?\{/,
    why: '金額を手で組み立てないでください。`<Money value={n} />` か `formatCurrency(n)` を使います'
       + '（手で書くと桁が揃わず、丸め方も画面ごとに変わります）',
  },
  {
    id: 'man-yen-by-hand',
    // `/10000` や `/ 10_000` で万円に丸めている
    re: /\/\s*10[_,]?000\s*\)?\s*\.?\s*(toFixed|toLocaleString)?/,
    why: '万円の丸めは `manYen(n)` を使います'
       + '（`Math.round` と `toFixed` は負の数で結果が違い、画面ごとに数字が変わります）',
    // グラフの軸・サーバーからの値の変換など「万円にしない」割り算も引っかかるので、
    // 「万」の字が同じ行にあるものだけを見る
    extra: (line) => line.includes('万'),
  },
  {
    id: 'stat-size-by-hand',
    // 大きい数字に text-* を直書き (font-number と同じ行にある = 数字の見た目)
    re: /font-number/,
    why: '大きい数字の大きさは `<StatValue size="lg|md|sm">` から選びます'
       + '（その場書きだと同じ数字が画面ごとに違う大きさになります）',
    extra: (line) => /text-(2xl|3xl|4xl|5xl)/.test(line),
  },
  {
    id: 'page-title-by-hand',
    // `lg:` と `sm:` の両方の変種を止める。**同じページに2つの段が出ていた**
    // (`/finance/import` は枠が `text-xl sm:text-2xl`、中身が `text-xl lg:text-2xl` だった)
    re: /text-xl(\s+font-bold)?\s+(lg|sm|md):text-2xl/,
    why: 'ページの見出しは `<PageTitle>` を使います'
       + '（38か所で重複し、`lg:` `sm:` `heading-page` の3種類が混ざっていました）',
  },
];

/**
 * サーバー側の禁止パターン。画面の話ではないが、**同じ「入れたら止まる」形**で
 * 守りたいものをここに置く (検査を2本に分けると片方だけ走る事故が起きる)。
 */
const SERVER_DIRS = ['server/src'];
const SERVER_SKIP = ['server/src/shared/utils/xlsx-safe.ts'];
const SERVER_RULES = [
  {
    id: 'raw-xlsx-read',
    re: /XLSX\.read\s*\(/,
    why: 'Excel の読み取りは `safeReadWorkbook()` を通してください'
       + '（xlsx には npm 上に修正版が無い脆弱性が2件あり、中身の判定と'
       + ' prototype 汚染の検知を境界で必ず通す必要があります。詳細: server/src/shared/utils/xlsx-safe.ts）',
  },
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
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

const files = TARGET_DIRS.flatMap((d) => walk(join(ROOT, d)));
const findings = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  if (SKIP.some((s) => rel.includes(s.replace(/^\//, '')) || `/${rel}`.includes(s))) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // 「ここは意図してこう書いている」と書いた行は見逃す (逃げ道を1つだけ用意する)
    if (line.includes('ui-tokens-ok')) return;
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue;
      if (rule.extra && !rule.extra(line)) continue;
      findings.push({ rel, line: i + 1, id: rule.id, why: rule.why, text: line.trim().slice(0, 120) });
    }
  });
}

const serverFiles = SERVER_DIRS.flatMap((d) => walk(join(ROOT, d)));
for (const file of serverFiles) {
  const rel = relative(ROOT, file);
  if (SERVER_SKIP.some((s) => rel === s)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('ui-tokens-ok')) return;
    for (const rule of SERVER_RULES) {
      if (!rule.re.test(line)) continue;
      findings.push({ rel, line: i + 1, id: rule.id, why: rule.why, text: line.trim().slice(0, 120) });
    }
  });
}

if (findings.length === 0) {
  console.log(`[ui-tokens] ${files.length + serverFiles.length} ファイルを見ました。手で書かれた数字・見出し、禁止パターンはありません。`);
  process.exit(0);
}

console.error(`[ui-tokens] 直す必要がある箇所が ${findings.length} 件あります。\n`);
const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.id)) byRule.set(f.id, []);
  byRule.get(f.id).push(f);
}
for (const [id, list] of byRule) {
  console.error(`■ ${id} — ${list[0].why}`);
  for (const f of list) console.error(`   ${f.rel}:${f.line}  ${f.text}`);
  console.error('');
}
console.error('どうしてもその場で書く必要があるときは、その行に `ui-tokens-ok` のコメントを付けてください。');
process.exit(1);
