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

/**
 * 見るページ。`slow` は取得に時間がかかるので長めに待つ。
 *
 * **v4 の対象3アプリは全画面を並べる。** 共通の下地 (`shared/src/client/base.css`) や
 * 共通シェルを入れ替えると**全画面に一度に効く**ので、代表2〜3画面では足りない
 * (実際 F2 の前は日常業務2画面・機材2画面しか見ていなかった)。
 * 凍結4アプリは見た目を変えないので代表画面のままにしてある。
 */
const PAGES = [
  // ── 案件管理・財務管理・設定 (v4 対象) ──────────────────────
  // 共通部品 (表 / 検索付き選択 / 金額入力) を使う画面を並べてある。
  // shared に部品を移したとき、ここが変わらないことが「置き場所を変えただけ」の証拠になる。
  ['案件管理 今日', '/today'],
  ['案件管理 案件', '/projects'],
  ['案件管理 レビュー', '/sales/review', { slow: true }],
  ['案件管理 料金表', '/sales/pricing'],
  ['案件管理 案件グループ', '/sales/project-groups'],
  ['案件管理 活動履歴', '/sales/activity-logs'],
  ['案件管理 GLS取込', '/sales/gls-import'],
  ['財務 ダッシュボード', '/budget/dashboard', { slow: true }],
  ['財務 仕入', '/budget/purchases', { slow: true }],
  ['財務 販管費', '/budget/sga'],
  ['財務 売上', '/budget/revenues', { slow: true }],
  ['財務 取引先レポート', '/budget/reports/vendors'],
  ['財務 楽楽精算取込', '/budget/xpoint-import'],
  ['設定 メンバー', '/admin/users'],
  ['設定 データ', '/admin/data-viewer'],
  ['設定 DBバックアップ', '/admin/db-backups'],
  ['Qシート 一覧', '/qsheet/'],
  ['Qシート 編集', '/qsheet/editor/verify-onair'],
  ['Qシート OnAir', '/qsheet/onair/verify-onair', { dark: true }],
  ['Qシート ランダウン', '/qsheet/rundown/verify-onair', { dark: true }],
  ['技術資料', '/techsheet/'],
  ['計時LIVE', '/live/'],

  // ── 機材管理 (v4 対象・全画面) ──────────────────────────
  ['機材 日々', '/equipment/'],
  ['機材 台帳', '/equipment/items', { slow: true }],
  ['機材 ケーブル', '/equipment/cables'],
  ['機材 コネクタ', '/equipment/connectors'],
  ['機材 ラック図', '/equipment/racks', { slow: true, print: true }],
  ['機材 メンテナンス', '/equipment/maintenance'],
  ['機材 棚卸し', '/equipment/inventory'],
  ['機材 貸出', '/equipment/lendings'],
  ['機材 スキャン', '/equipment/scan'],
  ['機材 拠点', '/equipment/locations'],
  ['機材 メーカー', '/equipment/manufacturers'],
  ['機材 型番グループ', '/equipment/model-groups'],
  ['機材 貸出区分', '/equipment/rental-categories'],
  ['機材 貸出設定', '/equipment/rental-settings'],
  ['機材 色', '/equipment/colors'],

  // ── 日常業務 (v4 対象・全画面) ──────────────────────────
  ['日常業務 ホーム', '/daily/'],
  ['日常業務 週報', '/daily/weekly'],
  ['日常業務 ニュース', '/daily/news'],
  ['日常業務 内覧会', '/daily/inview'],
  ['日常業務 見積請求', '/daily/finance'],
  ['日常業務 問い合わせ', '/daily/inquiries'],
  ['日常業務 やること', '/daily/tasks'],
  ['日常業務 カード', '/daily/security-cards'],

  ['リアルタイムCG 一覧', '/awards/'],
  ['リアルタイムCG 準備', '/awards/event/1'],
  ['リアルタイムCG 送出', '/awards/event/1/onair'],
  ['リアルタイムCG 卓', '/awards/event/1/control'],
  ['リアルタイムCG 字幕', '/awards/event/1/oneshot/control'],
  ['リアルタイムCG クイズ', '/awards/event/1/quiz-stack/control'],
  ['リアルタイムCG 投入', '/awards/event/1/intake'],
];

