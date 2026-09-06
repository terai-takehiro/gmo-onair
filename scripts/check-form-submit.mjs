#!/usr/bin/env node
/**
 * **Enterキーで送れるようにしたフォームに、種類を書いていないボタンが無いか**を見る
 * （`npm run lint` の1つ）
 *
 * ── 何を止めるか ────────────────────────────────────────────
 *
 * `<FormDialog onSubmit={…}>` / `<Sheet onSubmit={…}>` / `<CrudFormDialog onSubmit={…}>` は、
 * 本文とフッターを1つの `<form>` で束ねます（`shared/src/client-v4/sheet.tsx`）。
 * **HTML の既定では、`<form>` の中の `<button>` は `type` を書かないと送信ボタン**です。
 * `shared/src/client/ui/button.tsx` の `<Button>` も `type` を既定していないので、
 * 同じ規則で送信になります。
 *
 * つまり `onSubmit` を足した瞬間、そのファイルにある
 * **「キャンセル」「削除」「閉じる」「1行足す」も押しただけで保存が走る**ようになります。
 * 型検査でも eslint でも捕まりません（JSX としては完全に正しいため）。
 *
 * そこで **`onSubmit` を渡しているファイルでは、すべてのボタンに `type` を書く**ことを
 * 機械で強制します。書くのは1語なので、迷ったら `type="button"` と書けば安全側に倒れます
 * （送信したいボタンにだけ `type="submit"` と書く）。
 *
 * ── なぜ `<Button>` の既定を `type="button"` にしないのか ────────
 *
 * 検討しましたが、**既に「`<form>` の中の `<Button>` が暗黙に送信ボタン」であることに
 * 頼っている画面が実在する**（送信ボタンに `type` を書いていないフォームがある）ため、
 * 既定を変えると**それらが黙って送れなくなります**。黙って壊れるほうが、
 * 「1語書け」と検査で言われるより高くつくので、部品の既定は動かさず検査で守ります。
 *
 * ── タグの終わりは正規表現では取れない（実際に素通りしていた）──────
 *
 * 最初の実装は開きタグを `<FormDialog[^>]*?onSubmit=` で拾っていましたが、
 * **`onSubmit` より前の属性に `>` が1つでもあると当たりません**。
 * JSX の属性値には `=>`（アロー関数）も `{/* … *\/}`（コメント）も普通に出るので、
 * 実測で**変換したダイアログの多くが検査されないまま `npm run lint` が緑**でした
 * （Codex のレビュー指摘 P2）。
 *
 * いまは `findTagEnd()` が**引用符と波括弧の深さを見ながら**開きタグの終わりを探します。
 * 完全な JSX パーサではありませんが、「文字列の中／式の中の `>` を数えない」という
 * この検査に必要な性質は満たします。
 *
 * ── 見る範囲 ────────────────────────────────────────────────
 *
 * ファイル単位で見ます（`<form>` の中だけを厳密に見るには本物の構文解析が要り、
 * 入れ子の範囲を当てにいくと今度はそこが静かに外れます）。対象になるのは
 * 「`onSubmit` を渡すフォームを持つファイル」だけで、そういうファイルは
 * 1つのフォームのために書かれているので、ファイル単位で十分に狭く収まります。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** `onSubmit` を受け取って中身を `<form>` で束ねる部品と、素の `<form>` */
const HOST_TAGS = ['FormDialog', 'Sheet', 'CrudFormDialog', 'form'];
/** 種類を書いてほしいボタン */
const BUTTON_TAGS = ['Button', 'button'];

/**
 * コメントを**同じ長さの空白に置き換えた**写しを作る（行番号がずれないように）。
 *
 * これが無いと、説明文の中に書いた `<button>` を実物と読み違えます
 * （`shared/src/client-v4/sheet.tsx` の解説コメントで実際に誤検知した）。
 * JSX の `{/* … *\/}` も中身は普通のブロックコメントなので、これで消えます。
 * 引用符の中の `//`（`https://…`）を消さないよう、文字列は素通りさせます。
 */
function stripComments(src) {
  const out = src.split('');
  let quote = null;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i += 1; }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let j = i; j < stop; j += 1) if (out[j] !== '\n') out[j] = ' ';
      i = stop - 1;
      continue;
    }
  }
  return out.join('');
}

/**
 * `start`（`<` の位置）から始まる JSX の**開きタグの終わり**（`>` の位置）を返す。
 * 引用符（`'` `"` 適当なテンプレート）と波括弧の深さを見て、
 * **文字列の中・式の中の `>` を数えない**。見つからなければ -1。
 */
function findTagEnd(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start + 1; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') { depth += 1; continue; }
    if (c === '}') { depth -= 1; continue; }
    if (c === '>' && depth === 0) return i;
  }
  return -1;
}

/** ファイルの中の `<Tag …>` を、開きタグの中身つきで拾う */
function* findTags(src, names) {
  const re = new RegExp(`<(${names.join('|')})(?=[\\s/>])`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const end = findTagEnd(src, m.index);
    if (end < 0) continue;
    yield { name: m[1], index: m.index, attrs: src.slice(m.index + m[1].length + 1, end) };
  }
}

const files = execFileSync('git', ['ls-files', '*.tsx'], { cwd: ROOT, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const problems = [];

for (const rel of files) {
  const raw = readFileSync(join(ROOT, rel), 'utf8');
  if (!raw.includes('onSubmit')) continue;
  const src = stripComments(raw);

  const hasFormHost = [...findTags(src, HOST_TAGS)].some((t) => /\bonSubmit\s*=/.test(t.attrs));
  if (!hasFormHost) continue;

  for (const tag of findTags(src, BUTTON_TAGS)) {
    // `{...props}` で外から渡している場合は判断できないので見逃す
    if (/\btype\s*=/.test(tag.attrs) || /\{\s*\.\.\./.test(tag.attrs)) continue;
    const line = src.slice(0, tag.index).split('\n').length;
    problems.push(`${rel}:${line}  <${tag.name}> に type がありません`);
  }
}

if (problems.length > 0) {
  console.error('Enter送信を有効にしたフォームに、種類を書いていないボタンがあります。');
  console.error('送信したいボタンには type="submit"、それ以外には type="button" を書いてください。');
  console.error('（`<form>` の中でこれを省くと、キャンセル・削除まで押した瞬間に保存が走ります）\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n合計 ${problems.length} 件`);
  process.exit(1);
}

console.log('check-form-submit: OK');
