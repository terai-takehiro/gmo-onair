#!/usr/bin/env node
//
// v4 モックアップから「実装するときに必要な情報」だけを抜き出して
// docs/design/v4/*.md に落とす。
//
// なぜこれがあるか:
//   モックアップは1ファイル 122KB〜675KB ある (合計 2.3MB)。画面を実装するたびに
//   ここを grep すると毎回同じ読み込みコストを払うことになる。実装で本当に必要なのは
//     (1) その画面が扱うデータの項目名 (= 列定義)
//     (2) 寸法・色・字送りの確定値
//   の2つだけなので、1度機械的に抜き出して小さな md にしておく。
//   レイアウトはテキストにするより**ブラウザでモックを開くほうが速い**ので、そこは扱わない。
//
// 実行: node scripts/extract-v4-design.mjs
//   デザインが更新されたら mockups/ を差し替えて再実行する (出力は全部生成物)。
//
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs/design/v4/mockups');
const OUT = path.join(ROOT, 'docs/design/v4');

/** モックのファイル名 → v4 のアプリ名と出力ファイル名 */
const APPS = {
  'v4-mockup-main': { label: '共通・案件管理', out: 'projects.md', scope: 'v4.0.0 対象' },
  'v4-mockup-project': { label: 'プロジェクト管理 (新規)', out: 'gpm.md', scope: 'v4.0.0 対象' },
  'v4-mockup-finance': { label: '財務管理', out: 'finance.md', scope: 'v4.0.0 対象' },
  'v4-mockup-calendar': { label: 'カレンダー', out: 'schedule.md', scope: 'v4.0.0 対象' },
  'v4-mockup-settings': { label: '設定', out: 'settings.md', scope: 'v4.0.0 対象' },
  'v4-mockup-equipment': { label: '機材管理', out: 'equipment.md', scope: 'v4.0.0 対象' },
  'v4-mockup-dailyops': { label: '日常業務', out: 'daily.md', scope: 'v4.0.0 対象' },
  'v4-mockup-production': { label: '制作資料 (Qシート)', out: 'production.md', scope: '凍結 — v4.1 以降' },
};

// ── 括弧の対応を取って literal を切り出す ─────────────────────────
// 正規表現では入れ子を追えない。文字列・テンプレートリテラル・コメントの中の
// 括弧を数えてしまうと必ずずれるので、状態を持って走査する。
function sliceLiteral(text, openIdx) {
  const open = text[openIdx];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let i = openIdx;
  let quote = null; // "'" | '"' | '`' | null
  while (i < text.length) {
    const c = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (c === quote && prev !== '\\') quote = null;
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
    } else if (c === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i);
      if (i === -1) break;
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i);
      if (i === -1) break;
      i += 1;
    } else if (c === open || c === '[' || c === '{' || c === '(') {
      if (c === open) depth++;
      else depth += 0; // 他種の括弧は深さに数えない (対応さえ取れれば良い)
    } else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
    i++;
  }
  return null;
}

/** オブジェクト literal の**最上位**のキー名だけを取る */
function topLevelKeys(objText) {
  const keys = [];
  let depth = 0;
  let quote = null;
  let i = 0;
  let atKeyPos = false;
  while (i < objText.length) {
    const c = objText[i];
    const prev = objText[i - 1];
    if (quote) {
      if (c === quote && prev !== '\\') quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; i++; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; if (depth === 1) atKeyPos = true; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; continue; }
    if (depth === 1 && c === ',') { atKeyPos = true; i++; continue; }
    if (depth === 1 && atKeyPos && /[A-Za-z_$]/.test(c)) {
      const m = objText.slice(i).match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (m) { keys.push(m[1]); i += m[1].length; atKeyPos = false; continue; }
      atKeyPos = false;
    }
    if (depth === 1 && !/\s/.test(c)) atKeyPos = false;
    i++;
  }
  return keys;
}

