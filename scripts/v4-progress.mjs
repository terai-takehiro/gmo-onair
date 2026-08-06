#!/usr/bin/env node
/**
 * v4 の進み具合を「サイトツリー」で出す (docs/v4-progress.md を書き直す)
 *
 * ── なぜ手書きの表にしないか ────────────────────────────────
 *
 * 「ここまで出来ました」を手で書くと**必ず実態とずれます**。直したのに表を
 * 更新し忘れる／表だけ先に埋める、のどちらかが起きます。
 *
 * → **画面のファイルを実際に読んで判定します。** 判定の中身は下の `V4_MARK`。
 * 表を直し忘れても、画面を直せば勝手に追随します。**嘘がつけません。**
 *
 *   node scripts/v4-progress.mjs           # 画面に出す
 *   node scripts/v4-progress.mjs --write   # docs/v4-progress.md に書く
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

/**
 * 「作り直した」の印。**`<PageHeader>` を使っているかどうかだけ**を見ます。
 *
 * 最初は「v4 の部品をどれか使っていれば ✅」にしましたが、**甘すぎました** —
 * 料金表と売上が ✅ になります。あの2つは作り直していませんが、
 * P1 で入れた `<Money>` や P3 の `states` を先に取り込んでいるためです。
 *
 * `<PageHeader>` は **Phase 2 で作った画面の枠**で、それ以前には存在しません。
 * これを使っている = 画面の頭から組み直した、と言い切れます。
 * 案件詳細だけは枠を自前で持っている (タブがあるため) ので別に見ます。
 */
const V4_MARK = 'ui/pageHeader';
/** 例外: 案件詳細は `DetailHeader` が枠を持つ (タブ付きなので PageHeader を使わない) */
const V4_EXTRA_MARK = 'projectDetail/DetailHeader';

/**
 * 画面の一覧。**v4 の設計 (docs/design/v4) の画面立てに合わせて並べる。**
 *
 *   [名前, URL, 見るファイル, 目印(省略可), 注記(省略可)]
 *
 * - `見るファイル` が `null` の行は「これから作る」(新規)
 * - `目印` を書いた行は**その文字列**で判定する。画面ではないもの (共通シェルなど) は
 *   `<PageHeader>` を持たないので、行ごとに何を見るかを指定できるようにしてある
 * - `注記` は表の下に出す。**「まだ」に見えるが意図してそうしている**ものを
 *   説明するため (書かないと「やり忘れ」と読まれる)
 */
