#!/usr/bin/env node
/**
 * 凍結2アプリの CSS が変わっていないかを突き合わせる。
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * v4.0.0 の決めごとは「**制作資料・計時LIVE・リアルタイムCG は
 * 見た目を今日のまま**」でした（技術資料は v4.1.8 でアプリごと削除）。
 * **制作資料は v4.1 で凍結を解いたのでこの検査からは外れた**（下記 APPS 参照）。
 * ところが各アプリの Tailwind は
 * `shared/src/client/**` を走査するので、**あちらが描かない部品のクラス名を
 * 1つ書き足すだけで、凍結アプリの CSS に規則が増えます**
 * （`shared/CLAUDE.md`。コメントの中に書いただけで増えた例が3回あります）。
 *
 * これまで基準の md5 は**どこにも書かれておらず、人の記憶の中**にありました。
 * その結果、`pt-1` が `shared` から消えて技術資料の CSS が 25 バイト縮んだとき、
 * **「自分が漏らしたのか」を切り分けるところから始める**ことになりました。
 * → 基準をファイルに置いて、機械が突き合わせます。
 *
 * ── 使い方 ──────────────────────────────────────────────────
 *
 *   npm run build:all            # 先にビルドが要る（dist の CSS を見る）
 *   npm run check:frozen         # 突き合わせ
 *   npm run check:frozen -- --update "理由"   # 基準を更新（**理由が必須**）
 *
 * **`npm run lint` には入れていません。** ビルド済みの `dist` が要るので、
 * lint（数秒）に混ぜると毎回2分のビルドを強いることになります。
 * CI とリリース前、`shared/src/client/` を触った PR で回してください。
 *
 * ── 基準を更新してよいとき ──────────────────────────────────
 *
 * **「増えた」ときは原則ダメ**です。属性 ＋ `tokens-v4.css` に逃がしてください
 * （v4 対象3アプリしか読まないので凍結アプリに漏れません）。
 * **「減った」ときは、そのアプリがその規則を使っていないことを確かめてから**
 * 更新します（使っていなければ描画は1ピクセルも変わりません）。
 * `--update` は理由を書かせて、その1行を基準ファイルに残します。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'frozen-css-baseline.json');

/**
 * 凍結2アプリ。`awards` は共通 preset を継承していないので本来 shared の影響を受けない。
 *
 * ⚠️ 制作資料 (Qシート) は v4.1 で凍結を解いたのでここから外した。
 * 見た目を「今日のまま」に保つ対象ではなくなったため、この検査は追わない
 * (03-app-structure-impl.md §7-2)。
 */
const APPS = [
  { key: 'live', label: '計時LIVE', dir: 'client-live' },
  { key: 'awards', label: 'リアルタイムCG', dir: 'client-awards' },
];

function cssOf(dir) {
  const assets = join(ROOT, dir, 'dist', 'assets');
  if (!existsSync(assets)) return null;
  const css = readdirSync(assets).filter((f) => f.endsWith('.css')).sort();
  if (css.length === 0) return null;
  // 複数あるときは全部つなぐ（分割されても検出できるように）
  return css.map((f) => readFileSync(join(assets, f))).reduce((a, b) => Buffer.concat([a, b]));
}

const updateAt = process.argv.indexOf('--update');
const reason = updateAt >= 0 ? process.argv[updateAt + 1] : null;

if (updateAt >= 0 && !reason) {
  console.error('✗ --update には理由が要ります（基準を黙って動かさないため）');
  console.error('  例: npm run check:frozen -- --update "pt-1 が shared から消えた。技術資料は使っていないので描画は不変"');
  process.exit(1);
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { apps: {} };
const now = {};
const missing = [];

for (const app of APPS) {
  const buf = cssOf(app.dir);
  if (!buf) { missing.push(app); continue; }
  now[app.key] = { md5: createHash('md5').update(buf).digest('hex'), bytes: buf.length };
}

if (missing.length > 0) {
  console.error(`✗ ビルドされていないアプリがあります: ${missing.map((a) => a.dir).join(', ')}`);
  console.error('  先に `npm run build:all` を回してください（凍結アプリは既定の build に入りません）');
  process.exit(1);
}

if (updateAt >= 0) {
  const history = base.history ?? [];
  for (const app of APPS) {
    const old = base.apps?.[app.key];
    if (old && old.md5 !== now[app.key].md5) {
      history.push({
        app: app.key,
        from: old.md5,
        to: now[app.key].md5,
        bytes: now[app.key].bytes - old.bytes,
        reason,
      });
    }
  }
  writeFileSync(BASELINE, `${JSON.stringify({ apps: now, history }, null, 2)}\n`);
  console.log('[frozen-css] 基準を更新しました:');
  for (const app of APPS) console.log(`  ${app.label.padEnd(20)} ${now[app.key].md5}  ${now[app.key].bytes} バイト`);
  process.exit(0);
}

let bad = 0;
for (const app of APPS) {
  const old = base.apps?.[app.key];
  const cur = now[app.key];
  if (!old) { console.log(`· ${app.label} は基準が無いので見ていません`); continue; }
  if (old.md5 === cur.md5) continue;
  bad += 1;
  const diff = cur.bytes - old.bytes;
  console.error(`\n✗ ${app.label} の CSS が変わっています`);
  console.error(`    基準 ${old.md5}  ${old.bytes} バイト`);
  console.error(`    いま ${cur.md5}  ${cur.bytes} バイト（${diff > 0 ? '+' : ''}${diff}）`);
  if (diff > 0) {
    console.error('    → **増えています。** `shared/src/client/` に新しいクラス名を書いていませんか');
    console.error('       （コメントの中でも Tailwind に拾われます）。');
    console.error('       見た目の切り替えは **属性 ＋ `tokens-v4.css`** に逃がしてください。');
  } else {
    console.error('    → 減っています。そのアプリがその規則を使っていないなら描画は不変です。');
    console.error('       確かめたうえで `npm run check:frozen -- --update "理由"` で基準を動かしてください。');
  }
}

if (bad > 0) {
  console.error(`\n凍結アプリの決めごとは「見た目を今日のまま」です（${bad} 本ずれています）。`);
  process.exit(1);
}
console.log(`[frozen-css] OK (凍結2アプリの CSS は基準どおり)`);
