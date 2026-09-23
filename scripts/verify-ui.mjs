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
 *  - PC・スマホ・タブレットを**同時に**走らせる (直列だと単純に3倍かかる)
 *  - `networkidle` を待たない。**Socket.IO をつないでいる画面は永久に idle にならず**、
 *    1ページごとに 30 秒のタイムアウトを丸ごと待っていた
 *  - 1ページの待ちは 1.2 秒。取得が遅い画面だけ `slow` に列挙する
 *
 * 使い方:
 *   node scripts/verify-ui.mjs                 # 全ページ
 *   node scripts/verify-ui.mjs techops live    # 名前に含むページだけ
 *   node scripts/verify-ui.mjs --shots         # 検査の代わりに全ページを 375/768/1280 で撮る
 *   node scripts/verify-ui.mjs --shots --shots-dir=/tmp/shots 設定   # 出力先と絞り込み
 *   BASE=http://localhost:3001 node scripts/verify-ui.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
 * **v4 の対象アプリは全画面を並べる。** 共通の下地 (`shared/src/client/base.css`) や
 * 共通シェルを入れ替えると**全画面に一度に効く**ので、代表2〜3画面では足りない
 * (実際 F2 の前は日常業務2画面・機材2画面しか見ていなかった)。
 * (制作資料 (Qシート) は v4.1 で凍結を解いたので、本番3画面＋公開音声を含め主要画面を並べる)
 * 計時LIVE も共通シェル・v4トークンに載せ替えたので、運用画面はここに含める。
 * **表示画面 (`/live/display/:timerId`) だけは対象外**（下の `FROZEN_PREFIX` 参照。
 * 見た目を変えない決まりのままの1画面で、そもそもここには並べていない）。
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
  // 営業活動記録。**案件別（既定）と時系列の2本立て**なので両方測る
  // （PC 専用をやめた画面なので、375px の実測対象に入れておく）
  ['案件管理 営業活動記録 案件別', '/sales/activity-logs'],
  ['案件管理 営業活動記録 時系列', '/sales/activity-logs?view=timeline'],
  ['案件管理 GLS取込', '/sales/gls-import'],
  // 取引先マスターの顧客絞り込み (旧 /sales/customers はここへ転送される)。
  // 絞り込みは `?role=customer` のクエリで持つので、そのまま付けて測る
  ['案件管理 顧客一覧', '/sales/companies?role=customer'],
  /*
    顧客360 (`/sales/customers/:id`) は**測りたいが並べられない**。
    シード (`server/src/shared/db/seed.ts`) の顧客 id は `createCustomerRecord` が
    uuid で発番するので、`gpm-1` のような**固定 id が無い** — URL をここに書けない。
    顧客にも固定 id をシードで入れたら足すこと。
  */
  ['探す', '/search'],
  ['財務 ダッシュボード', '/budget/dashboard', { slow: true }],
  ['財務 請求・入金', '/budget/billing'],
  ['財務 仕入', '/budget/purchases', { slow: true }],
  ['財務 販管費', '/budget/sga'],
  ['財務 売上', '/budget/revenues', { slow: true }],
  ['財務 取引先', '/budget/vendors'],
  ['財務 取り込み', '/budget/import'],
  ['財務 受け取った書類', '/budget/documents'],
  ['財務 取引先レポート', '/budget/reports/vendors'],
  // カレンダー (①〜④・v4 で作り直し済みなのに1画面も並んでいなかった)。
  // 予定・部屋の空きは自前描画 (FullCalendar をやめた) なので、座標の崩れは
  // ここで測るしかない。設定は PC 専用だがスマホでは案内 (PcOnlyGate) が出る
  // だけなので、他の PC 専用画面 (案件台帳・ガント等) と同じく普通に並べる
  ['カレンダー 予定', '/calendar'],
  ['カレンダー 部屋の空き', '/calendar/rooms'],
  ['カレンダー 仮押さえ', '/calendar/holds'],
  ['カレンダー 設定', '/calendar/settings'],
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
  // 設定の各画面 (①⑤⑥⑦＋システムの情報)。案内板 (/settings) だけ見ても
  // 中の画面の崩れは分からないので1枚ずつ並べる
  ['設定 拠点・部屋', '/settings/sites'],
  ['設定 お金のルール', '/settings/money'],
  ['設定 休日・営業時間', '/settings/hours'],
  ['設定 通知とテンプレート', '/settings/notify'],
  ['設定 システムの情報', '/settings/system'],
  ['Qシート 一覧', '/techops/'],
  ['Qシート 編集', '/techops/editor/verify-onair'],
  ['Qシート OnAir', '/techops/onair/verify-onair', { dark: true }],
  ['Qシート ランダウン', '/techops/rundown/verify-onair', { dark: true }],
  ['Qシート プロンプター', '/techops/prompter/verify-onair', { dark: true }],
  ['Qシート 公開音声', '/techops/audio/verify-onair'],
  /*
   * ⚠️ **ここまでの6本は「まだ v4 化していない画面」しか測っていなかった。**
   * 2026-09-08 の UI 統一（`docs/reviews/techops-ui-unification-plan.md`）で
   * <PageShell>/<PageHeader> に寄せたのは下の画面群なので、そこを測らないと
   * 「ページ幅・見出し・タップ領域が揃ったか」を機械で確かめられない。
   * **案件・番組の id を取る画面（収録設定・配信設定・計時・テロップCG・レンタル・
   * スケジュール表の中身）はまだ並べていない** — verify:up の固定シードに
   * 案件が無く、動的な id を前提にしているため（計時LIVE 側と同じ理由）。
   */
  ['制作技術支援 トップ', '/techops/top'],
  ['制作技術支援 案件選択', '/techops/home'],
  ['制作技術支援 進行台本一覧', '/techops/sheets'],
  ['制作技術支援 スケジュール一覧', '/techops/schedules'],
  ['制作技術支援 スケジュール定型設定', '/techops/settings/schedule-templates'],
  ['制作技術支援 AIナレッジ', '/techops/ai-knowledge'],
  ['制作技術支援 計時 組織の鍵設定', '/techops/live-org-settings'],
  ['制作技術支援 計時 既存セッション', '/techops/live-legacy'],
  ['制作技術支援 計時 表示テンプレート', '/techops/live-display-templates'],
  ['制作技術支援 過去実績の移行', '/techops/graphics/awards-migration'],
  /*
    技術資料（ミニアプリ tech・docs/design/v4/tech-docs.md）。
    **資料1件の画面（`/techops/tech-docs/:id`）は並べられない** — 資料の id は
    作成時に uuid で発番されるので、固定の URL が無い（会場図面・顧客360 と同じ理由）。
    一覧と、組織共通のマスタ2枚（PC専用）はどの環境でも同じ URL で開ける。
  */
  ['技術資料 一覧', '/techops/tech-docs'],
  ['技術資料 パッチ盤', '/techops/tech-panels', { slow: true }],
  ['技術資料 技術人員', '/techops/tech-persons', { slow: true }],

  // ── 計時LIVE (v4 対象・共通シェルへ載せ替え済み) ──────────────
  // 番組配下の画面 (ダッシュボード・タイマー管理・番組設定) は種のデータが要る
  // 動的な programId を前提にしており、verify:up の固定シードに無いので並べていない。
  // `/live/display/:timerId` (表示画面) はここに含めない — 見た目を変えない決まりの
  // 1画面で、FROZEN_PREFIX がこの画面だけを検査から外している。
  ['計時LIVE セッション一覧', '/live/'],
  ['計時LIVE 設定', '/live/settings'],

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
  ['機材 検索', '/equipment/search'],
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
  /*
    内覧会の日別画面 (`/daily/inview/:date`) は**測りたいが並べられない**。
    シード (`seed.ts`) は内覧会の予約 (`inview_registrations`) を1件も入れて
    いないので、**どの日付を開いても空**になり、行・カードの崩れを測れない
    (空表示だけ測っても検査にならない)。固定日付の予約をシードに入れたら足すこと。
  */
  // `/daily/finance` は**画面ではなく転送**になった (v4 ⑥ で財務へ移した)。
  // 中身は上の「財務 受け取った書類」で見る。ここに残すと、転送の一瞬を測って
  // 「シェルが画面いっぱいでない」と必ず落ちる
  ['日常業務 問い合わせ', '/daily/inquiries'],
  ['日常業務 やること', '/daily/tasks'],
  ['日常業務 カード', '/daily/security-cards'],

  // ── Wiki (v4 対象・2026-09-22 段A〜段D) ───────────────────
  // ページ (`/wiki/p/:id`) はシードの id が固定でないので並べていない。
  // スペースは migration 303 が `key` 固定で入れるので URL が動かない。
  ['Wiki ホーム', '/wiki/'],
  ['Wiki スペース 全社', '/wiki/s/all'],
  ['Wiki スペース ONAiR の使い方', '/wiki/s/onair'],
  ['Wiki テンプレート', '/wiki/templates'],
  ['Wiki 検索', '/wiki/search'],
  ['Wiki 書き出しと取り込み', '/wiki/transfer'],
  // 段E。語を入れる前の案内の状態を見る（AI を呼ばせない＝実モデルに依存しない）
  ['Wiki AI に聞く', '/wiki/ask'],
  // 段F。3タブのうち既定（見直し予定）の状態を見る
  ['Wiki 見直し', '/wiki/review'],
  // スペース管理（manager・PC の画面）。一覧の状態を見る（シートは開かない）
  ['Wiki スペース管理', '/wiki/spaces'],
  // リアルタイムCG (`/awards/*`) は廃止済み。サーバーが配信しないので検査対象からも外した
  // (`client-awards/CLAUDE.md` 参照)。
];