const TREE = [
  ['案件管理', [
    ['① ダッシュボード', '/sales/dashboard', 'client/src/contexts/platform/pages/DashboardPage.tsx'],
    ['② 受付', '/sales/inbox', 'client/src/contexts/sales/pages/InboxPage.tsx'],
    ['③ 案件一覧', '/sales/projects', 'client/src/contexts/sales/pages/ProjectListPage.tsx'],
    ['④ タスク一覧', '/sales/tasks/list', 'client/src/contexts/tasks/pages/TaskDashboardPage.tsx'],
    ['⑤ 見積・請求 (全案件)', '/sales/billing', 'client/src/contexts/sales/pages/BillingListPage.tsx'],
    ['⑥ 案件詳細', '/sales/projects/:id', 'client/src/contexts/sales/pages/ProjectDetailPage.tsx'],
    ['⑦ 標準工程 (設定)', '—', null, undefined,
      '**社内で工程を整理中のため後回し**（ご判断）。**スタジオ案件とプロジェクトで工程がまったく別**になるので、' +
      'テンプレートは2系統つくります。工程の並び・期限の決め方・担当の職種をいただければ着手できます'],
    ['⑧ 料金表', '/sales/pricing', 'client/src/contexts/sales/pages/PricingListPage.tsx'],
  ]],
  ['財務管理', [
    ['ダッシュボード', '/budget/dashboard', 'client/src/contexts/finance/pages/BudgetDashboardPage.tsx'],
    ['請求・入金', '/budget/billing', 'client/src/contexts/finance/pages/ClosingPage.tsx'],
    ['売上', '/budget/revenues', 'client/src/contexts/finance/pages/RevenueListPage.tsx'],
    ['仕入', '/budget/purchases', 'client/src/contexts/finance/pages/PurchaseListPage.tsx'],
    ['販管費', '/budget/sga', 'client/src/contexts/finance/pages/SgaListPage.tsx'],
    ['取引先 (仕入先・パートナー)', '/budget/vendors', 'client/src/contexts/finance/pages/CounterpartyPage.tsx'],
    // 日常業務 (`/daily/finance`) から移した。`dailyops` だけを要求していて経理が開けなかった
    ['受け取った書類', '/budget/documents', 'client/src/contexts/finance/pages/DocumentsPage.tsx'],
    // v4 ⑦: 精算PDF・総勘定元帳・二重計上を1画面3タブに畳んだ（旧3 URL は転送）
    ['取り込み (精算PDF・総勘定元帳・二重計上)', '/budget/import', 'client/src/contexts/finance/pages/ImportPage.tsx'],
  ]],
  ['カレンダー', [
    ['予定', '/studio/calendar', 'client/src/contexts/production/pages/StudioCalendarPage.tsx'],
    ['部屋の空き', '/studio/all', 'client/src/contexts/production/pages/AllStudiosPage.tsx'],
    ['パートナー', '/studio/partners', 'client/src/contexts/production/pages/PartnerSchedulePage.tsx'],
    ['自分の予定', '/studio/my-calendar', 'client/src/contexts/production/pages/MyCalendarPage.tsx'],
  ]],
  ['設定', [
    ['設定トップ', '/settings', 'client/src/contexts/platform/pages/SettingsPage.tsx'],
    ['権限とメンバー', '/settings/users', 'client/src/contexts/platform/pages/UserListPage.tsx'],
    ['データ', '/settings/data-viewer', 'client/src/contexts/platform/pages/DataViewerPage.tsx'],
    ['DBバックアップ', '/settings/db-backups', 'client/src/contexts/platform/pages/DbBackupsPage.tsx'],
  ]],
  ['共通', [
    ['トップページ', '/', 'client/src/contexts/platform/pages/HomePage.tsx',
      './home/AppTiles',
      'v4 は**上＝アプリの入口 ／ 下＝自分の今日**に絞りました。旧トップにあった KPI・営業ダッシュボード・' +
      'AI活動フィード・直近の案件は、**各アプリのダッシュボードと同じ中身を二重に見ていた**ので外し、' +
      'それぞれの画面へ送っています（理由と行き先は `HomePage.tsx` の冒頭）'],
    // シェルは画面ではないので `<PageHeader>` を持たない。**3アプリが共通シェルを
    // 読んでいるか**で判定する (S2 / S3 で載せ替え済み)
    ['共通シェル (上辺バー64px・左メニュー248px・スマホ下タブ)', '—',
      'client/src/components/layout/AppShell.tsx', 'shared/src/client/shell'],
    ['左メニューの項目・並び・ラベル', '—',
      'client/src/components/layout/nav.ts', '@@意図して据え置き@@',
      '**案件管理だけ v4 の情報設計に差し替え済み**（業務／全案件／設定 の3つ＋折りたたみの「そのほか」）。' +
      '財務・カレンダー・設定・日常業務・機材管理は**今までのまま**で、' +
      'その入口の画面を作り終えたときに差し替えます。' +
      '前回の刷新は「枠の作り替え」と「情報設計の変更」を同じ回でやり、情報設計が却下されたときに ' +
      '**枠まで一緒に捨てられました**。今回は画面ができた入口から順に変えています'],
  ]],
  ['日常業務', [
    ['ウィークリー活動報告', '/daily/weekly', 'client-daily/src/pages/WeeklyListPage.tsx'],
    ['デイリーニュース', '/daily/news', 'client-daily/src/pages/DailyNewsPage.tsx'],
    ['内覧会 開催日', '/daily/inview', 'client-daily/src/pages/InviewPage.tsx'],
    ['入ってきた情報 (その他問い合わせ)', '/daily/inquiries', 'client-daily/src/pages/InquiriesPage.tsx'],
    ['受け取った書類', '/budget/documents', 'client/src/contexts/finance/pages/DocumentsPage.tsx', undefined,
      '**財務管理へ移しました**（`/daily/finance` は転送）。`dailyops` 権限だけを要求していたので' +
      '**経理が開けませんでした**（実測で 403）。いまは `budget` か `dailyops` のどちらかで通ります'],
    ['セキュリティカード', '/daily/security-cards', 'client-daily/src/pages/SecurityCardsPage.tsx'],
  ]],
  ['機材管理', [
    ['ダッシュボード', '/equipment/', 'client-equipment/src/pages/DashboardPage.tsx'],
    // v4: 機材・貸出機材・ケーブル・コネクタを1画面4タブに畳んだ（旧 URL は転送）
    ['機材台帳 (機材・貸出機材・ケーブル・コネクタ)', '/equipment/items', 'client-equipment/src/pages/EquipmentLedgerPage.tsx', undefined,
      '**枠は v4・行の載せ替えは途中**。この一覧だけがカスタム列・その場編集・親子の入れ子を' +
      '同時に持っており、`<Row>` に載せ替えるとその3つを作り直すことになるので分けています'],
    ['ラック図', '/equipment/racks', 'client-equipment/src/pages/RackLayoutPage.tsx', undefined,
      '**意図して据え置き**。1,502行に 座標計算・印刷・棚卸しモード が同居しており、' +
      '**触ると印刷が1ページ目で切れます**。分割しても印刷が壊れないことを実機で確かめてから'],
    ['メンテナンス', '/equipment/maintenance', 'client-equipment/src/pages/MaintenancePage.tsx'],
    ['棚卸し', '/equipment/inventory', 'client-equipment/src/pages/InventoryPage.tsx'],
    ['QRスキャン', '/equipment/scan', 'client-equipment/src/pages/ScanPage.tsx'],
    ['貸出・返却', '/equipment/lendings', 'client-equipment/src/pages/LendingListPage.tsx'],
    // v4: 拠点・メーカー・色・貸出カテゴリ・貸出の決めごとを1画面4タブに畳んだ
    ['設定 (拠点・メーカー・貸出カテゴリ・貸出の決めごと)', '/equipment/settings', 'client-equipment/src/pages/SettingsPage.tsx'],
  ]],
  // v4 で新しく作ったアプリ。DB・API・画面すべて新規（migration 161/162）
  ['プロジェクト管理 (新規)', [
    ['① ダッシュボード', '/gpm/dashboard', 'client/src/contexts/gpm/pages/GpmDashboardPage.tsx'],
    ['② プロジェクト一覧', '/gpm/projects', 'client/src/contexts/gpm/pages/GpmProjectListPage.tsx'],
    ['③ プロジェクト詳細', '/gpm/projects/:id', 'client/src/contexts/gpm/pages/GpmProjectDetailPage.tsx'],
    ['④ 新規作成', '/gpm/projects/new', 'client/src/contexts/gpm/pages/GpmProjectFormPage.tsx'],
    ['⑤ やること（未確認事項）', '/gpm/tasks', 'client/src/contexts/gpm/pages/GpmTaskListPage.tsx'],
    ['⑦ 標準工程テンプレート', '/gpm/templates', 'client/src/contexts/gpm/pages/GpmTemplateListPage.tsx'],
    ['⑥ 見積・請求', '—', null, undefined,
      '**意図して作っていません。** `estimates.project_id` が `NOT NULL REFERENCES projects(id)` なので、' +
      '自社構築（案件に紐づかない）プロジェクトは見積を1枚も持てません。モックの「提出先」に相当する列も 0 件。' +
      '足すとサーバー12か所・画面4か所（案件詳細の見積タブ・見積請求一覧・案件ダッシュボードの KPI）に同時に効きます。' +
      '**見積のデータ設計の変更**なので設計から。理由と手順は `docs/design/gpm-model.md` の「決め⑤」'],
  ]],
];

