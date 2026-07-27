#!/usr/bin/env node
/**
 * 画面の決まりを実ブラウザで確かめる (v2.9.298)
 *
 * ── なぜスクリプトにしたか ──────────────────────────────────
 *
 * 毎回その場で検証コードを書き直していたので、**同じ確認に毎回15分**かかっていた
 * (書く → 走らせる → スクリプト側の誤りに気づく → 直す、を繰り返す)。
 * 検証の内容はほぼ固定なので、**リポジトリに置いて育てる**形にする。
 *
 * ── 速さのために決めたこと ──────────────────────────────────
 *
 *  - PC とスマホを**同時に**走らせる (直列だと単純に2倍かかる)
 *  - `networkidle` を待たない。**Socket.IO をつないでいる画面は永久に idle にならず**、
 *    1ページごとに 30 秒のタイムアウトを丸ごと待っていた
 *  - 1ページの待ちは 1.2 秒。取得が遅い画面だけ `slow` に列挙する
 *
 * 使い方:
 *   node scripts/verify-ui.mjs                 # 全ページ
 *   node scripts/verify-ui.mjs qsheet awards   # 名前に含むページだけ
 *   BASE=http://localhost:3001 node scripts/verify-ui.mjs
 */
// playwright-core はリポジトリの依存に入れない (CI では動かさないので重いだけ)。
// 検証用に入れた場所を `PW` で渡す。既定は Dev Container 内の置き場。
const { chromium } = await import(process.env.PW || '/tmp/node_modules/playwright-core/index.mjs');

const BASE = process.env.BASE || 'http://localhost:3001';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const USER = process.env.VERIFY_USER || 'v-admin';

/** 見るページ。`slow` は取得に時間がかかるので長めに待つ */
const PAGES = [
  ['案件管理 今日', '/today'],
  ['案件管理 案件', '/projects'],
  ['Qシート 一覧', '/qsheet/'],
  ['Qシート 編集', '/qsheet/editor/verify-onair'],
  ['Qシート OnAir', '/qsheet/onair/verify-onair', { dark: true }],
  ['Qシート ランダウン', '/qsheet/rundown/verify-onair', { dark: true }],
  ['機材 日々', '/equipment/'],
  ['機材 台帳', '/equipment/items'],
  ['技術資料', '/techsheet/'],
  ['計時LIVE', '/live/'],
  ['日常業務 ホーム', '/daily/'],
  ['日常業務 カード', '/daily/security-cards'],
  ['日常業務 見積請求', '/daily/finance'],
  ['リアルタイムCG 一覧', '/awards/'],
  ['リアルタイムCG 準備', '/awards/event/1'],
  ['リアルタイムCG 送出', '/awards/event/1/onair'],
  ['リアルタイムCG 卓', '/awards/event/1/control'],
  ['リアルタイムCG 字幕', '/awards/event/1/oneshot/control'],
  ['リアルタイムCG クイズ', '/awards/event/1/quiz-stack/control'],
  ['リアルタイムCG 投入', '/awards/event/1/intake'],
];

const filters = process.argv.slice(2);
const targets = filters.length
  ? PAGES.filter(([label, url]) => filters.some((f) => label.includes(f) || url.includes(f)))
  : PAGES;

