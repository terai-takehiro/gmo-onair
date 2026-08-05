#!/usr/bin/env node
//
// 設計トークン (色) の契約を検査する。
//
// なぜこれがあるか:
//   色は「文字列を書けば通ってしまう」ので、間違えても**エラーにならず黙って色が付かない**。
//   実際に起きていた事故:
//
//   ① **定義していない色を参照していた。** `shared/tailwind.preset.ts` が
//      `var(--foo)` を参照しても、`tokens.css` に `--foo` が無ければ CSS は
//      その宣言を捨てるだけ。**画面は無色で描かれ、誰も気づかない。**
//   ② **コメントの hex と実際の色が違っていた。** HSL の3つ組は元の色に戻せないので、
//      `--primary: 209 100% 34%; /* #005bac */` と書いてあっても実際は `#005aad`
//      だった (7 トークンで食い違っていた。ブランド色の GMO ブルーを含む)。
//      → T1 で **RGB の3つ組**に変え、値とコメントが1桁ずつ照合できる形にした。
//   ③ **暗い配色 (`.dark`) にだけ定義が無い**と、その色だけ明るい配色の値に落ちる。
//      放送中の画面 (Qシート OnAir / ランダウン) は `.dark` を意図して使うので、
//      抜けると**本番進行中に読めない色**になる。
//
// 実行:
//   node scripts/check-tokens.mjs        # 検査 (npm run lint から呼ばれる)
//
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = path.join(ROOT, 'shared/src/client/tokens.css');
const PRESET = path.join(ROOT, 'shared/tailwind.preset.ts');

const problems = [];
const bad = (where, detail) => problems.push({ where, detail });

const css = readFileSync(TOKENS, 'utf8');

/** `:root { ... }` / `.dark { ... }` の中身を取り出す */
function block(selector, text = css) {
  const src = text;
  // 最初に現れる `<selector> {` から、対応する `}` まで
  const re = new RegExp(`${selector.replace('.', '\\.')}\\s*\\{`, 'g');
  const out = [];
  for (const m of src.matchAll(re)) {
    let depth = 1, i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    out.push(src.slice(start, i - 1));
  }
  return out.join('\n');
}

/** 3つ組 (RGB) のトークンだけを拾う。フォント・角丸・寸法は対象外 */
function colorTokens(text) {
  const map = new Map();
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = m[1];
    const value = m[2].trim();
    const nums = value.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
    if (nums) map.set(name, [+nums[1], +nums[2], +nums[3]]);
    // HSL の3つ組が残っていたら**変換漏れ**。RGB として読むと全く違う色になる
    else if (/^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(value)) {
      bad(path.relative(ROOT, TOKENS), `${name}: ${value} — HSL のままです。RGB の3つ組に直してください`);
    }
  }
  return map;
}

const light = colorTokens(block(':root'));
const dark = colorTokens(block('.dark'));

// ── ① 値が 0〜255 に収まっているか ──────────────────────────
for (const [set, name] of [[light, ':root'], [dark, '.dark']]) {
  for (const [tok, rgb] of set) {
    if (rgb.some((v) => v > 255)) {
      bad(`tokens.css ${name}`, `${tok}: ${rgb.join(' ')} — 0〜255 の範囲外です`);
    }
  }
}

// ── ② 明るい配色と暗い配色で定義がそろっているか ──────────────
// 暗い配色に無いトークンは、明るい配色の値のまま描かれる (黙って読めない色になる)。
//
// ただし **v4 で足した一群は明るい配色のみ**。v4 の画面はモックに暗い配色が無く、
// 使う予定の無い色を先に決めると誰も見ていない値を保守することになる。
// v4 の画面を暗くするときにまとめて決める。
// (暗い配色を使っているのは凍結アプリの放送画面 = Qシートの OnAir / ランダウンだけで、
//  そこは v4 のトークンを1つも参照しない)
const LIGHT_ONLY = [
  /-surface(-weak)?$/,          // 帯の背景 (success-surface など)
  /^--border-(subtle|faint|disabled)$/,
  /^--primary-border(-strong)?$/,
  /-border(-strong)?$/,         // 状態の帯の枠 (success-border など)
  /^--surface-subtle$/,
  /^--fg-disabled$/,
  /^--ai(-foreground)?$/,
  /^--cat-[1-8]$/,
];
const lightOnly = (tok) => LIGHT_ONLY.some((re) => re.test(tok));

