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

/**
 * **放送に出る絵と、紙に出る絵**。画面設計の対象外なので色の決まりが違う。
 *  - 放送CG: 黒背景に金・白。UI のトークンを当てると絵が変わる
 *  - 全画面表示 (プロンプター・計時の表示機): 暗所で遠くから読む前提
 *  - 印刷 (技術資料・ラック図): 紙に出るので `--border` (#e6e9ed) では薄すぎる
 */
const NOT_A_SCREEN = [
  'client-awards/src/oneshot/headline/',
  'client-awards/src/oneshot/animation/',
  'client-awards/src/oneshot/modules/',
  'client-awards/src/oneshot/OneShotStage',
  'client-awards/src/oneshot/Ticker',
  'client-awards/src/oneshot/LowerThirdCG',
  'client-awards/src/oneshot/CountdownCG',
  'client-qsheet/src/pages/PrompterPage',
  'client-live/src/pages/TimerDisplayPage',
  'client-techsheet/src/pages/PrintPage',
  'client-equipment/src/pages/rackLayout/RackDisplay',
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
    id: 'empty-by-hand',
    // 一覧の代わりに**縦の場所を取るブロック**として出している「ありません」。
    // `text-center` を必須にしているのは、カードの中の1行の状態表示
    // (「待たせているものはありません」= 良い知らせ) や検索欄の注記まで
    // 拾ってしまうと、枠付きパネルに置き換えて逆に読みにくくなるため。
    re: /<(?:p|div)[^>]*className="[^"]*text-center[^"]*"[^>]*>\s*[^<>{]{0,40}(?:ありません|該当なし|見つかりません)/,
    why: '一覧が空のときは `<EmptyState title=… description=… />` を使います'
       + '（検索0件は `<NoSearchResults />`、権限が無いときは `<NoPermissionPanel />`）。'
       + '「データがありません」で終わらせず、**何が無いのかと次にやること**を書いてください',
  },
  {
    id: 'loading-by-hand',
    // ページ全体を差し替える読み込み表示。Delayed を通さないと一瞬で点滅する
    re: /if \s*\([^)]*\b(?:isLoading|isPending)\b[^)]*\)\s*(?:\{\s*)?return\b[^;]{0,200}animate-spin/,
    why: 'ページ全体の読み込みは `<Delayed><SkeletonRows /></Delayed>` を使います'
       + '（1秒未満はスピナーを出さない = 一瞬で返る取得で点滅させない。'
       + ' 画面の骨格は出したまま中身だけ骨組みにする）',
  },
  {
    id: 'browser-dialog',
    // ブラウザ標準の alert() / confirm()。`.alert(` のようなメソッド呼び出しは除く
    re: /(?<![\w.$])(?:window\.)?(alert|confirm)\s*\(/,
    why: '`alert()` / `confirm()` は使いません。'
       + '知らせるときは `notifyError()` / `notifySuccess()`（お知らせ帯）、'
       + '確認するときは `await confirmAction({ title, description, tone })` を使います'
       + '（ブラウザ標準のダイアログはデザインの外側に出て、押すまで他の操作ができず、'
       + '何が一緒に起きるかを書けません。v2.9.290 で 129 か所を置き換えました）',
  },
  {
    id: 'raw-palette',
    // Tailwind の生パレット (slate-800 / amber-500 …) を画面に直接書く。
    // v2.9.297 で 1,800 か所を共通トークンに置き換えた。放置すると
    // **アプリごとに違う灰色・違う赤**になり、「別のシステムに見える」に戻る。
    re: new RegExp(
      '\\b(?:bg|text|border|ring|from|to|via|divide|placeholder|accent|shadow|fill|stroke)'
      + '(?:-[a-z]+)?-'
      + '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal'
      + '|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)'
      + '-[0-9]{2,3}(?:/[0-9]{1,3})?\\b',
    ),
    why: '色は共通トークンから選びます'
       + '（面 = `bg-background` / `bg-card` / `bg-muted`、文字 = `text-foreground` / `text-muted-foreground`、'
       + '状態 = `success` / `warning` / `destructive` / `info`、AI = `ai`、'
       + '**意味を持たない見分けのための色 = `cat-1`〜`cat-8`**）。'
       + '生のパレットを書くと、同じ「灰色」がアプリごとに違う灰色になり、'
       + '状態の色 (赤 = 危ない) と区別の色 (話者3が赤) が混ざります',
    // まず現場の6アプリから。案件管理 (client) は残り 664 か所あるので次の版で入れる
    only: (rel) => rel.startsWith('client-') && !rel.startsWith('client/'),
  },
  {
    id: 'translucent-text',
    // 文字色に透明度を掛けると #8b929c より薄くなり、下地によっては読めない
    re: /\btext-(?:foreground|muted-foreground|warning-strong|destructive|success|info|primary|ai)\/[0-9]{1,3}\b/,
    why: '文字の色に透明度を掛けないでください'
       + '（補助テキストは **#5d6470 以上の濃さ**。`#8b929c` は白地で 3.08:1 しかなく'
       + ' AA を満たさないので使用禁止です。`text-muted-foreground/60` は白地で'
       + ' #9ea3ab 相当まで薄くなり、これを下回ります）。'
       + '薄くしたいときは透明度ではなく `text-muted-foreground` を使います',
    only: (rel) => rel.startsWith('client-') && !rel.startsWith('client/'),
  },
  {
    id: 'page-title-by-hand',
    // `lg:` と `sm:` の両方の変種を止める。**同じページに2つの段が出ていた**
    // (`/finance/import` は枠が `text-xl sm:text-2xl`、中身が `text-xl lg:text-2xl` だった)
    // 間に別のクラス (`font-bold` `text-foreground` …) が挟まっていても止める。
    // v2.9.297 まで `text-xl font-bold text-foreground sm:text-2xl` を見逃していた
    re: /\btext-xl\b[^"']{0,60}?\b(?:lg|sm|md):text-2xl\b/,
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

/**
 * 各アプリが**共通の土台に載っているか**を見る (v2.9.297)。
 *
 * ここを検査するのは、実際に外れていて画面が壊れていたから:
 *  - `client-awards` だけ `tokens.css` を読まず、色の変数が 21 個しか無かった
 *    (他は 207 個)。共通部品の `bg-success` などに色が付かない。
 *  - `client-awards` だけ Tailwind の `content` に `../shared/src/client/**` が
 *    無く、**共通部品のクラスが1つも生成されていなかった**。
 *  - `height: 100%` を書いていたのが `client` だけで、共通シェル (`h-full`) が
 *    6アプリで**中身の高さまで縮み**、レールが画面の途中で切れていた。
 *
 * どれも「動くけれど見た目が壊れる」ので、型でもテストでも気づけない。
 */
function checkAppFoundation() {
  const apps = [
    'client', 'client-qsheet', 'client-equipment', 'client-techsheet',
    'client-live', 'client-awards', 'client-daily',
  ];
  const out = [];
  for (const app of apps) {
    const cssPath = join(ROOT, app, 'src/index.css');
    let css = '';
    try { css = readFileSync(cssPath, 'utf8'); } catch { /* アプリが無ければ飛ばす */ continue; }
    if (!/@import\s+['"]@gmo-onair\/shared\/src\/client\/base\.css['"]/.test(css)) {
      out.push({
        rel: `${app}/src/index.css`, line: 1, id: 'app-foundation',
        text: '共通の土台を読んでいません',
        why: "各アプリの index.css は `@import '@gmo-onair/shared/src/client/base.css';` から始めます"
           + '（トークンと、html/body/#root の高さ・書体をここで配っています。'
           + '読まないと共通シェルが縮んでレールが画面の途中で切れます）',
      });
    }
    const cfgPath = join(ROOT, app, 'tailwind.config.ts');
    let cfg = '';
    try { cfg = readFileSync(cfgPath, 'utf8'); } catch { continue; }
    if (!/presets:\s*\[\s*preset/.test(cfg)) {
      out.push({
        rel: `${app}/tailwind.config.ts`, line: 1, id: 'app-foundation',
        text: '共通プリセットを継承していません',
        why: "`presets: [preset as Config]` で `shared/tailwind.preset.ts` を継承してください"
           + '（継承しないと `success` / `warning` / `info` / `ai` / `cat-1〜8` の色が存在せず、'
           + '共通部品が色無しで出ます）',
      });
    }
    if (!cfg.includes('../shared/src/client/**')) {
      out.push({
        rel: `${app}/tailwind.config.ts`, line: 1, id: 'app-foundation',
        text: 'content に共通部品が入っていません',
        why: "`content` に `'../shared/src/client/**/*.{js,ts,jsx,tsx}'` を入れてください"
           + '（入れないと**共通部品だけが使っているクラスが1つも生成されず**、'
           + 'レイアウトが崩れます。v2.9.297 まで リアルタイムCG がこの状態でした）',
      });
    }
  }
  return out;
}

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
const findings = checkAppFoundation();

for (const file of files) {
  const rel = relative(ROOT, file);
  if (SKIP.some((s) => rel.includes(s.replace(/^\//, '')) || `/${rel}`.includes(s))) continue;
  const notAScreen = NOT_A_SCREEN.some((s) => rel.startsWith(s));
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // 「ここは意図してこう書いている」と書いた行は見逃す (逃げ道を1つだけ用意する)
    if (line.includes('ui-tokens-ok')) return;
    for (const rule of RULES) {
      // 放送・印刷に出る絵は色の決まりが違うので、色の検査だけ外す
      if (notAScreen && (rule.id === 'raw-palette' || rule.id === 'translucent-text')) continue;
      if (rule.only && !rule.only(rel)) continue;
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