/**
 * その画面が v4 で作り直されているか。
 * `mark` を渡すとその文字列で判定する (画面以外の行はこちらを使う)。
 * `@@意図して据え置き@@` は「作れていない」ではなく「そうすると決めた」の印。
 */
function isV4(file, mark) {
  if (mark === '@@意図して据え置き@@') return false;
  if (!file || !existsSync(file)) return false;
  const text = readFileSync(file, 'utf8');
  if (mark) return text.includes(mark);
  return text.includes(V4_MARK) || text.includes(V4_EXTRA_MARK);
}

/** 案件詳細のタブ。**`tabs.ts` の `todo: true` を読む** (手で書くとずれる) */
function detailTabs() {
  const p = 'client/src/contexts/sales/pages/projectDetail/tabs.ts';
  if (!existsSync(p)) return [];
  const text = readFileSync(p, 'utf8');
  return [...text.matchAll(/label: '([^']+)'[^}]*?}/g)].map((m) => {
    const whole = m[0];
    return [m[1], !whole.includes('todo: true')];
  });
}

const lines = ['# v4 の進み具合（サイトツリー）', '',
  '> **この文書は生成物です。** `node scripts/v4-progress.mjs --write` で作られます。',
  '> 手で書くと実態とずれるので、**画面のファイルが v4 の共通部品を使っているか**で判定しています。',
  '',
  '| 印 | 意味 |', '| --- | --- |',
  '| ✅ | v4 で作り直した |', '| ⬜ | まだ（見た目は今までのまま・動きます） |',
  '| ⏸ | **意図して据え置き**（下の注記を読んでください） |',
  '| 🆕 | これから新しく作る（いま画面がない） |',
  '',
  '## ⬜ の画面も「今までのまま」ではありません', '',
  '下の土台は **v4 対象3アプリの全画面に、もう効いています**。',
  '⬜ が意味するのは「その画面の中身（並べ方・列・見出し）をまだ組み直していない」ことだけです。', '',
  '- **色**（GMO ブルー `#005bac`・地の色 `#f7f8fa`・罫線 `#e6e9ed`）',
  '- **書体**（LINE Seed JP ＋ 字詰め `palt`）',
  '- **共通シェル**（上辺バー 64px・左メニュー 248px・スマホ下タブ）',
  '- **ボタンと入力欄**（角丸 10px・太字・高さ 40〜44px）',
  '- **お知らせ帯・確認ダイアログ・空/エラー/権限なしの出し方**',
  '',
  '> **書体だけは検証環境で見てください。** LINE Seed JP は Google Fonts から配信していますが、',
  '> **開発用のコンテナは外に出られないので代替書体で描かれます**（`verify:ui` の',
  '> 「書体が実際に届いている」がそれを見ています）。手元の見え方＝本物ではありません。',
  ''];

