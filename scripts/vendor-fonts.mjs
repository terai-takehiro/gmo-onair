#!/usr/bin/env node
/**
 * LINE Seed JP をリポジトリに同梱する（v4 の3アプリぶん）
 *
 * ── なぜ外から読むのをやめるか ──────────────────────────────
 *
 * これまでは各アプリの `index.html` が `fonts.googleapis.com` を読んでいました。
 * そのため:
 *
 *   ・**開発中は代替書体で見ていた。** 開発用のコンテナからブラウザは外に出られず、
 *     `verify:ui` だけが `curl` の取り置きを差し込んで本物にしていた
 *     （つまり**検証のときだけ本物**で、`npm run dev` は別の字幅）
 *   ・**本番も Google Fonts が届く前提だった。** 社内ネットで塞がれた日や
 *     先方が落ちた日に、全画面が代替書体になる
 *   ・字幅が違う（`google-fonts-cache.mjs` の実測で**ラテンは最大 13%**）。
 *     ONAiR の一覧は GLS番号・日付・金額が並ぶので、ここがずれると
 *     桁揃えを目で確かめても意味がない
 *
 * 同梱すれば、**clone しただけで開発も本番も本物**になり、外に依存しません。
 *
 * ── 同梱してよい書体か ──────────────────────────────────────
 *
 * LINE Seed JP は **SIL Open Font License 1.1**（© LY Corporation）です。
 * OFL は再配布・埋め込みを明示的に許し、**license を一緒に配ること**を求めるので、
 * `OFL.txt` も同じ場所に置きます（消さないこと）。
 *
 * ── 凍結4アプリは触らない ────────────────────────────────────
 *
 * Qシート・技術資料・計時LIVE・リアルタイムCG が読む Noto Sans JP は
 * **79.7MB** あり、そもそも「見た目を変えない」決めの側です。
 * 生成する CSS は `tokens-v4.css` から読むので（`base.css` の import 図のとおり
 * **v4 の3アプリだけが通る道**）、凍結4アプリには 1 バイトも増えません。
 *
 * ── 6MB を丸ごと配るわけではない ────────────────────────────
 *
 * Google は字の範囲（`unicode-range`）で 124 個に刻んでいて、
 * **ブラウザは実際に使う範囲だけ**落とします。刻み方をそのまま持ってくるので、
 * 利用者が最初に受け取る量は今までと変わりません。
 *
 * 使い方:
 *   node scripts/vendor-fonts.mjs           # 足りないものだけ取得
 *   node scripts/vendor-fonts.mjs --check   # 取得せず、揃っているかだけ見る
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'shared/src/client/fonts/lineseedjp');
const CSS_OUT = path.join(ROOT, 'shared/src/client/fonts/lineseedjp.css');
const OFL_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/lineseedjp/OFL.txt';

/** 同梱する書体。**v4 の型スケールが使うウェイトだけ**（増やすと素直に容量が増える） */
const FAMILY = 'LINE Seed JP';
const CSS_URL = 'https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700;800&display=swap';

/**
 * woff2 を受け取るための UA。**これを送らないと古い形式の CSS が返り**、
 * 容量が数倍になったうえ字形が変わる
 */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const check = process.argv.includes('--check');

/**
 * これ未満なら「途中で切れている」と見なすバイト数。
 * LINE Seed JP の断片は**いちばん小さいものでも 1KB 台**（実測）なので、
 * 200 バイトは「明らかに壊れている」側だけを拾う値です。
 */
const MIN_WOFF2_BYTES = 200;

async function curlText(url) {
  const { stdout } = await execFileP('curl', ['-sSfL', '--max-time', '60', '-A', UA, url], {
    maxBuffer: 1 << 24,
  });
  return stdout;
}

async function curlTo(url, dest) {
  await execFileP('curl', ['-sSfL', '--max-time', '60', '-A', UA, '-o', dest, url]);
}

