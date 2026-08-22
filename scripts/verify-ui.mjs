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
 *   node scripts/verify-ui.mjs qsheet live     # 名前に含むページだけ
 *   BASE=http://localhost:3001 node scripts/verify-ui.mjs
 */
import { ensureFontCache, installFontCache } from './lib/google-fonts-cache.mjs';

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
 * 凍結1アプリ (計時LIVE) は見た目を変えないので代表画面のままにしてある。
 * (制作資料 (Qシート) は v4.1 で凍結を解いたので、本番3画面＋公開音声を含め主要画面を並べる)
 */
const PAGES = [
  // ── 案件管理・財務管理・設定 (v4 対象) ──────────────────────
  // 共通部品 (表 / 検索付き選択 / 金額入力) を使う画面を並べてある。
  // shared に部品を移したとき、ここが変わらないことが「置き場所を変えただけ」の証拠になる。
  ['案件管理 ダッシュボード', '/sales/dashboard'],
  // **受付は案件作成に畳んだ**（`/sales/inbox` は転送）。測るのは統合後の画面
  ['案件管理 案件作成', '/sales/projects/new'],
  // トップページ (v4)。**`/today` を見ていたのを直した** — そんなルートは無く、
  // 受け皿 (`path="*"`) で `/` に転送されるだけだったので、実体はトップページだった
  // (「案件管理 今日」という名前のせいで、別の画面を測っているように読めていた)
  ['トップページ', '/'],
  ['案件管理 案件一覧', '/sales/projects'],
  // 案件台帳。**案件一覧とは列の作りが別**（20列・出し入れできる）ので別に測る。
  // 幅は寸法表の7段しか使わない決めなので、ここが崩れると桁が他の一覧と揃わなくなる
  ['案件管理 案件台帳', '/sales/projects/ledger', { slow: true }],
  // v4 でボードは案件一覧の見え方の1つになった (旧 /sales/pipeline)。
  // リストとは別の描き方なので**別に測る** — カードの中は行部品を使わない
  ['案件管理 案件ボード', '/sales/projects?view=board'],
  ['案件管理 案件詳細', '/sales/projects/pj-1'],
  ['案件管理 案件詳細タスク', '/sales/projects/pj-1/task', { slow: true }],
  ['案件管理 案件詳細見積', '/sales/projects/pj-1/estimate'],
  ['案件管理 案件詳細書類', '/sales/projects/pj-1/files'],
  ['案件管理 案件詳細当日', '/sales/projects/pj-1/day'],
  ['案件管理 案件詳細未作成', '/sales/projects/pj-1/review'],
  ['案件管理 案件編集', '/sales/projects/pj-1/edit', { slow: true }],
  ['案件管理 タスク一覧', '/sales/tasks/list'],
  ['案件管理 タスクガント', '/sales/tasks/gantt', { slow: true }],
  ['案件管理 レビュー', '/sales/review', { slow: true }],
  ['案件管理 料金表', '/sales/pricing'],
  ['案件管理 見積請求', '/sales/billing'],
  ['案件管理 請求タブ', '/sales/billing?tab=invoice'],
  ['案件管理 案件グループ', '/sales/project-groups'],
  ['案件管理 活動履歴', '/sales/activity-logs'],
  ['案件管理 GLS取込', '/sales/gls-import'],
  ['財務 ダッシュボード', '/budget/dashboard', { slow: true }],
  ['財務 請求・入金', '/budget/billing'],
  ['財務 仕入', '/budget/purchases', { slow: true }],
  ['財務 販管費', '/budget/sga'],
  ['財務 売上', '/budget/revenues', { slow: true }],
  ['財務 取引先', '/budget/vendors'],
  ['財務 取り込み', '/budget/import'],
  ['財務 受け取った書類', '/budget/documents'],
  ['財務 取引先レポート', '/budget/reports/vendors'],
  // v4 で新しく作ったアプリ (migration 161/162)
  ['プロジェクト管理 ダッシュボード', '/gpm/dashboard'],
  ['プロジェクト管理 一覧', '/gpm/projects'],
  ['プロジェクト管理 新規', '/gpm/projects/new'],
  ['プロジェクト管理 やること', '/gpm/tasks'],
  ['プロジェクト管理 標準工程', '/gpm/templates'],
  /*
    詳細の4タブ。**`gpm-1` はシードが固定 id で入れているプロジェクト**
    (`server/src/shared/db/seed.ts`)。ここが抜けていたので、
    **いちばん操作の多い画面が見た目の検査に1度も載っていませんでした**
    (工程・その下のタスク・体制の3段・見積の明細が全部この4タブにある)。
  */
  ['プロジェクト管理 詳細', '/gpm/projects/gpm-1'],
  ['プロジェクト管理 詳細 未確認事項', '/gpm/projects/gpm-1/asks'],
  ['プロジェクト管理 詳細 体制', '/gpm/projects/gpm-1/members'],
  ['プロジェクト管理 詳細 議事録', '/gpm/projects/gpm-1/minutes'],
  ['プロジェクト管理 詳細 書類', '/gpm/projects/gpm-1/files'],
  ['プロジェクト管理 詳細 見積', '/gpm/projects/gpm-1/estimates'],
  ['設定 メンバー', '/settings/users'],
  ['設定 データ', '/settings/data-viewer'],
  ['設定 DBバックアップ', '/settings/db-backups'],
  ['設定 全体', '/settings'],
  ['Qシート 一覧', '/qsheet/'],
  ['Qシート 編集', '/qsheet/editor/verify-onair'],
  ['Qシート OnAir', '/qsheet/onair/verify-onair', { dark: true }],
  ['Qシート ランダウン', '/qsheet/rundown/verify-onair', { dark: true }],
  ['Qシート プロンプター', '/qsheet/prompter/verify-onair', { dark: true }],
  ['Qシート 公開音声', '/qsheet/audio/verify-onair'],
  ['計時LIVE', '/live/'],

  // ── 機材管理 (v4 対象・全画面) ──────────────────────────
  ['機材 日々', '/equipment/'],
  ['機材 台帳', '/equipment/items', { slow: true }],
  ['機材 設定', '/equipment/settings'],
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
  // `/daily/finance` は**画面ではなく転送**になった (v4 ⑥ で財務へ移した)。
  // 中身は上の「財務 受け取った書類」で見る。ここに残すと、転送の一瞬を測って
  // 「シェルが画面いっぱいでない」と必ず落ちる
  ['日常業務 問い合わせ', '/daily/inquiries'],
  ['日常業務 やること', '/daily/tasks'],
  ['日常業務 カード', '/daily/security-cards'],
  // リアルタイムCG (`/awards/*`) は廃止済み。サーバーが配信しないので検査対象からも外した
  // (`client-awards/CLAUDE.md` 参照)。
];