/** 配列 literal の最上位の要素を数える */
function countEntries(arrText) {
  let depth = 0;
  let quote = null;
  let n = 0;
  for (let i = 0; i < arrText.length; i++) {
    const c = arrText[i];
    const prev = arrText[i - 1];
    if (quote) { if (c === quote && prev !== '\\') quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '[' || c === '{' || c === '(') { depth++; if (depth === 2 && c === '{') n++; continue; }
    if (c === ']' || c === '}' || c === ')') depth--;
  }
  return n;
}

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)} …` : s);

// ── 画面一覧 ────────────────────────────────────────────────
function extractScreens(text) {
  const found = new Map();
  // 「① ダッシュボード」のように丸数字が付いたラベルが画面切替タブになっている
  for (const m of text.matchAll(/label:\s*'([①②③④⑤⑥⑦⑧⑨⑩][^']*)'/g)) {
    found.set(m[1], true);
  }
  return [...found.keys()];
}

// ── その画面が扱うデータ ──────────────────────────────────────
function extractData(text) {
  const out = [];
  // クラス本体のフィールド。`  NAME = [` の形 (インデント2)
  for (const m of text.matchAll(/^ {2}([A-Z][A-Z0-9_]*)\s*=\s*\[/gm)) {
    const openIdx = m.index + m[0].length - 1;
    const arr = sliceLiteral(text, openIdx);
    if (!arr) continue;
    const firstObj = arr.indexOf('{');
    const keys = firstObj === -1 ? [] : topLevelKeys(sliceLiteral(arr, firstObj) || '');
    // 文字列だけの配列 (['案件管理', ...]) は列定義ではないので短く出す
    if (!keys.length) {
      out.push({ name: m[1], count: null, keys: [], sample: clip(oneLine(arr), 160) });
      continue;
    }
    out.push({
      name: m[1],
      count: countEntries(arr),
      keys,
      sample: clip(oneLine(sliceLiteral(arr, firstObj) || ''), 320),
    });
  }
  return out;
}

// ── 使われている寸法・色を数える ────────────────────────────────
const TALLY_PROPS = [
  'color', 'background', 'background-color', 'border', 'border-top', 'border-bottom',
  'border-radius', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'gap', 'padding', 'height', 'min-height', 'width', 'box-shadow',
];

function tallyStyles(text, tally) {
  for (const m of text.matchAll(/style(?:-hover)?="([^"]*)"/g)) {
    for (const decl of m[1].split(';')) {
      const i = decl.indexOf(':');
      if (i === -1) continue;
      const prop = decl.slice(0, i).trim();
      const value = decl.slice(i + 1).trim();
      if (!TALLY_PROPS.includes(prop) || !value || value.includes('{{')) continue;
      const key = `${prop}|${value}`;
      tally.set(key, (tally.get(key) || 0) + 1);
    }
  }
  // 色は色だけで別集計 (border: 1px solid #e6e9ed のような複合値からも拾う)
  for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const key = `色|${m[0].toLowerCase()}`;
    tally.set(key, (tally.get(key) || 0) + 1);
  }
}

function tallySection(tally, prop, { min = 3, top = 24 } = {}) {
  const rows = [...tally]
    .filter(([k]) => k.startsWith(`${prop}|`))
    .map(([k, n]) => [k.slice(prop.length + 1), n])
    .sort((a, b) => b[1] - a[1]);
  const shown = rows.filter(([, n]) => n >= min).slice(0, top);
  const rest = rows.length - shown.length;
  if (!shown.length) return '';
  const lines = shown.map(([v, n]) => `| \`${v}\` | ${n} |`).join('\n');
  const tail = rest > 0 ? `\n\n他 ${rest} 種 (${min} 回未満または上位 ${top} 件の外)。` : '';
  return `\n### ${prop}\n\n| 値 | 使用回数 |\n| --- | --- |\n${lines}${tail}\n`;
}

// ── 出力 ────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => f.endsWith('.dc.html') && f.startsWith('v4-mockup-'));
const tally = new Map();
const index = [];

