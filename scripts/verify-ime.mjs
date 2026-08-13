#!/usr/bin/env node
/**
 * 日本語入力 (IME) が壊れていないかを実ブラウザで確かめる
 *
 * ── なぜスクリプトにしたか ──────────────────────────────────
 *
 * **コードを読んでも型を見ても気づけない**不具合だから。
 * この製品の入力欄は「打つ → ドキュメント全体を作り直す → collab (Y.Doc) を経由して
 * props が返る」形で、**value が返るのは 1 レンダー後**。生の controlled input のままだと
 * 変換 (composition) 中に React が DOM の値を古い props へ書き戻し、
 * **変換中の文字が二重に入る / 消える**。
 *
 * 実測 (v3.2.3 の LED/XR シーン): 「さくら」と打つと **「ささくさくらさくら」**。
 *
 * 打鍵の再現には CDP の `Input.imeSetComposition` を使う。
 * `page.keyboard.type()` では composition が起きないので**この不具合は再現しない**
 * (通り抜けてしまうので、キー入力の模倣で代用しないこと)。
 *
 * ── 何を見ているか ──────────────────────────────────
 *
 *  - `#buffered`: `client-qsheet/src/lib/useBufferedValue.ts` を通した入力欄。
 *    ここが「さくら」にならなければ **exit 1** (これが本番の入力欄と同じ形)
 *  - `#raw`: 生の controlled input。壊れることの確認用 (参考表示のみで、
 *    ここでは落とさない — ブラウザ側の実装が変われば壊れ方は変わり得る)
 *
 * 使い方:
 *   npm run verify:ime
 *   PW=/path/to/node_modules/playwright-core/index.mjs npm run verify:ime
 *
 * 前提: playwright-core (リポジトリの依存には入れない。verify:ui と同じ方針) と
 *       Chromium。既定の置き場は Dev Container / 実行環境のもの。
 */
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WORD = 'さくら'; // 変換を伴う語。ラテン文字では composition が起きないので日本語で見る

const { chromium } = await import(process.env.PW || '/tmp/node_modules/playwright-core/index.mjs');