/** 並びを絞って落とす（全部同時だと proxy 側で詰まる） */
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
          fs.renameSync(tmp, dest);   // 途中で切れたものを本物として残さない
        } catch (e) {
          fs.rmSync(`${dest}.part`, { force: true });
          failed.push(`${path.basename(dest)}: ${String(e.message).slice(0, 60)}`);
        }
      }
    }),
  );
  return failed;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  if (check) {
    const n = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith('.woff2')).length : 0;
    const hasCss = fs.existsSync(CSS_OUT);
    const hasOfl = fs.existsSync(path.join(OUT, 'OFL.txt'));
    if (!n || !hasCss || !hasOfl) {
      console.error(`[fonts] 揃っていません (woff2 ${n} 個 / CSS ${hasCss} / OFL ${hasOfl})`);
      console.error('        node scripts/vendor-fonts.mjs で取得してください');
      process.exit(1);
    }

    /*
     * ⚠️ **数えるだけでは足りない**（レビューでの指摘 #84）。
     *
     * 前の版は「woff2 が1つ以上あって CSS と OFL がある」で通していました。
     * ところが壊れ方は**1つの断片だけ**で起きます:
     *
     * ・取得が途中で切れて **0 バイト / 途中まで**のファイルが残る
     * ・プロキシがエラーページ（HTML）を返し、それが `.woff2` として保存される
     * ・CSS が参照しているのに**そのファイルだけ無い**
     *
     * どれも**その `unicode-range` の文字だけ**が代替書体で描かれます。
     * 「なんとなく字が違う」以外に手がかりが無く、**画面を見ても気づけません**。
     *
     * CSS が参照しているファイルを1つずつ当たり、**在ること・中身が woff2 で
     * あること**（先頭4バイトが `wOF2`）を見ます。
     */
    const css = fs.readFileSync(CSS_OUT, 'utf8');
    const refs = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)]
      .map((m) => path.basename(m[1].replace(/['"]/g, '').split('?')[0]))
      .filter((f) => f.endsWith('.woff2')))];

    const broken = [];
    for (const f of refs) {
      const p = path.join(OUT, f);
      if (!fs.existsSync(p)) { broken.push(`${f} … CSS が参照しているのに無い`); continue; }
      const size = fs.statSync(p).size;
      if (size < MIN_WOFF2_BYTES) { broken.push(`${f} … ${size} バイトしかない（途中で切れている）`); continue; }

      /*
       * ⚠️ **「印があって 200 バイト以上」では途中切れを見つけられません**
       * （レビューでの指摘 #130）。取得が**先頭 200 バイトより後ろ**で切れると、
       * `wOF2` の印は残ったまま最小の大きさも超えるので、前の版は **OK と出ます**。
       * 途中で切れるのは**普通に起きる壊れ方**（回線・プロキシ）で、
       * しかも壊れているのはその `unicode-range` の文字だけなので**画面では気づけません**。
       *
       * WOFF2 の頭には**ファイル全体の大きさ**が書いてあります（8〜11 バイト目・
       * ビッグエンディアンの 32bit / W3C WOFF2 の `length`）。
       * **書いてある大きさと実際の大きさを突き合わせれば、1 バイトでも欠ければ分かります。**
       */
      const head = Buffer.alloc(12);
      const fd = fs.openSync(p, 'r');
      let read = 0;
      try { read = fs.readSync(fd, head, 0, 12, 0); } finally { fs.closeSync(fd); }
      if (read < 12) { broken.push(`${f} … 頭が読めない（${read} バイトしかない）`); continue; }
      if (head.toString('latin1', 0, 4) !== 'wOF2') {
        broken.push(`${f} … woff2 ではない（先頭が ${JSON.stringify(head.toString('latin1', 0, 4))}。エラーページを保存していないか）`);
        continue;
      }
      const declared = head.readUInt32BE(8);
      if (declared !== size) {
        broken.push(`${f} … 頭には ${declared} バイトと書いてあるのに ${size} バイトしかない`
          + `（${declared > size ? '途中で切れている' : '余分が付いている'}）`);
      }
    }

    if (broken.length) {
      console.error(`[fonts] 壊れている断片が ${broken.length} 件あります:`);
      for (const b of broken.slice(0, 10)) console.error(`  - ${b}`);
      if (broken.length > 10) console.error(`  … ほか ${broken.length - 10} 件`);
      console.error('        その unicode-range の文字だけが代替書体で描かれます（画面では気づけません）');
      console.error('        直し方: 壊れたファイルを消して node scripts/vendor-fonts.mjs');
      process.exit(1);
    }

    console.log(`[fonts] OK (${FAMILY} ${n} ファイル同梱 / CSS が参照する ${refs.length} 件をすべて確認)`);
    return;
  }

  // ① どの範囲にどのファイルを使うかが書かれた CSS
  console.log(`[fonts] ${FAMILY} の一覧を取得中…`);
  const css = await curlText(CSS_URL);

  // ② woff2 本体。まだ無いものだけ落とす（2回目以降は一瞬）
  const urls = [...new Set([...css.matchAll(/https:\/\/fonts\.gstatic\.com\/[^)]+/g)].map((m) => m[0]))];
  const jobs = urls
    .map((url) => ({ url, dest: path.join(OUT, path.basename(new URL(url).pathname)) }))
    .filter((j) => !fs.existsSync(j.dest));
  if (jobs.length) {
    console.log(`[fonts] ${jobs.length} ファイルを取得中…`);
    const failed = await downloadAll(jobs);
    if (failed.length) {
      console.error(`[fonts] 取得できなかったもの ${failed.length} 件: ${failed[0]}`);
      process.exit(1);
    }
  }

  // ③ OFL は**書体と一緒に配ることが条件**なので必ず置く
  const oflPath = path.join(OUT, 'OFL.txt');
  if (!fs.existsSync(oflPath)) fs.writeFileSync(oflPath, await curlText(OFL_URL));

  // ④ 参照先を手元のファイルに書き換えた CSS を作る。
  //    `unicode-range` はそのまま残す（**刻み方を変えない** — 変えると
  //    利用者が最初に落とす量が増える）
  const local = css.replace(/https:\/\/fonts\.gstatic\.com\/[^)]+/g,
    (u) => `./lineseedjp/${path.basename(new URL(u).pathname)}`);

  const header = `/**
 * ${FAMILY} — **リポジトリに同梱**（\`scripts/vendor-fonts.mjs\` の生成物）
 *
 * ⚠️ **手で直さないこと。** 書体やウェイトを変えるときはスクリプトを直して流し直します。
 *
 * ここを \`tokens-v4.css\` から読むので、**v4 の3アプリだけ**に効きます
 * （凍結4アプリは今までどおり Google Fonts の Noto Sans JP）。
 *
 * ライセンス: SIL Open Font License 1.1 — \`./lineseedjp/OFL.txt\`
 * © LY Corporation
 *
 * \`unicode-range\` は Google の刻み方のままです。**ブラウザは使う範囲だけ**
 * 落とすので、同梱の合計が大きくても利用者が受け取る量は変わりません。
 */
`;
  fs.writeFileSync(CSS_OUT, header + local);

  const n = fs.readdirSync(OUT).filter((f) => f.endsWith('.woff2')).length;
  const mb = fs.readdirSync(OUT)
    .reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1024 / 1024;
  console.log(`[fonts] OK — ${n} ファイル / ${mb.toFixed(2)} MB を ${path.relative(ROOT, OUT)} に置きました`);
}

main().catch((e) => { console.error('[fonts]', e.message); process.exit(1); });