/**
 * 見た目を今日のまま保つ URL。**もう「アプリ単位」ではない。**
 *
 * 計時LIVE を共通シェル・v4トークンに載せ替えたので、`/live/` 配下の運用画面
 * (ダッシュボード・設定等) はここから外した — v4 の基準 (地の色・LINE Seed JP・
 * バッジ/金額の整列) を他の v4 対象アプリと同じように当てる。
 *
 * **`/live/display/:timerId`（表示画面）だけは今までどおり対象。** この画面は
 * `TimerDisplayPage.tsx` を一切変えない決まりで、地の色・数字の色は
 * 元から Tailwind の生の値 (`bg-black` 等) で書かれ v4 の基準（灰の地・LINE Seed JP）
 * に合わせる対象にもなっていない（`client-live/src/index.css` の `:has()` が
 * 書体も絶縁している）。PAGES にはまだ並べていないが、将来ここへ足すことがあれば
 * この判定に乗る。
 *
 * Qシート (制作資料) は凍結を解いたので、ここには含めない
 * (`docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md` §10-1)。
 */
const FROZEN_PREFIX = /^\/live\/display\//;

/*
 * ── 引数の読み方 ──────────────────────────────────────────
 * `--shots`     … 検査の代わりに、全ページの fullPage スクリーンショットを撮る。
 *                 出力先は**リポジトリの外** (既定 ~/verify-ui-shots/<日付>/)。
 *                 中に置くと lint・ビルドの走査対象が数百MB増えるうえ、
 *                 誤ってコミットする事故が起きる。
 * `--shots-dir` … 出力先を変える (`--shots-dir=/tmp/x` / `--shots-dir /tmp/x`)。
 * それ以外      … 今までどおりページ名・URL の絞り込み。
 */
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
let shotsDirArg = null;
const filters = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--shots') continue;
  if (a === '--shots-dir') { shotsDirArg = argv[++i] ?? null; continue; }
  if (a.startsWith('--shots-dir=')) { shotsDirArg = a.slice('--shots-dir='.length); continue; }
  filters.push(a);
}
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
  const crushed = [];
  // **1周で全部見る。** `getComputedStyle` は毎回スタイル解決が走るので、
  // 2周すると大きい画面で数秒違う (検証の待ち時間がそのまま増える)
  document.querySelectorAll('body *').forEach((el) => {
    if (!el.textContent?.trim() || el.children.length) return;
    const txt = el.textContent.trim();
    // 金額は ¥ と数字が別要素 (1要素に「¥4,820,000」だと桁がそろわない)
    if (/^[-−]?¥\s*[\d,]+$/.test(txt) && txt.length > 1) badMoney.push(txt.slice(0, 14));
    const s = cs(el);
    if (s.visibility === 'hidden' || s.display === 'none') return;
    if (el.closest('[aria-hidden="true"]')) return;      // 装飾は対象外
    /*
     * ── 潰れ検知 (いまは**報告のみ**・落とさない) ──────────────
     * 文字の入った要素が数px幅に潰れ、和文が1文字ずつ縦に折り返される崩れは
     * `document.scrollWidth` (横はみ出しの検査) には**現れない** — 画面の外へ
     * はみ出すのではなく、その要素の中だけで折り返されるため。実例:
     * /gpm/templates の工程名欄・/settings/money の hint (M11 の実測で発覚)。
     * clientWidth < 24px なのに scrollWidth が超えている＝中身が幅に入って
     * いない要素を数える。**積み残しを潰し終えたら他の検査と同じ
     * 「0件で通過」に格上げする** (今すぐ落とすと既存の崩れで検査全体が
     * 赤くなり、新しい崩れが埋もれる)。
     */
    if (el.clientWidth < 24 && el.scrollWidth > el.clientWidth) {
      /*
       * ⚠️ **読み上げ専用の文字 (`sr-only`) は潰れではない。**
       * Tailwind の `sr-only` は 1px の箱に押し込んで `clip` で隠す作りなので、
       * 上の条件に**必ず当たります**。数えると、絵柄のボタンに名前を付けた画面が
       * 全部「崩れている」と出て、**本物の崩れがその中に埋もれます**
       * (この検査を 0件必須に格上げできない理由になっていた)。
       */
      const srOnly = s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)';
      if (!srOnly) crushed.push(`${el.clientWidth}px "${txt.slice(0, 12)}"`);
    }
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
    /*
     * `line-clamp` と同じ「切ると決めた」もの。**中身を自前で送る箱**に付ける印。
     * スクロールバーを出さずに `scrollTop` を動かすので `overflow-y: hidden` だが
     * 中身には届く (プロンプターの台本 — 画面より高いのが仕様で、速度は本人が変えられる)。
     */
    if (el.closest('[data-clip-ok]')) return;
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
    crushed: crushed.length, crushedList: [...new Set(crushed)].slice(0, 3),
    badBtn: [...new Set(badBtn)].slice(0, 5), badBtnN: badBtn.length,
    badMoney: badMoney.slice(0, 3),
    badgeCols: badgeCols.slice(0, 3),
    moneyCols: moneyCols.slice(0, 3),
  };
}