let done = 0, total = 0;
for (const [section, screens] of TREE) {
  lines.push(`## ${section}`, '');
  lines.push('| | 画面 | URL |', '| --- | --- | --- |');
  const notes = [];
  for (const [name, url, file, howToTell, note] of screens) {
    const held = howToTell === '@@意図して据え置き@@';
    const mark = file === null ? '🆕' : isV4(file, howToTell) ? '✅' : held ? '⏸' : '⬜';
    if (file !== null) { total++; if (mark === '✅') done++; }
    lines.push(`| ${mark} | ${name} | \`${url}\` |`);
    if (note) notes.push(`- **${name}** — ${note}`);
  }
  lines.push('');
  if (notes.length) lines.push(...notes, '');
  if (section === '案件管理') {
    lines.push('**⑥ 案件詳細のタブ**', '');
    lines.push(detailTabs().map(([n, ok]) => `${ok ? '✅' : '⬜'} ${n}`).join(' ／ '), '');
  }
}

lines.push('## 凍結（v4.0.0 では作り直さない）', '',
  '見た目は今までのまま、**URL は生きています**。アプリの一覧からは外れます。', '',
  '⬜ 制作資料（Qシート） ／ ⬜ 技術資料 ／ ⬜ 計時LIVE ／ ⬜ リアルタイムCG', '');

lines.push('## まだ入っていない機能', '',
  '- **持ち帰り事項からタスクを作る**（議事録）— いまはタスクタブから手で入れます',
  '- **BOX にファイルを置く**（書類タブ）— いまは中を見るだけ',
  '- **スマホ専用の13画面**（Phase 6）',
  '- **標準工程テンプレート** — 社内で整理中のため後回し（スタジオ案件とプロジェクトで別の表を作ります）',
  '');

lines.unshift('');
lines.unshift(`**${done} / ${total} 画面**が v4 になりました（凍結4アプリと新規画面を除く）。`);

const out = lines.join('\n');
if (process.argv.includes('--write')) {
  writeFileSync('docs/v4-progress.md', out);
  console.log(`[v4-progress] docs/v4-progress.md を書きました (${done}/${total})`);
} else {
  console.log(out);
}
