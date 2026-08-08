#!/usr/bin/env node
/**
 * すべての画面が「スマホで触る」か「PC で触る」かを**宣言しているか**数える（M2）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 375px の 63 画面を実測したところ、**「PC で」と書いて止めていたのは 6 枚だけ**で、
 * 残りは判断せずに縦に畳んだだけでした。困るのは崩れることそのものより、
 * **「どこが手つかずか誰にも分からない」**ことです。出ないだけなので誰も報告せず、
 * 作った側は PC で見ているので気づきません。
 *
 * ここで **`App.tsx` のルート**と **2つの宣言リスト**を突き合わせ、
 * **どちらにも入っていない画面があれば止めます**。新しい画面を足した人は
 * 必ずどちらかに入れることになるので、決めないまま出せなくなります。
 *
 * ── 数えないもの ────────────────────────────────────────────
 *
 * ログイン・認証の戻り・サイネージ（表示機）・`*`（見つからない）と、
 * **`<Navigate>` だけのルート（転送）**。転送は画面ではありません。
 */
import { readFileSync } from 'node:fs';

/** @type {{app: string, routes: string, decl: string, pcConst: string, okConst: string}[]} */
const APPS = [
  {
    app: '案件管理ほか (client)',
    routes: 'client/src/App.tsx',
    decl: 'client/src/pcOnlyScreens.ts',
    pcConst: 'CLIENT_PC_ONLY',
    okConst: 'CLIENT_MOBILE_OK',
  },
  {
    app: '日常業務 (client-daily)',
    routes: 'client-daily/src/App.tsx',
    decl: 'client-daily/src/pcOnlyScreens.ts',
    pcConst: 'DAILY_PC_ONLY',
    okConst: 'DAILY_MOBILE_OK',
  },
  {
    app: '機材管理 (client-equipment)',
    routes: 'client-equipment/src/App.tsx',
    decl: 'client-equipment/src/pcOnlyScreens.ts',
    pcConst: 'EQUIPMENT_PC_ONLY',
    okConst: 'EQUIPMENT_MOBILE_OK',
  },
];

/** 画面として数えないパス */
const SKIP = new Set(['*', '/login', '/equipment/login', '/auth/callback', '/auth/accept-invitation']);
const SKIP_PREFIX = ['/signage/'];

/**
 * `App.tsx` から `<Route path="…">` を拾う。
 *
 * **`<Navigate` を含む要素は飛ばす**（転送であって画面ではない）。
 * `<Route>` は複数行に分かれることがあるので、`<Route` から次の `<Route` または
 * `</Route` までを1つの塊として読む。
 */
function routesOf(file) {
  // **注記を先に落とす。** 説明文の中に書かれた `<Navigate` や URL を拾うと、
  // 転送でないルートを転送と誤判定する
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // `<Route` から次の `<Route` までが1つの塊（子は別の塊になる）
  const chunks = src.split(/(?=<Route\b)/g).slice(1);
  const out = [];
  for (const c of chunks) {
    // `<Route index element={…} />` は親の入口 = `/`
    const m = /path="([^"]*)"/.exec(c);
    const path = m ? m[1] : (/<Route\s+index\b/.test(c) ? '/' : null);
    if (path === null) continue;
    // **転送は画面ではない。** `<Navigate>` と `Redirect…` という名前の部品の両方
    if (/<Navigate\b/.test(c) || /<Redirect[A-Za-z]*\b/.test(c)) continue;
    // 入れ子の親（`element={<AppShell />}` で子を持つもの）は画面ではない
    if (/<AppShell\b/.test(c)) continue;
    if (SKIP.has(path)) continue;
    if (SKIP_PREFIX.some((p) => path.startsWith(p))) continue;
    // 旧 URL の受け皿（`/projects/*` のようなワイルドカード）は転送用
    if (path.endsWith('/*')) continue;
    out.push(path);
  }
  return [...new Set(out)];
}

/** 宣言ファイルから配列の中身（`path:` の値、または素の文字列）を拾う */
function declared(file, constName, key) {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf(`export const ${constName}`);
  if (start < 0) throw new Error(`${file} に ${constName} がありません`);
  // 次の `export const` までを対象にする
  const rest = src.slice(start + 10);
  const nextExport = rest.indexOf('\nexport const ');
  const body = nextExport < 0 ? rest : rest.slice(0, nextExport);
  const re = key ? /path:\s*'([^']+)'/g : /'(\/[^']*)'/g;
  return [...body.matchAll(re)].map((m) => m[1]);
}

let bad = 0;
for (const a of APPS) {
  const routes = routesOf(a.routes);
  const pc = declared(a.decl, a.pcConst, true);
  const ok = declared(a.decl, a.okConst, false);
  const known = new Set([...pc, ...ok]);

  const missing = routes.filter((r) => !known.has(r));
  // 宣言したのにルートが無い＝画面を消したあとの消し忘れ。放っておくと表が信用できなくなる
  const stale = [...known].filter((k) => !routes.includes(k) && !k.startsWith('/sales/tasks/gantt'));

  console.log(`\n■ ${a.app}  画面 ${routes.length} / PC で触る ${pc.length} / スマホ ${ok.length}`);
  if (missing.length) {
    bad += missing.length;
    console.log('  ✕ どちらにも入っていない画面があります:');
    for (const m of missing) console.log(`      ${m}`);
  }
  if (stale.length) {
    bad += stale.length;
    console.log('  ✕ 宣言だけ残っていてルートが無いものがあります:');
    for (const m of stale) console.log(`      ${m}`);
  }
  if (!missing.length && !stale.length) console.log('  ○ すべて宣言されています');
}

if (bad > 0) {
  console.log(`\n${bad} 件。**${APPS[0].decl} の書き方**にならって、`);
  console.log('その画面を「スマホで触る（…_MOBILE_OK）」か「PC で触る（…_PC_ONLY）」の');
  console.log('どちらかに入れてください。決めないまま出すと、手つかずの画面に誰も気づけません。');
  process.exit(1);
}
console.log('\nすべての画面が宣言されています。');