for (const file of files) {
  const base = file.replace('.dc.html', '');
  const meta = APPS[base];
  if (!meta) {
    console.warn(`[v4-design] 未知のモック: ${file} (APPS に追加してください)`);
    continue;
  }
  const text = readFileSync(path.join(SRC, file), 'utf8');
  tallyStyles(text, tally);

  const screens = extractScreens(text);
  const data = extractData(text);

  const body = [
    `# ${meta.label} — v4 の画面仕様`,
    '',
    '> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。',
    `> 元データ: [\`mockups/${file}\`](mockups/${file}) (${Math.round(text.length / 1024)}KB)`,
    '>',
    '> **レイアウトはここを読むより[モックをブラウザで開く](mockups/' + file + ')ほうが速い。**',
    '> ここには「grep すると高い情報」＝画面が扱うデータの項目名だけを置いています。',
    `> 共通の寸法・色は [\`_tokens.md\`](_tokens.md)、守る規律は [\`_rules.md\`](_rules.md)。`,
    '',
    `**v4.0.0 のスコープ**: ${meta.scope}`,
    '',
    screens.length ? `## 画面一覧 (${screens.length})\n\n${screens.map((s) => `- ${s}`).join('\n')}\n` : '',
    `## 画面が扱うデータ (${data.length} 定義)`,
    '',
    '実装するときは、ここの項目名をそのまま型と列定義に使ってください',
    '(モックのサンプル値は現実的な値なので、桁数・文字数の見当にも使えます)。',
    '',
    ...data.map((d) => {
      if (!d.keys.length) return `### ${d.name}\n\n\`${d.sample}\`\n`;
      return [
        `### ${d.name}${d.count ? ` — ${d.count} 件` : ''}`,
        '',
        `**項目 (${d.keys.length})**: ${d.keys.map((k) => `\`${k}\``).join(' / ')}`,
        '',
        '```js',
        d.sample,
        '```',
        '',
      ].join('\n');
    }),
  ].join('\n');

  writeFileSync(path.join(OUT, meta.out), `${body.replace(/\n{3,}/g, '\n\n')}\n`);
  index.push({ ...meta, out: meta.out, screens: screens.length, data: data.length });
}

// 観測されたトークン
const tokensObserved = [
  '# モックで実際に使われている値 (観測結果)',
  '',
  '> **この文書は生成物です。** `node scripts/extract-v4-design.mjs` で作られます。',
  '> 8つのモックアップの `style="..."` を全部数えたものです。',
  '>',
  '> **設計方針としての正は [`_tokens.md`](_tokens.md)** (ハンドオフの README が定めた確定値)。',
  '> こちらは「実際にどれがよく使われているか」を見て、',
  '> トークンに登録すべき段 (角丸9段・ボタン高・列幅など) を決めるための資料です。',
  '',
  tallySection(tally, '色', { min: 5, top: 40 }),
  tallySection(tally, 'font-size'),
  tallySection(tally, 'font-weight'),
  tallySection(tally, 'border-radius'),
  tallySection(tally, 'height'),
  tallySection(tally, 'min-height'),
  tallySection(tally, 'gap'),
  tallySection(tally, 'padding', { min: 5, top: 30 }),
  tallySection(tally, 'line-height'),
  tallySection(tally, 'letter-spacing'),
  tallySection(tally, 'box-shadow', { min: 2, top: 10 }),
].join('\n');
writeFileSync(path.join(OUT, '_tokens-observed.md'), `${tokensObserved}\n`);

console.log(`[v4-design] ${index.length} アプリ / 画面 ${index.reduce((n, a) => n + a.screens, 0)} / データ定義 ${index.reduce((n, a) => n + a.data, 0)}`);
for (const a of index) console.log(`  ${a.out.padEnd(16)} ${a.label} (画面 ${a.screens} / データ ${a.data})`);
console.log(`  _tokens-observed.md  観測値 ${tally.size} 種`);