async function runViewport(browser, { width, height, tag, layoutOnly }, fonts) {
  const results = [];
  const reports = [];   // 潰れ検知 (報告のみ)。落とさないので results と分けて持つ
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

    // 潰れ検知は**報告のみ** (measure 内のコメント参照)。落とさず数だけ集める
    if (m.crushed) reports.push({ n: `${tag} ${label}`, crushed: m.crushed, list: m.crushedList });

    ok(`${label} 横はみ出し 0px`, m.overflowX === 0, `${m.overflowX}px`);
    ok(`${label} 中身が隠れていない`, m.clipped === 0, `${m.clipped}件 ${JSON.stringify(m.clippedList)}`);
    ok(`${label} シェルが画面いっぱい`, m.shellH >= m.vh - 2, `${m.shellH}/${m.vh}`);
    /*
     * ── 768px (タブレット) は**レイアウトの検査だけ**当てる ─────────
     * 横はみ出し・到達不能な隠れ・シェルの高さの3つ。整列の検査 (バッジ・
     * 金額の桁・ボタンの段・書体・地の色…) は 1440/375 の2幅が既に見ており、
     * 768px 特有の結果を一度レビューしてから段階的に有効にする — いきなり
     * 全検査を3幅めに当てると、既存の積み残しで検査全体が赤くなり、
     * 新しい崩れが埋もれる (潰れ検知を報告のみで始めるのと同じ理由)。
     */
    if (layoutOnly) continue;
    ok(`${label} JSエラー 0件`, errs.length === 0, errs.slice(0, 1).join(''));
    /*
     * 地の色は **画面によって期待値が違う** (T2 から)。
     *   v4 対象アプリ (計時LIVEの運用画面を含む)  … #f7f8fa  ← v4 の確定値 (`docs/design/v4/_tokens.md`)
     *   計時LIVE の表示画面 (`/live/display/`)    … #fafafa  ← 今日と同じ色を保つのが決定事項
     *   放送中の画面                              … #14161a  ← DADS の `.dark` を**意図して**使っている
     * 1つの期待値にまとめると、見た目を変えない画面を「直す」方向に引っぱってしまう。
     */
    const wantBg = opt.dark
      ? 'rgb(20, 22, 26)'
      : FROZEN_PREFIX.test(url)
        ? 'rgb(250, 250, 250)'
        : 'rgb(247, 248, 250)';
    ok(`${label} 地の色が共通`, m.bodyBg === wantBg, m.bodyBg);
    /*
     * 書体と字詰めも **画面によって期待値が違う** (T3 から)。
     *   v4 対象アプリ (計時LIVEの運用画面を含む) … LINE Seed JP ＋ palt/kern
     *   計時LIVE の表示画面 (`/live/display/`)   … Noto Sans JP・字詰めなし (今日のまま)
     * 見た目を変えない画面に LINE Seed JP を要求すると「直せ」と言い続ける検査になる。
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
  return { results, reports };
}

/**
 * `--shots`: 検査の代わりに fullPage スクリーンショットを撮る。
 * 375 / 768 / 1280 の3幅 × 全ページ。ファイル名は「ページ名-幅w.png」。
 * 検査は数値しか残らないので、「どう崩れているか」を人が見て判断する材料
 * (バックログのレビュー・768px の整列検査を有効にする判断) はここで作る。
 */
async function shootViewport(browser, width, height, outDir, fonts) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    extraHTTPHeaders: { 'x-user-id': USER },
  });
  await installFontCache(ctx, fonts);
  await ctx.addInitScript((id) => {
    localStorage.setItem('gmo_onair_user', JSON.stringify({
      id, name: '検証 管理者', email: 'v-admin@example.com', role: 'system_admin',
    }));
  }, USER);
  const pg = await ctx.newPage();
  let count = 0;
  for (const [label, url, opt = {}] of targets) {
    try {
      await pg.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
      console.log(`SHOT SKIP ${label} ${width}w — ${e.message.slice(0, 60)}`);
      continue;
    }
    await pg.waitForTimeout(opt.slow ? 2500 : 900);
    // 書体が描き終わる前に撮ると代替書体の絵が残る (検査と同じ待ち方)
    await pg.evaluate(() => {
      const fam = getComputedStyle(document.body).fontFamily.split(',')[0].trim();
      return document.fonts.load(`40px ${fam}`, 'Handgloves 12345')
        .then(() => document.fonts.ready).then(() => true);
    }).catch(() => {});
    // ファイル名 = ページ名 + 幅。空白と `/` だけ `_` に変える (それ以外は残す)
    await pg.screenshot({
      path: path.join(outDir, `${label.replace(/[\s/]+/g, '_')}-${width}w.png`),
      fullPage: true,
    });
    count++;
  }
  /*
   * 計時LIVE の表示画面 (`/live/display/:timerId`・レイアウト未設定の既定表示) も
   * 撮りたいが、固定シード (`seed.ts`) にタイマーが1件も無いので URL を組み立て
   * られない。固定 id のタイマーをシードに入れたら、ここで1枚だけ追加で撮ること
   * (FROZEN_PREFIX の対象なので検査には載せない・撮るだけ)。
   */
  await ctx.close();
  return count;
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

