/**
 * Google Fonts を手元に取り置いて、検証用ブラウザに**本物の書体で描かせる**。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 開発用のコンテナ (Dev Container / Claude のサンドボックス) から**ブラウザは
 * `fonts.googleapis.com` に出られない**。そのため `verify:ui` は
 *
 *   - 「書体が実際に届いている」が**必ず落ちる** (毎回出る、直しようのない赤)
 *   - **座標を測る検査 (横はみ出し・中身が隠れていない・金額の右端・バッジの列)
 *     が代替書体の字幅で測られる** — 本番と違う数字を見て合否を出していた
 *
 * という状態だった。40px で同じ文字列の幅を測った実測 (本物 / 代替):
 *
 *   LINE Seed JP  ラテン 376.09 / 385.31 ・和文 400.00 / 401.88 ・混在 541.97 / 537.56
 *   Noto Sans JP  ラテン 340.13 / 385.31 (凍結アプリ。**13% も違う**)
 *
 * **和文はほぼ同じ幅で、差が出るのはラテンと数字** (代替書体も全角は 1em だから)。
 * ONAiR の一覧はまさに GLS番号・日付・金額が並ぶので、ここが本番と違う幅で測られていた。
 * 金額の右端は ±0.5px で見ているので、この差は素通りにも空振りにも化ける。
 *
 * ── どう直すか ──────────────────────────────────────────────
 *
 * **`curl` は proxy 経由で外に出られる** (ブラウザだけが出られない)。そこで
 *
 *   1. 各アプリの `index.html` が読んでいる Google Fonts の URL を集める
 *   2. `curl` で CSS と woff2 を落として `.cache/google-fonts/` に置く (約20MB・12秒)
 *   3. Playwright の `route` で `fonts.googleapis.com` / `fonts.gstatic.com` を
 *      **その取り置きから返す**
 *
 * `index.html` を読んで URL を集めるので、**書体を足しても直す場所は無い**
 * (一覧をここに写すと必ず片方が古くなる)。7アプリぶんまとめて効くので、
 * 凍結アプリ (Noto Sans JP / Roboto Condensed) の座標も本物で測れるようになる。
 *
 * 取り置きに失敗しても**検証は止めない** — 今日と同じ「代替書体で測る」に戻るだけ。
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * **Chrome を名乗るのが要点。** Google Fonts は UA で返す形式を変えるので、
 * `curl` の既定の UA だと **woff2 ではなく ttf** が返る。本番のブラウザが受け取る
 * ものと同じ (＝同じ字幅の) ファイルを取り置きたいので Chrome の UA で頼む。
 */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 取り置き先。コンテナを作り直すまで残る (`.gitignore` 済み) */
export const CACHE_DIR = process.env.FONT_CACHE_DIR || path.join(ROOT, '.cache/google-fonts');

const sha1 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

/** 各アプリの `index.html` から Google Fonts の URL を集める (重複は畳む) */
export function collectFontUrls(root = ROOT) {
  const urls = new Set();
  for (const dir of fs.readdirSync(root)) {
    if (!/^client(-|$)/.test(dir)) continue;
    const html = path.join(root, dir, 'index.html');
    if (!fs.existsSync(html)) continue;
    const src = fs.readFileSync(html, 'utf8');
    for (const m of src.matchAll(/https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s]+/g)) {
      urls.add(m[0].replace(/&amp;/g, '&'));
    }
  }
  return [...urls];
}

async function curlTo(url, dest) {
  // `-f` … HTTP エラーを失敗として扱う (404 の本文をフォントとして保存しないため)
  await execFileP('curl', ['-sSfL', '--max-time', '60', '-A', UA, '-o', dest, url], {
    maxBuffer: 1 << 20,
  });
}

/** 並びを絞って落とす (全部同時だと proxy 側で詰まる) */
async function downloadAll(jobs, concurrency = 12) {
  const failed = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (next < jobs.length) {
        const { url, dest } = jobs[next++];
        try {
          const tmp = `${dest}.part`;
          await curlTo(url, tmp);
          if (!fs.statSync(tmp).size) throw new Error('空のファイル');
          fs.renameSync(tmp, dest);            // 途中で切れたものを本物として残さない
        } catch (e) {
          fs.rmSync(`${dest}.part`, { force: true });
          failed.push(`${path.basename(dest)}: ${e.message.slice(0, 60)}`);
        }
      }
    }),
  );
  return failed;
}

/**
 * 取り置きを用意する。**既にあるものは落とし直さない**ので2回目以降は一瞬。
 *
 * @returns {{ready: boolean, dir: string, css: Map<string,string>, note: string}}
 */