/** ブラウザの中で走る測定。**ここが検証の本体** */
function measure() {
  const de = document.documentElement;
  const cs = (el) => getComputedStyle(el);

  // WCAG の相対輝度。粗い近似だと山吹 (#eb9800) を「明るい面」と誤判定する
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => {
    const m = c.match(/\d+(\.\d+)?/g);
    if (!m) return 1;
    const [r, g, b] = m.map(Number);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  /** #8b929c の相対輝度。これより薄い文字は使わない (デザイン §2.1) */
  const FAINT = 0.2718;

  // 「見えている」もの だけを数える (印刷用・埋め込み時に隠した要素を数えない)
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  const faint = [];
  const badMoney = [];
  // **1周で両方見る。** `getComputedStyle` は毎回スタイル解決が走るので、
  // 2周すると大きい画面で数秒違う (検証の待ち時間がそのまま増える)
  document.querySelectorAll('body *').forEach((el) => {
    if (!el.textContent?.trim() || el.children.length) return;
    const txt = el.textContent.trim();
    // 金額は ¥ と数字が別要素 (1要素に「¥4,820,000」だと桁がそろわない)
    if (/^[-−]?¥\s*[\d,]+$/.test(txt) && txt.length > 1) badMoney.push(txt.slice(0, 14));
    const s = cs(el);
    if (s.visibility === 'hidden' || s.display === 'none') return;
    if (el.closest('[aria-hidden="true"]')) return;      // 装飾は対象外
    let node = el; let bg = s.backgroundColor; let measurable = true;
    while (node) {
      const ns = cs(node);
      // グラデーションと半透明は合成後の色が分からない。測れないものを白地と決めつけない
      if (ns.backgroundImage && ns.backgroundImage !== 'none') { measurable = false; break; }
      bg = ns.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        const p = bg.match(/rgba?\(([^)]+)\)/);
        const parts = p ? p[1].split(',').map(Number) : [];
        if (parts.length === 4 && parts[3] < 1) measurable = false;
        break;
      }
      node = node.parentElement;
      if (!node) bg = cs(document.body).backgroundColor;
    }
    if (!measurable) return;
    if (lum(bg || 'rgb(255,255,255)') > 0.5 && lum(s.color) > FAINT) {
      faint.push(`${s.color} "${el.textContent.trim().slice(0, 16)}"`);
    }
  });

  // ボタンの高さは 32/36/40/44/48 + スマホのタップ帯 (46〜52)
  const OKH = new Set([32, 36, 40, 44, 46, 48, 50, 52]);
  const badBtn = [];
  document.querySelectorAll('button, a[role="button"], [role="switch"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    const h = Math.round(r.height);
    if (!h || h < 28) return;
    // 「押せる面」(一覧の行・カード・タイル) は寸法表の言うボタンではない
    if (r.width > 320 || h > 56) return;
    if (!OKH.has(h)) badBtn.push(`${h}px "${(el.textContent || '').trim().slice(0, 10)}"`);
  });

  // 金額は ¥ と数字が別要素 (1要素に「¥4,820,000」と入っていたら桁がそろわない)

  const shell = document.querySelector('#root > div');
  return {
    overflowX: de.scrollWidth - de.clientWidth,
    bodyBg: cs(document.body).backgroundColor,
    font: cs(document.body).fontFamily,
    feat: cs(document.body).fontFeatureSettings,
    shellH: shell ? Math.round(shell.getBoundingClientRect().height) : 0,
    vh: window.innerHeight,
    h1: [...document.querySelectorAll('h1')].filter(visible).map((e) => cs(e).fontSize),
    faint: faint.length, faintList: faint.slice(0, 4),
    badBtn: [...new Set(badBtn)].slice(0, 5), badBtnN: badBtn.length,
    badMoney: badMoney.slice(0, 3),
  };
}

async function runViewport(browser, { width, height, tag }) {
  const results = [];
  const ok = (n, c, d = '') => results.push({ n: `${tag} ${n}`, c, d });
  const ctx = await browser.newContext({
    viewport: { width, height },
    extraHTTPHeaders: { 'x-user-id': USER },
  });
  await ctx.addInitScript((id) => {
    localStorage.setItem('gmo_onair_user', JSON.stringify({
      id, name: '検証 管理者', email: 'v-admin@example.com', role: 'system_admin',
    }));
  }, USER);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));

  for (const [label, url, opt = {}] of targets) {
    errs.length = 0;
    try {
      // `networkidle` は待たない — Socket.IO をつないでいる画面は永久に idle にならない
      await pg.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
      ok(`${label} 開く`, false, e.message.slice(0, 60));
      continue;
    }
    await pg.waitForTimeout(opt.slow ? 2500 : 900);
    const m = await pg.evaluate(measure);

    ok(`${label} 横はみ出し 0px`, m.overflowX === 0, `${m.overflowX}px`);
    ok(`${label} JSエラー 0件`, errs.length === 0, errs.slice(0, 1).join(''));
    // 放送中の画面は DADS の `.dark` を**意図して**使う (地の色が違うのが正しい)
    const wantBg = opt.dark ? 'rgb(20, 22, 26)' : 'rgb(246, 247, 249)';
    ok(`${label} 地の色が共通`, m.bodyBg === wantBg, m.bodyBg);
    ok(`${label} 書体が共通`, m.font.includes('LINE Seed JP'), m.font.slice(0, 30));
    ok(`${label} 字詰め (palt)`, /palt/.test(m.feat || ''), m.feat);
    ok(`${label} シェルが画面いっぱい`, m.shellH >= m.vh - 2, `${m.shellH}/${m.vh}`);
    ok(`${label} 薄すぎる文字 0件`, m.faint === 0, `${m.faint}件 ${JSON.stringify(m.faintList)}`);
    ok(`${label} ボタンの高さが段のみ`, m.badBtnN === 0, JSON.stringify(m.badBtn));
    ok(`${label} 金額は¥と数字が別要素`, m.badMoney.length === 0, JSON.stringify(m.badMoney));
    if (m.h1.length) {
      ok(`${label} 見出しの大きさが1つ`, new Set(m.h1).size === 1, m.h1.join(','));
    }
  }
  await ctx.close();
  return results;
}

const started = Date.now();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// PC とスマホを同時に走らせる (直列だと単純に2倍かかる)
const all = (await Promise.all([
  runViewport(browser, { width: 1440, height: 900, tag: 'PC' }),
  runViewport(browser, { width: 375, height: 812, tag: 'スマホ' }),
])).flat();
await browser.close();

const fail = all.filter((r) => !r.c);
for (const r of fail) console.log('FAIL', r.n, '—', r.d);
const secs = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\n${all.length - fail.length}/${all.length} 通過（${targets.length}ページ × 2画面幅 / ${secs}秒）`);
process.exit(fail.length ? 1 : 0);