if (SHOTS) {
  // 出力先は**リポジトリの外** (引数の読み方のコメント参照)
  const outDir = shotsDirArg
    || path.join(os.homedir(), 'verify-ui-shots', new Date().toISOString().slice(0, 10));
  fs.mkdirSync(outDir, { recursive: true });
  const counts = await Promise.all([
    shootViewport(browser, 375, 812, outDir, fonts),
    shootViewport(browser, 768, 1024, outDir, fonts),
    shootViewport(browser, 1280, 900, outDir, fonts),
  ]);
  await browser.close();
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`\n${total} 枚を ${outDir} に保存（${targets.length}ページ × 375/768/1280 / ${secs}秒）`);
  process.exit(0);
}

// PC とスマホとタブレットを同時に走らせる (直列だと単純に3倍かかる)
const out = await Promise.all([
  runViewport(browser, { width: 1440, height: 900, tag: 'PC' }, fonts),
  runViewport(browser, { width: 375, height: 812, tag: 'スマホ' }, fonts),
  // 768px はレイアウトの検査だけ (runViewport 内のコメント参照)
  runViewport(browser, { width: 768, height: 1024, tag: 'タブレット', layoutOnly: true }, fonts),
]);
await browser.close();
const all = out.flatMap((o) => o.results);

// 潰れ検知の報告 (落とさない)。0件のページは出さず、ある分だけ数と現物を並べる
const crushReports = out.flatMap((o) => o.reports);
if (crushReports.length) {
  console.log('※ 潰れ検知（報告のみ・積み残しを潰し終えたら 0件必須に格上げする）:');
  for (const r of crushReports) console.log(`  ${r.n} — ${r.crushed}件 ${JSON.stringify(r.list)}`);
}

const fail = all.filter((r) => !r.c);
for (const r of fail) console.log('FAIL', r.n, '—', r.d);
const secs = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\n${all.length - fail.length}/${all.length} 通過（${targets.length}ページ × 3画面幅・768px はレイアウトのみ / ${secs}秒）`);
process.exit(fail.length ? 1 : 0);
