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
 * ── 見る範囲 ────────────────────────────────────────────────
 *
 * ファイル単位で見ます（正確には `<form>` の中だけを見たいところですが、JSX を構文解析
 * せずに入れ子の範囲を当てるのは当てになりません）。対象になるのは
 * 「`onSubmit` を渡すダイアログを持つファイル」だけで、そういうファイルは
 * 1つのフォームのために書かれているので、ファイル単位で十分に狭く収まります。
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** `onSubmit` を受け取る（＝中身を `<form>` で束ねる）部品 */
const FORM_HOSTS = /<(FormDialog|Sheet|CrudFormDialog)\b[^>]*?\bonSubmit=/s;

const files = execFileSync('git', ['ls-files', '*.tsx'], { cwd: ROOT, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const problems = [];

for (const rel of files) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  if (!FORM_HOSTS.test(src)) continue;

  const tag = /<(Button|button)\b([^>]*?)\/?>/gs;
  let m;
  while ((m = tag.exec(src))) {
    // `{...props}` で外から渡している場合は判断できないので見逃す
    if (/\btype=/.test(m[2]) || /\{\.\.\./.test(m[2])) continue;
    const line = src.slice(0, m.index).split('\n').length;
    problems.push(`${rel}:${line}  <${m[1]}> に type がありません`);
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