/**
 * 凍結1アプリ (計時LIVE) の URL。
 * **見た目を今日のまま保つ**のが決定事項なので、v4 の基準を当てない。
 *
 * Qシート (制作資料) は凍結を解いたので、ここには含めない
 * (`docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md` §10-1)。
 */
const FROZEN_PREFIX = /^\/(live)\//;

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
    // スマホ下端のタブは**ボタンではなく現在地の切替**。寸法表のボタンの段
    // (32〜52px) ではなく「タップ帯」として 56px で作ってある (v4 の共通シェル)。
    // ここに混ぜると、下タブを置いた画面がすべて落ちる。
    if (el.closest('nav[aria-label="下タブ"]')) return;
    const r = el.getBoundingClientRect();
    const h = Math.round(r.height);
    if (!h || h < 28) return;
    // 「押せる面」(一覧の行・カード・タイル) は寸法表の言うボタンではない
    if (r.width > 320 || h > 56) return;
    if (!OKH.has(h)) badBtn.push(`${h}px "${(el.textContent || '').trim().slice(0, 10)}"`);
  });

  /*
   * ── v4 の縦の整列を**座標で**確かめる (G4) ─────────────────
   *
   * 「バッジ・チップは固定幅の枠に入れる」「金額の右端をそろえる」は
   * **文字列の検査では測れない** (クラス名が正しくても、中身の文字数で
   * 実際の幅が変わる)。ここは実ブラウザの座標でしか分からない。
   */

  /**
   * 同じ列のバッジ・金額を束ねる鍵。
   *
   * 行は `<Row>` が `data-row` を付けているので、**その行の何番目の子か**で
   * 列を決める。行の親 (一覧の器) が同じものどうしを比べる。
   * 見た目のクラス名で束ねると、**枠を外した瞬間に「列が無い」ことになって
   * 検査が素通りする** (実際に最初の実装がそうなり、反証試験で気づいた)。
   */
  const colKeyOf = (el) => {
    const row = el.closest('[data-row]');
    if (!row) return null;
    let child = el;
    while (child.parentElement && child.parentElement !== row) child = child.parentElement;
    const idx = [...row.children].indexOf(child);
    if (idx < 0) return null;
    const listId = row.parentElement ? [...document.querySelectorAll('[data-row]')].indexOf(row) >= 0
      ? (row.parentElement.getAttribute('data-list') ?? row.parentElement.tagName + (row.parentElement.className || '').slice(0, 16))
      : '?' : '?';
    return `${listId}#${idx}`;
  };

  const groupEdges = (nodes, pick) => {
    const by = new Map();
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0) continue;
      const key = colKeyOf(el);
      if (!key) continue;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(Math.round(pick(r) * 2) / 2);
    }
    const bad = [];
    for (const [key, vals] of by) {
      if (vals.length < 2) continue;               // 1行だけの列は比べようがない
      const uniq = [...new Set(vals)];
      if (uniq.length > 1 && Math.max(...uniq) - Math.min(...uniq) > 0.5) {
        bad.push(`${key}: ${uniq.slice(0, 4).join('/')}`);
      }
    }
    return bad;
  };

  /**
   * バッジの列。**左端と右端の両方**を見る。
   *
   * 左端だけだと「固定幅の枠を外した」ことに気づけない — 枠を外しても、
   * 前の列が固定幅なら左端はそろったままだから (反証試験で分かった)。
   * 右端も見ることで「文字数で幅が変わっている」を捕まえる。
   */
  const badgeSlots = [...document.querySelectorAll('[data-badge-slot]')];
  const badgeCols = [
    ...groupEdges(badgeSlots, (r) => r.left).map((x) => `左端 ${x}`),
    ...groupEdges(badgeSlots, (r) => r.right).map((x) => `右端 ${x}`),
  ];

  /** 金額の右端が ±0.5px でそろっているか */
  const moneyCols = groupEdges(
    [...document.querySelectorAll('.font-number')].filter((el) => /¥/.test(el.textContent || '')),
    (r) => r.right,
  );

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
    /*
     * **`line-clamp` は「切れている」のではなく「切ると決めた」もの。**
     * 1行の `truncate` は自分で `text-overflow: ellipsis` を出すので
     * scrollHeight が伸びず、ここには最初から当たらない。
     * ところが同じ判断を複数行でやる `line-clamp-N` は縦に伸びるので
     * 当たってしまい、**同じ決めごとの片方だけが違反になる**。
     * 省略記号が出て、押せば全文のある画面へ行けるので到達不能ではない。
     * (v4 の案件ボードのカード名で踏んだ)
     */
    if (s.webkitLineClamp && s.webkitLineClamp !== 'none') return;
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
    /*
     * **書体が本当に届いているか。**
     *
     * `fontFamily` を見るだけでは足りません — あれは CSS に書いた**宣言**で、
     * 配信が届かなくても文字列は残ります (**落ちようがない検査**でした)。
     * 存在しない書体名で描いた幅と比べて、同じなら代替書体で描かれています。
     * ラテン文字で測るのが要点 — **和文は太さや書体が変わっても字幅が同じ**なので
     * 和文だと差が出ません (実測して分かった)。
     */
    fontLoaded: (() => {
      const w = (family) => {
        const el = document.createElement('span');
        el.textContent = 'Handgloves 12345';
        // **`white-space:pre` が要る。** 付け忘れると狭い画面では文字列が折り返して
        // **どの書体でも幅＝画面幅 (375px)** になり、比べても必ず「同じ」になる
        // (スマホだけ「書体が届いていない」と出続けていたのはこれが原因)
        el.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;white-space:pre;font-size:40px;font-family:${family}`;
        document.body.appendChild(el);
        const x = el.getBoundingClientRect().width;
        el.remove();
        return Math.round(x * 100) / 100;
      };
      return w("'LINE Seed JP', monospace") !== w("'ZZ No Such Font', monospace");
    })(),
    feat: cs(document.body).fontFeatureSettings,
    shellH: shell ? Math.round(shell.getBoundingClientRect().height) : 0,
    vh: window.innerHeight,
    h1: [...document.querySelectorAll('h1')].filter(visible).map((e) => cs(e).fontSize),
    faint: faint.length, faintList: faint.slice(0, 4),
    badBtn: [...new Set(badBtn)].slice(0, 5), badBtnN: badBtn.length,
    badMoney: badMoney.slice(0, 3),
    badgeCols: badgeCols.slice(0, 3),
    moneyCols: moneyCols.slice(0, 3),
  };
}

async function runViewport(browser, { width, height, tag }, fonts) {
  const results = [];
  const ok = (n, c, d = '') => results.push({ n: `${tag} ${n}`, c, d });
  const ctx = await browser.newContext({
    viewport: { width, height },
    extraHTTPHeaders: { 'x-user-id': USER },
  });
  // **書体を手元の取り置きから返す。** ブラウザは Google Fonts に出られないので、
  // これが無いと全ページが代替書体の字幅で測られる (理由は lib 側に書いてある)
  await installFontCache(ctx, fonts);
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
    /*
     * **書体が描き終わるのを待ってから測る。**
     *
     * 書体は非同期に届くので、待たずに測ると「待ち時間のあいだに間に合ったか」で
     * 結果が変わる (座標の検査が日によって通ったり落ちたりする)。
     *
     * `document.fonts.ready` を待つだけでは足りない。Google Fonts は文字の範囲ごとに
     * woff2 を分けて配っていて、**その画面に出ていない範囲は最初から取りに行かない**。
     * 幅はラテンで比べる (和文は書体が変わっても全角 1em で幅が動かない) ので、
     * 和文しか出ていない画面ではラテンの分が来ておらず、比べる相手が無い。
     * 測る前に**測るのと同じ文字**を明示的に読み込ませて、画面の中身に左右されないようにする。
     */
    await pg.evaluate(() => {
      const fam = getComputedStyle(document.body).fontFamily.split(',')[0].trim();
      return document.fonts.load(`40px ${fam}`, 'Handgloves 12345')
        .then(() => document.fonts.ready).then(() => true);
    }).catch(() => {});
    const m = await pg.evaluate(measure);

    ok(`${label} 横はみ出し 0px`, m.overflowX === 0, `${m.overflowX}px`);
    ok(`${label} 中身が隠れていない`, m.clipped === 0, `${m.clipped}件 ${JSON.stringify(m.clippedList)}`);
    ok(`${label} JSエラー 0件`, errs.length === 0, errs.slice(0, 1).join(''));
    /*
     * 地の色は **アプリによって期待値が違う** (T2 から)。
     *   v4 対象3アプリ・制作資料(Qシート) … #f7f8fa  ← v4 の確定値 (`docs/design/v4/_tokens.md`)
     *   凍結1アプリ (計時LIVE)             … #fafafa  ← 今日と同じ色を保つのが決定事項
     *   放送中の画面                        … #14161a  ← DADS の `.dark` を**意図して**使っている
     * 1つの期待値にまとめると、凍結アプリを「直す」方向に引っぱってしまう。
     */
    const wantBg = opt.dark
      ? 'rgb(20, 22, 26)'
      : FROZEN_PREFIX.test(url)
        ? 'rgb(250, 250, 250)'
        : 'rgb(247, 248, 250)';
    ok(`${label} 地の色が共通`, m.bodyBg === wantBg, m.bodyBg);
    /*
     * 書体と字詰めも **アプリによって期待値が違う** (T3 から)。
     *   v4 対象3アプリ・制作資料(Qシート) … LINE Seed JP ＋ palt/kern
     *   凍結1アプリ (計時LIVE)             … Noto Sans JP・字詰めなし (今日のまま)
     * 凍結アプリに LINE Seed JP を要求すると「直せ」と言い続ける検査になる。
     */
    if (FROZEN_PREFIX.test(url)) {
      ok(`${label} 書体が今日のまま`, m.font.includes('Noto Sans JP'), m.font.slice(0, 30));
    } else {
      ok(`${label} 書体が共通`, m.font.includes('LINE Seed JP'), m.font.slice(0, 30));
      /*
       * **宣言ではなく実際に描かれたか。** 落ちたら書体は代替で描かれている。
       *
       * 開発用のコンテナのブラウザは Google Fonts に出られないので、以前はここが
       * **必ず落ちていた** (毎回出る、直しようのない赤)。いまは `curl` で落とした
       * 取り置きを差し込んでいるので**通るのが普通**。落ちたときは
       *   ① 取り置きに失敗した (冒頭に「取り置きに失敗」と出る)
       *   ② `index.html` の書体の書き方を変えた (URL が変わって取り置きに当たらない)
       * のどちらか。**配信そのものが生きているかは検証環境で見る** — ここが見ているのは
       * 「この字幅で測っている」であって、Google Fonts の可用性ではない。
       */
      ok(`${label} 書体が実際に描かれている`, m.fontLoaded,
        m.fontLoaded ? '' : '代替書体で描かれています (取り置きに当たっていない)');
      ok(`${label} 字詰め (palt)`, /palt/.test(m.feat || ''), m.feat);
    }
    ok(`${label} シェルが画面いっぱい`, m.shellH >= m.vh - 2, `${m.shellH}/${m.vh}`);
    ok(`${label} 薄すぎる文字 0件`, m.faint === 0, `${m.faint}件 ${JSON.stringify(m.faintList)}`);
    ok(`${label} ボタンの高さが段のみ`, m.badBtnN === 0, JSON.stringify(m.badBtn));
    ok(`${label} 金額は¥と数字が別要素`, m.badMoney.length === 0, JSON.stringify(m.badMoney));
    /*
     * v4 の縦の整列 (G4)。**凍結アプリには当てない** — 見た目を今日のまま
     * 保つのが決定事項なので、そこで揃っていなくても直せない。
     */
    if (!FROZEN_PREFIX.test(url)) {
      ok(`${label} バッジの列がそろう (左端・右端)`, m.badgeCols.length === 0, JSON.stringify(m.badgeCols));
      ok(`${label} 金額の右端が±0.5px`, m.moneyCols.length === 0, JSON.stringify(m.moneyCols));
    }
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
/*
 * **測る前に書体を手元へ取り置く。** 初回だけ 10 秒ほどかかる (以後は一瞬)。
 * 失敗しても検証は止めない — その場合は今日までと同じ「代替書体で測る」に戻り、
 * 「書体が実際に描かれている」が落ちることで**それが見て分かる**ようにしてある。
 */
const fonts = await ensureFontCache({ log: (m) => console.log(m) });
if (!fonts.ready) console.log(`※ 書体の取り置きに失敗 (${fonts.note}) — 代替書体で測ります`);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// PC とスマホを同時に走らせる (直列だと単純に2倍かかる)
const all = (await Promise.all([
  runViewport(browser, { width: 1440, height: 900, tag: 'PC' }, fonts),
  runViewport(browser, { width: 375, height: 812, tag: 'スマホ' }, fonts),
])).flat();
await browser.close();

const fail = all.filter((r) => !r.c);
for (const r of fail) console.log('FAIL', r.n, '—', r.d);
const secs = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\n${all.length - fail.length}/${all.length} 通過（${targets.length}ページ × 2画面幅 / ${secs}秒）`);
process.exit(fail.length ? 1 : 0);