export async function ensureFontCache({ urls = collectFontUrls(), log = () => {} } = {}) {
  const cssDir = path.join(CACHE_DIR, 'css');
  const fileDir = path.join(CACHE_DIR, 'files');
  const css = new Map();
  if (!urls.length) return { ready: false, dir: CACHE_DIR, css, note: '読んでいる書体が見つからない' };

  try {
    fs.mkdirSync(cssDir, { recursive: true });
    fs.mkdirSync(fileDir, { recursive: true });

    // ① CSS (どの部分集合をどの範囲に使うかが書いてある)
    const cssJobs = [];
    for (const url of urls) {
      const dest = path.join(cssDir, `${sha1(url)}.css`);
      if (process.env.FONT_CACHE_REFRESH) fs.rmSync(dest, { force: true });
      if (!fs.existsSync(dest)) cssJobs.push({ url, dest });
    }
    if (cssJobs.length) {
      log(`書体の取り置き: 一覧を ${cssJobs.length} 件取得中…`);
      const failed = await downloadAll(cssJobs, 4);
      if (failed.length) return { ready: false, dir: CACHE_DIR, css, note: failed[0] };
    }
    for (const url of urls) css.set(url, fs.readFileSync(path.join(cssDir, `${sha1(url)}.css`), 'utf8'));

    // ② woff2 本体。CSS の `url(...)` を見て、まだ無いものだけ落とす
    const fileJobs = [];
    const seen = new Set();
    for (const text of css.values()) {
      for (const m of text.matchAll(/https:\/\/fonts\.gstatic\.com\/[^)]+/g)) {
        const url = m[0];
        const name = path.basename(new URL(url).pathname);
        if (seen.has(name)) continue;
        seen.add(name);
        const dest = path.join(fileDir, name);
        if (!fs.existsSync(dest)) fileJobs.push({ url, dest });
      }
    }
    if (fileJobs.length) {
      log(`書体の取り置き: ${fileJobs.length} 個の woff2 を取得中… (初回だけ・10秒ほど)`);
      const failed = await downloadAll(fileJobs);
      if (failed.length) {
        return { ready: false, dir: CACHE_DIR, css, note: `${failed.length}件失敗: ${failed[0]}` };
      }
    }
    return { ready: true, dir: CACHE_DIR, css, note: `${seen.size}個` };
  } catch (e) {
    return { ready: false, dir: CACHE_DIR, css, note: e.message.slice(0, 80) };
  }
}

/**
 * ブラウザの文脈に取り置きを差し込む。
 *
 * **取り置きに無い書体の要求はそのまま通す** (`fallback`)。ここで一律に返すと、
 * 例えば Noto Sans JP を頼んだ画面に LINE Seed JP の CSS を返してしまい、
 * 「凍結アプリの見た目を変えていない」の検査が意味を失う。
 */
export async function installFontCache(ctx, cache) {
  if (!cache?.ready) return false;
  const fileDir = path.join(cache.dir, 'files');
  // `route.fallback()` は Playwright 1.23 以降。古い版でも**握って止まらない**ようにする
  // (この検証は手で入れた playwright-core を使うので、版が揃っている保証が無い)
  const pass = (route) => (typeof route.fallback === 'function' ? route.fallback() : route.continue());

  // **glob ではなく正規表現で書く。** Playwright の glob は版によって
  // クエリ文字列 (`?family=...`) の扱いが変わるので、当たらなくなっても静かに素通りする
  /*
   * **CORS を明示して返す**（レビューでの指摘 #71）。
   *
   * ⚠️ **いまの版では無くても書体は届いています**（実測。下記）。Playwright が
   * `route.fulfill()` で返した応答を Chromium が受け入れるためです。
   * ただし `@font-face` の取得は本来 CORS を要求する経路なので、
   * **Playwright の版が変わって素直に検査するようになった日**に、
   * 何も言わずに代替書体で測り始めます — この検査は**書体の幅**を見るものなので、
   * そうなると**数字だけが出て中身が変わります**（いちばん困る壊れ方）。
   * 1行で防げるので付けておきます。
   *
   * 実測（取り置きあり / なし・16px の文字幅）:
   *   Bebas Neue     157.36px / 246.97px
   *   Roboto Condensed 208.11px / 246.97px   ← 無いと2つが同じ幅＝代替書体
   */
  const CORS = { 'access-control-allow-origin': '*' };

  await ctx.route(/^https:\/\/fonts\.googleapis\.com\//, (route) => {
    const body = cache.css.get(route.request().url());
    if (!body) return pass(route);
    return route.fulfill({
      status: 200, contentType: 'text/css; charset=utf-8', headers: CORS, body,
    });
  });

  await ctx.route(/^https:\/\/fonts\.gstatic\.com\//, (route) => {
    const file = path.join(fileDir, path.basename(new URL(route.request().url()).pathname));
    if (!fs.existsSync(file)) return pass(route);
    return route.fulfill({
      status: 200, contentType: 'font/woff2', headers: CORS, body: fs.readFileSync(file),
    });
  });

  return true;
}