// ── 1) ハーネスを一時ディレクトリに組み立ててビルド ──
// なぜ一時ディレクトリか: リポジトリ内に dist を作らない (Tailwind の content や
// Docker のビルド文脈に混ざらないようにする)。
const work = mkdtempSync(path.join(tmpdir(), 'verify-ime-'));
cpSync(path.join(ROOT, 'scripts/fixtures/ime-harness'), work, { recursive: true });
writeFileSync(
  path.join(work, 'vite.config.mjs'),
  `import { defineConfig } from ${JSON.stringify(path.join(ROOT, 'node_modules/vite/dist/node/index.js'))};
import react from ${JSON.stringify(path.join(ROOT, 'node_modules/@vitejs/plugin-react/dist/index.js'))};
const nm = (p) => ${JSON.stringify(path.join(ROOT, 'node_modules'))} + '/' + p;
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: '@qsheet/lib', replacement: ${JSON.stringify(path.join(ROOT, 'client-qsheet/src/lib'))} },
    { find: 'react-dom/client', replacement: nm('react-dom/client.js') },
    { find: /^react-dom$/, replacement: nm('react-dom/index.js') },
    { find: /^react\\/jsx-runtime$/, replacement: nm('react/jsx-runtime.js') },
    { find: /^react$/, replacement: nm('react/index.js') },
  ] },
  build: { outDir: 'dist', emptyOutDir: true },
});
`,
);
const build = spawnSync(
  process.execPath,
  [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mjs', '--logLevel', 'warn'],
  { cwd: work, encoding: 'utf8' },
);
if (build.status !== 0) {
  console.error('[verify-ime] ハーネスのビルドに失敗しました');
  console.error(build.stdout, build.stderr);
  process.exit(1);
}

// ── 2) 静的配信 ──
const dist = path.join(work, 'dist');
const server = createServer((req, res) => {
  const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': rel.endsWith('.js') ? 'text/javascript' : 'text/html' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// ── 3) 実ブラウザで変換入力を再現 ──
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await page.goto(url);

async function typeWithIme(selector) {
  await page.click(selector);
  // 変換中の状態を1文字ずつ更新する (実際の IME と同じ動き)
  for (let i = 1; i <= WORD.length; i++) {
    const part = WORD.slice(0, i);
    await cdp.send('Input.imeSetComposition', { text: part, selectionStart: part.length, selectionEnd: part.length });
    await page.waitForTimeout(60);
  }
  await cdp.send('Input.insertText', { text: WORD }); // 確定 (Enter)
  await page.waitForTimeout(800); // commit のデバウンス (500ms) を待つ
  await page.click('body'); // blur で取りこぼしなく commit
  await page.waitForTimeout(200);
}

const state = async (id) => ({
  shown: await page.inputValue(`#${id}`),
  stored: await page.textContent(`#${id}-stored`),
});
/** 他ユーザーがこの欄を書き換えた (フォーカスは奪わない) */
const remoteEdit = async (id, v) =>
  page.evaluate(([i, val]) => window.__remote[i](val), [id, v]);

const result = {};
for (const id of ['raw', 'buffered']) {
  await typeWithIme(`#${id}`);
  result[id] = await state(id);
}

// ── 4) 同時編集: フォーカス中に他ユーザーが変えた値を取りこぼさないか ──
// 取りこぼすと画面は古い値を出し続け、**次にこの欄を編集したときに相手の変更を
// 古い文字列で上書きする** (自分では気づけない消え方)。
await page.click('#buffered');
await remoteEdit('buffered', '他の人の値');
const whileFocused = await state('buffered');   // フォーカス中は取り込まない (カーソルが飛ぶため)
await page.click('body');                        // blur
await page.waitForTimeout(200);
const afterBlur = await state('buffered');       // ここで取り込む

// 自分が打っていたときは、自分の変更が勝つ (相手の値で上書きされない)
await page.click('#buffered');
await page.fill('#buffered', 'わたしの値');
await remoteEdit('buffered', '他の人の値2');
await page.click('body');
await page.waitForTimeout(200);
const localWins = await state('buffered');

await browser.close();
server.close();
rmSync(work, { recursive: true, force: true });

// ── 5) 判定 ──
const fmt = (r) => `入力欄「${r.shown}」/ 保存された値「${r.stored}」`;
let failed = false;
const check = (label, cond, detail) => {
  console.log(`[verify-ime] ${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed = true;
};

console.log(`[verify-ime] ① 「${WORD}」を IME で変換入力する`);
console.log(`[verify-ime]    buffered (useBufferedValue 経由・本番の入力欄と同じ形): ${fmt(result.buffered)}`);
console.log(`[verify-ime]    raw      (生の controlled input・参考)                : ${fmt(result.raw)}`);
check(
  `変換した文字がそのまま入る (期待「${WORD}」)`,
  result.buffered.shown === WORD && result.buffered.stored === WORD,
  'ドキュメントに書き込む入力欄は BufferedInput / BufferedTextarea を使うこと',
);
if (result.raw.stored === WORD) {
  console.warn('[verify-ime] ⚠ 生の input でも通ってしまいました。ブラウザ側の composition の扱いが');
  console.warn('[verify-ime]    変わった可能性があります (この検証が空振りしていないか確認してください)');
}

console.log('[verify-ime] ② フォーカス中に他ユーザーが書き換えたとき');
check('フォーカス中は取り込まない (カーソルが飛ばない)', whileFocused.shown === WORD, fmt(whileFocused));
check('blur で相手の値を取り込む', afterBlur.shown === '他の人の値', fmt(afterBlur));
check('自分が打っていたときは自分の変更が勝つ', localWins.stored === 'わたしの値', fmt(localWins));

if (failed) process.exit(1);
console.log('[verify-ime] OK');