/**
 * 凍結4アプリ (Qシート / 技術資料 / 計時LIVE / リアルタイムCG) の URL。
 * **見た目を今日のまま保つ**のが決定事項なので、v4 の基準を当てない。
 */
const FROZEN_PREFIX = /^\/(qsheet|techsheet|live|awards)\//;

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

  /*
   * **中身がスクロールする手段の無いまま切れていないか。**
   * 共通の下地は `html, body, #root` に `overflow: hidden` を敷き、スクロールは
   * シェルの中 (`<main class="overflow-y-auto">`) が持つ形にしている。この形は
   * **間に1つでも「はみ出しているのに隠すだけ」の箱があると、そこから下に
   * ユーザーが到達できなくなる** (スクロールバーも出ないので気づけない)。
   * 型でもレビューでも見つからないので、実ブラウザで座標を測って数える。
   */
  const clipped = [];
  document.querySelectorAll('body *').forEach((el) => {
    const over = el.scrollHeight - el.clientHeight;
    if (over <= 2) return;                                  // 端数は無視
    const s = cs(el);
    if (s.overflowY !== 'visible' && s.overflowY !== 'hidden') return;   // 自分でスクロールできる
    if (s.display === 'none' || s.visibility === 'hidden') return;
    if (!el.clientHeight) return;                           // 潰れている箱は別の話
    // overflow: visible ならはみ出した中身は見えている。祖先のどこかが
    // スクロールを持っていれば到達できるので、それを探す。
    let node = el.parentElement, reachable = s.overflowY === 'visible';
    while (node && !reachable) {
      const ns = cs(node);
      if (ns.overflowY === 'auto' || ns.overflowY === 'scroll') reachable = true;
      node = node.parentElement;
    }
    if (reachable) return;
    clipped.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 24)} +${over}px`);
  });

  const shell = document.querySelector('#root > div');
  return {
    clipped: clipped.length, clippedList: [...new Set(clipped)].slice(0, 3),
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
    ok(`${label} 中身が隠れていない`, m.clipped === 0, `${m.clipped}件 ${JSON.stringify(m.clippedList)}`);
    ok(`${label} JSエラー 0件`, errs.length === 0, errs.slice(0, 1).join(''));
    /*
     * 地の色は **アプリによって期待値が違う** (T2 から)。
     *   v4 対象3アプリ … #f7f8fa  ← v4 の確定値 (`docs/design/v4/_tokens.md`)
     *   凍結3アプリ     … #fafafa  ← 今日と同じ色を保つのが決定事項
     *   リアルタイムCG  … #faf8f5  ← `tokens.css` を読まず自前の値を持っている
     *   放送中の画面     … #14161a  ← DADS の `.dark` を**意図して**使っている
     * 1つの期待値にまとめると、凍結アプリを「直す」方向に引っぱってしまう。
     */
    const wantBg = opt.dark
      ? 'rgb(20, 22, 26)'
      : /^\/awards\//.test(url)
        ? 'rgb(250, 248, 245)'   // リアルタイムCG は自前のトークン (温かい生成り)
        : FROZEN_PREFIX.test(url)
          ? 'rgb(250, 250, 250)'
          : 'rgb(247, 248, 250)';
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

    /*
     * **印刷で高さの固定が外れているか** (`print: true` のページだけ)。
     * 画面では `html, body, #root { height: 100%; overflow: hidden }` でシェルを
     * 画面に固定しているが、そのまま紙に出すと**1ページ目で切れる**。
     * `base.css` の `@media print` が解除している前提を、実ブラウザで確かめる。
     */
    if (opt.print) {
      await pg.emulateMedia({ media: 'print' });
      const p = await pg.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        const b = getComputedStyle(document.body);
        return { htmlOv: s.overflowY, bodyOv: b.overflowY, htmlH: s.height, vh: window.innerHeight };
      });
      await pg.emulateMedia({ media: 'screen' });
      ok(`${label} 印刷で高さの固定が外れる`,
        p.htmlOv === 'visible' && p.bodyOv === 'visible',
        `html:${p.htmlOv} body:${p.bodyOv}`);
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