for (const tok of light.keys()) {
  if (!dark.has(tok) && !lightOnly(tok)) {
    bad('tokens.css .dark', `${tok} が暗い配色に無い (明るい配色の値のまま描かれます)`);
  }
}
for (const tok of dark.keys()) {
  if (!light.has(tok)) bad('tokens.css :root', `${tok} が明るい配色に無い`);
}

// ── ③ preset が参照する色がすべて定義されているか ──────────────
// **これが無いと、未定義の色を参照しても黙って無色になる。**
const preset = readFileSync(PRESET, 'utf8');
for (const m of preset.matchAll(/rgb\(var\((--[a-z0-9-]+)\)/g)) {
  if (!light.has(m[1])) {
    bad('tailwind.preset.ts', `var(${m[1]}) を参照しているが tokens.css に定義が無い (黙って無色になります)`);
  }
}

// ── ④ v4 の上書き (tokens-v4.css) が効く形になっているか ────────
//
// `tokens-v4.css` は **v4 対象3アプリだけ**が読む上書き層 (base.css 経由)。
// ここで名前を打ち間違えても CSS は黙って新しい変数を1つ作るだけなので、
// **上書きしたつもりの色が元のまま**になる。画面を見ても「なんとなく違う」
// としか分からず、原因に辿り着けない。
{
  const V4 = path.join(ROOT, 'shared/src/client/tokens-v4.css');
  if (existsSync(V4)) {
    const v4 = colorTokens(block(':root', readFileSync(V4, 'utf8')));
    for (const [tok, rgb] of v4) {
      if (!light.has(tok)) {
        bad('tokens-v4.css', `${tok} は tokens.css に無い名前 — 上書きにならず、新しい変数を作っているだけです`);
      }
      if (rgb.some((v) => v > 255)) bad('tokens-v4.css', `${tok}: ${rgb.join(' ')} — 0〜255 の範囲外です`);
    }
    // 上書きの意味が無い (元と同じ値) ものは、消し忘れか写し間違い
    for (const [tok, rgb] of v4) {
      const base = light.get(tok);
      if (base && base.join(' ') === rgb.join(' ')) {
        // `--card` のように「変えないことを明示する」目的の行は許す。
        // ただし数が増えると差分が読めなくなるので、コメントで意図を書くこと。
      }
    }
    if (!/@import\s+['"]\.\/tokens-v4\.css['"]/.test(readFileSync(path.join(ROOT, 'shared/src/client/base.css'), 'utf8'))) {
      bad('base.css', "tokens-v4.css を import していません (v4 の色が当たりません)");
    }
  }
}

// ── ⑤ 書き方が RGB に揃っているか ────────────────────────────
// `hsl(var(--x))` が残っていると、RGB の3つ組を HSL として読んで**全く違う色**になる。
// リアルタイムCG は自前の HSL トークンと自前の tailwind 設定で完結しているので対象外。
for (const m of preset.matchAll(/hsl\(var\(--[a-z0-9-]+\)/g)) {
  bad('tailwind.preset.ts', `${m[0]}...) が残っています。トークンは RGB の3つ組なので rgb(...) にしてください`);
}

if (problems.length) {
  console.error(`\n✗ 設計トークンの契約に違反しています (${problems.length} 件)\n`);
  for (const { where, detail } of problems) console.error(`    ${where}\n      ${detail}`);
  console.error(
    '\n  色は間違えても**エラーにならず黙って色が付かない**ので、ここで止めています。\n' +
      '  値は RGB の3つ組 (`--primary: 0 90 173`)、参照は `rgb(var(--primary) / <alpha-value>)`。\n'
  );
  process.exit(1);
}

console.log(`[tokens] OK (色 ${light.size} 個 / 暗い配色 ${dark.size} 個 / preset の参照はすべて定義済み)`);
