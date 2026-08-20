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
    // この画面は `PageHeader` を使わない（決めるボタンを上辺に貼り付ける独自の見出し）ので、
    // **この画面にしかない部品**（届いたもののレール）で判定する
    ['② 案件作成（受付を統合）', '/sales/projects/new',
      'client/src/contexts/sales/pages/projectNew/NewProjectDialog.tsx', './IntakeRail',
      '**旧「受付」（`/sales/inbox`）を畳んだ画面**。届いたものを読んで、足りないところを埋めて、' +
      '案件にするかどうかを決める仕事は案件作成と同じだったので1枚にした。' +
      '上に「自動で届いたもの」のレール、下にフォーム（必須5つ ＋ 畳んだ「進んだら聞く」）、' +
      '上辺に **ネタのまま残す ／ 見送りにする ／ 案件にする（与件化）**。' +
      '**GLS はここで発番しない**（受注が固まってから）。旧 URL は転送する'],
    ['③ 案件一覧', '/sales/projects', 'client/src/contexts/sales/pages/ProjectListPage.tsx'],
    ['④ タスク一覧', '/sales/tasks/list', 'client/src/contexts/tasks/pages/TaskDashboardPage.tsx'],
    ['⑤ 見積・請求 (全案件)', '/sales/billing', 'client/src/contexts/sales/pages/BillingListPage.tsx'],
    ['⑥ 案件詳細', '/sales/projects/:id', 'client/src/contexts/sales/pages/ProjectDetailPage.tsx'],
    ['⑦ 標準工程テンプレート', '/sales/flow-templates',
      'client/src/contexts/sales/pages/flow/FlowTemplatePage.tsx', undefined,
      'モックの **6 段 26 工程**（担当の職種・実施日からの逆算日数・外せるかどうか）を初期値に入れてある。' +
      '**案件をつくったときに黙って入れない** — タスクタブの帯から一覧を見せ、チェックを外してから入れる。' +
      '**二度は入れられない**（`projects.flow_applied_at`）。**プロジェクト管理とは別系統**'],
    ['⑧ 料金表', '/sales/pricing', 'client/src/contexts/sales/pages/PricingListPage.tsx'],
    ['案件台帳 (新規)', '/sales/projects/ledger',
      'client/src/contexts/sales/pages/ProjectLedgerPage.tsx', undefined,
      '**③ 案件一覧とは役割が別**。あちらは毎日開いて次の一手を決める画面（1行に4つ）で、' +
      'こちらは**列を出し入れして網羅して見る・選んでまとめて直す**ための台帳（機材台帳と同じ役割）。' +
      '**引くのは案件一覧と同じ口**（`GET /projects`）— 別の口を作ると2つの画面で違う数が出る。' +
      '列は 20 個（既定 9 個）で、出し入れと並びは**その端末に残る**。' +
      '**まとめて直せるのは8項目**で1回に1項目、押す前に件数と「元に戻せません」を出す。' +
      '⚠️ **ステージは入れていない** — 履歴・失注理由・GLS 発番の確認を飛ばしてしまうため。' +
      '**PC 専用**（取り消せない一括更新を指で押させない）'],
    ['取引先マスター', '/sales/companies',
      'client/src/contexts/sales/pages/CompanyListPage.tsx', undefined,
      '**v3 の置き土産だった最後の1画面**（「そのほか（作り直し前）」の棚卸しで唯一残っていたもの）。' +
      '機能は変えず `PageHeader` / `Row`・`TableBadge` / `FilterChips` に載せ替え、' +
      '左メニューは「設定」（料金表の下）へ移した。' +
      '⚠️ **ついでに見つけた権限のバグを2つ直した**: ① `useCrudPage` が常に `onError` を' +
      '渡していたため、呼び出し側が `onError` を渡さない画面（この画面ほか3画面）では' +
      '保存・削除が失敗しても**画面のどこにも出ていなかった**。② サーバー側の PUT が' +
      '`vendor_type`/`invoice_registration_number` の**キーが入っているか**を見ていたが、' +
      'この画面のフォームは常に全項目を送るため、`budget:editor` を持たない `sales:owner` は' +
      '**顧客の電話番号を直すだけでも 403** になっていた'],
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
    // v4: モックの4画面。① 予定は**統合カレンダー1本＋レイヤー**（旧 `/studio/all`）。
    // この画面は `PageHeader` を使わない（PC は macOS のカレンダーアプリ風の独自ツールバー、
    // スマホは iPhone のカレンダーアプリ風の独自ヘッダーで、どちらも `PageHeader` の
    // 「見出し＋主アクション」の枠に収まらない）ので、**この画面にしかない部品**で判定する
    ['① 予定', '/studio/calendar', 'client/src/contexts/production/pages/UnifiedCalendarPage.tsx', './calendar/DesktopToolbar',
      '**カレンダーを1本にしました**（旧メニューは「統合／スタジオ／パートナー／マイ」の4本が並んでいて、どれを開けばよいか分かりませんでした — 中身はほぼ同じで見えるレイヤーが違うだけ）。' +
      '**FullCalendar をやめて自分で描いています** — モックの月マスは 17px の帯、週・日は重なりを横に割った札で、あちらの DOM とは組み立てが違い、' +
      'CSS で寄せると `.fc-*` に依存した規則が積み上がって版が上がるたびに崩れるためです。' +
      '置き方の計算は `calendar/calendarLayout.ts` に出して 26 項目のテストで固定してあります。' +
      '**「予定を入れる」を足しました**（着手前は新規作成が1つも無く「各カレンダーへ行ってください」と書いてあるだけでした）。' +
      '**祝日は設定 ⑥ の表から読みます**（着手前は画面に 2025〜2027 が直書きで、2028 年になると祝日が1つも出ませんでした）。' +
      '**旧スタジオ・パートナー・マイの3画面も同じ描画部品に載せ替え済み**です（FullCalendar は3画面とも撤去した）。' +
      'ただし情報設計（「そのほか（作り直し前）」に畳んだ位置づけ）は変えていません — 予約を作る唯一の導線がスタジオ画面にしかないため。' +
      'PC は承認済みモック（macOS のカレンダーアプリ風）に合わせて作り直し済み — ミニカレンダーと' +
      '「マイカレンダー」（出すもの）を共通の左メニューへ常設し（差し込み口は `shared/.../shell/sideMenuSlot.ts`）、' +
      'ツールバーは今日／前後／期間の見出し／月・週・一覧の切替／予定を入れる だけの1段にした。' +
      'スマホは承認済みモック（iPhone のカレンダーアプリ風）に合わせて作り直し済み — 数字＋点だけの月表＋当日アジェンダで、' +
      'ここからも「予定を入れる」ができる（`rooms/MobileToday.tsx`）'],
    // ① 予定と同じ理由（PageHeader を使わない macOS 風の独自ツールバー）で目印を差し替える
    ['② 部屋の空き', '/studio/rooms', 'client/src/contexts/production/pages/RoomAvailabilityPage.tsx', './rooms/RoomAvailabilityToolbar',
      'PC は承認済みモック（macOS のカレンダーアプリ風）に合わせて作り直し済み。① 予定と同じくミニカレンダーを' +
      '共通の左メニューへ常設したが、**この画面はレイヤーという概念を持たない**ので「マイカレンダー」の' +
      'チェックは出さず、代わりに絞り込みを持たないと説明する。部屋は拠点ごとに見出しでグループ化して表示する。' +
      '**帯の色を「部屋の色」から「種別の色」に変えた**（① 予定・③ 仮押さえと同じ `BOOKING_TYPE_COLORS`） — ' +
      '旧実装は部屋の色で塗っており、同じ予約がこの画面だけ違う色に見える食い違いがあった'],
    ['③ 仮押さえ', '/studio/holds', 'client/src/contexts/production/pages/HoldListPage.tsx'],
    ['④ 設定（部屋・外部カレンダー・サイネージ）', '/studio/settings', 'client/src/contexts/production/pages/CalendarSettingsPage.tsx'],
    ['（旧）スタジオカレンダー', '/studio/studio-calendar', 'client/src/contexts/production/pages/StudioCalendarPage.tsx', '@@意図して据え置き@@',
      '**予約を作る導線がここにしかない**ので残しています（消すと作れなくなる）。メニューでは「そのほか（作り直し前）」に畳んであります。' +
      '⚠️ **FullCalendar は撤去済み**（① 予定と同じ `calendar/` の描画部品に載せ替えた）。' +
      '据え置いているのは情報設計（このIA上の位置づけ）だけで、見た目の技術的負債は残っていない'],
    ['（旧）パートナー', '/studio/partners', 'client/src/contexts/production/pages/PartnerSchedulePage.tsx', '@@意図して据え置き@@',
      '⚠️ **FullCalendar は撤去済み**（① 予定と同じ描画部品に載せ替えた）。据え置いているのは情報設計だけ'],
    ['（旧）自分の予定', '/studio/my-calendar', 'client/src/contexts/production/pages/MyCalendarPage.tsx', '@@意図して据え置き@@',
      '**パートナーと自分の予定を作れるのはこの2画面だけ**です。① 予定はレイヤーとして見せるところまで。' +
      '⚠️ **FullCalendar は撤去済み**（① 予定と同じ描画部品に載せ替えた）。据え置いているのは情報設計だけ'],
  ]],
  ['設定', [
    ['① 設定トップ (案内板)', '/settings', 'client/src/contexts/platform/pages/SettingsHubPage.tsx',
      './settings/hubCards',
      '**8枚のうち3枚は「これから作ります」**（お金のルール / 休日・営業時間 / 通知とテンプレート）。' +
      '持つ表がまだ無いので、押せない形で並べ、何が足りないかを画面に書いています。' +
      '**権限が無いカードはカードごと出しません**（押せば 403 になるだけなので）'],
    ['② 拠点・部屋', '/settings/sites', 'client/src/contexts/platform/pages/SitesPage.tsx', undefined,
      '拠点は**カレンダーと料金表の両方**で使われるので設定に置きました（migration 172）。' +
      '部屋の一覧はカレンダーの設定と**同じ部品**（`RoomsTab`）を使っています'],
    ['③ 権限とメンバー', '/settings/users', 'client/src/contexts/platform/pages/members/MembersPage.tsx',
      undefined,
      'モックの**役割5種**を、権限の**「型」**として入れました（役割は自分たちで足せます）。' +
      '役割を押すとその人の `user_permissions` がまとめて書き換わる形で、' +
      '**311 か所ある権限の判定は 1 か所も触っていません**（判定を役割ベースに置き換えると、' +
      '取りこぼした 1 か所が「開けない」か「見えてはいけないものが見える」になります）。' +
      '**凍結4アプリの権限は役割の担当範囲の外**にしてあり、役割を押しても消えません' +
      '（放送で使うため。守りを外して実際に消えることを確かめてあります）。' +
      '表の行がモックの 8 項目でなく 12 区画なのは、モックの 8 のうち 4 つ' +
      '（案件・見積・工程・料金表）が実装では**同じ `sales`** で、' +
      '8 行に分けると押した覚えのないものが変わるためです'],
    ['④ 取引先・仕入先', '/budget/vendors', 'client/src/contexts/finance/pages/CounterpartyPage.tsx', undefined,
      '財務の ⑧ で作り直した画面をそのまま使います（**同じ相手を2か所から直せるようにしない**）'],
    ['⑤ お金のルール', '/settings/money', 'client/src/contexts/platform/pages/money/MoneyRulesPage.tsx',
      undefined,
      '**会社ぜんぶで1本 ＋ 取引先ごとに例外**（モックの指定）。14 項目を並べるだけでなく、' +
      '**3つは実際の計算に効かせました**: ①支払期日を締め日＋サイトから逆算（取引先の例外が優先）' +
      '②消費税の端数（見積・請求・精算PDFの取込がすべて同じ丸め方になる）' +
      '③値引きの上限（超えた見積は「承認待ち」になり、承認されるまで**送れない**）。' +
      '**端数の既定を四捨五入から切り捨てに変えました** — これから作る書類の税額が最大 1 円下がります' +
      '（すでに出した書類は 1 円も動きません）。**請求書の自動下書きは作りません**（ご判断）。' +
      '期日の計算はサーバーだけが持ち、画面は「試すと何日になるか」を訊きます' +
      '（この製品は server が shared を import しない構成なので、画面に写しを置くと必ず食い違う）'],
    ['⑥ 休日・営業時間', '/settings/hours', 'client/src/contexts/platform/pages/hours/HoursPage.tsx',
      undefined,
      '拠点ごとの曜日7行と休業日。着手前は**時間の検査が1行も無く、何時でも予約が作れました**。' +
      'ここで初めて制限が入るので、**一番ゆるい段から始めます**（ご判断）— ' +
      '**注意を出して通し、時間外の印を残して**あとから一覧で拾えるようにしました。' +
      '**既存の予約は1行も書き換えていません**（モックの指定）。休業日を足すときは' +
      '**保存する前に「重なる予約が N 件あります」**を出します（消さないので、気づけないと困る）。' +
      '**割増（＋30％・＋50％）の列は作りません** — 何に掛けるかが決まっておらず、' +
      '入れると正しい数字だと読まれるため（ご判断）。' +
      '**祝日は 2026〜2030 の 89 件を計算して入れました**（`holidays.ts`。振替休日・国民の休日・' +
      '春分秋分の近似式を 18 項目のテストで固定）。**初期値は「営業する」**なので、' +
      '当てても予約の見え方は 1 つも変わりません — 放送・制作は祝日こそ稼働するため、' +
      'いきなり注意を出すと全部の祝日がうるさくなります。' +
      '春分・秋分には**「予測」の印**を出します（政府が前年 2 月に公示するまで確定しない）'],
    ['⑦ 通知とテンプレート', '/settings/notify', 'client/src/contexts/platform/pages/notify/NotifyPage.tsx',
      undefined,
      'モックの 11 本＋社内向け 2 本。**社外あて 6 本は ONAiR からは送りません**（ご判断）— ' +
      '差し込みが1つずれる・きっかけが誤爆する・宛先が古い、のどれも**お客様に届くと取り返しがつかない**ため。' +
      '文面を貯めて**件名と本文を別々にコピーできる**ところまでにしました。' +
      '「まだ作っていない」ではなく「**作らないと決めた**」ことを画面に書いています。' +
      '社内あては**上辺バーのベル**に出ます（`shared/src/client-v4/NotificationBell`。' +
      '`src/client/` に置くと凍結アプリの CSS が増えるので `client-v4/` 側）。' +
      '**定時実行**は 15 分ごとに起きて、その日まだ流していない仕事を流します。' +
      '社外の時刻型 2 本（利用前日のご案内・請求書の送付）は送らず、' +
      '「**送る時期が来ました**」を社内のベルに出します。' +
      '**二重に出さないことを 2 段で守っています** — その日その仕事を流したかの記録と、' +
      '「同じ人・同じ対象・同じ日は 1 行だけ」の一意索引（デプロイのたびに再起動しても増えない。' +
      '索引を外すと実際に倍になることを確かめてあります）。' +
      '「送った数」は**実際に出した社内通知の実数**で、モックのサンプル値は出しません'],
    ['システムの情報 (版・バックアップ・パスワード)', '/settings/system',
      'client/src/contexts/platform/pages/SystemInfoPage.tsx', undefined,
      '旧 `/settings` の中身。**権限を掛けていません** — 旧画面は `admin` 必須だったので' +
      '**パスワードを変えたい人が管理者しか来られませんでした**'],
    ['データビューア', '/settings/data-viewer', 'client/src/contexts/platform/pages/DataViewerPage.tsx',
      '@@意図して据え置き@@', 'DB を直接見る道具。モックに無く、毎日使うものでもないので畳んであります'],
    ['DBバックアップ', '/settings/db-backups', 'client/src/contexts/platform/pages/DbBackupsPage.tsx',
      '@@意図して据え置き@@'],
  ]],
  ['共通', [
    ['トップページ', '/', 'client/src/contexts/platform/pages/HomePage.tsx',
      './home/AppTiles',
      'v4 は**上＝アプリの入口 ／ 下＝自分の今日**に絞りました。旧トップにあった KPI・営業ダッシュボード・' +
      'AI活動フィード・直近の案件は、**各アプリのダッシュボードと同じ中身を二重に見ていた**ので外し、' +
      'それぞれの画面へ送っています（理由と行き先は `HomePage.tsx` の冒頭）'],
    ['探す（スマホの下タブ 3つ目）', '/search', 'client/src/contexts/platform/pages/SearchPage.tsx',
      undefined,
      'v4 の決めごとは下タブ **ホーム / やること / 検索** だが、**スマホには検索が1つも無かった**' +
      '（上辺バーの検索は `hidden sm:block`）ので3つ目は「メニュー」で代用していた。' +
      'メニューは上辺バーの ☰ からも開けるので、1枠が二重の入口になっていた'],
    // シェルは画面ではないので `<PageHeader>` を持たない。**3アプリが共通シェルを
    // 読んでいるか**で判定する (S2 / S3 で載せ替え済み)
    ['共通シェル (上辺バー64px・左メニュー248px・スマホ下タブ)', '—',
      'client/src/components/layout/AppShell.tsx', 'shared/src/client/shell'],
    ['左メニューの項目・並び・ラベル', '—',
      'client/src/components/layout/nav.ts', undefined,
      '**4つの入口すべて v4 の情報設計に差し替え済み**（案件管理・財務管理・カレンダー・設定）。' +
      '作り直していない画面は消さず「そのほか（作り直し前）」に畳んであります。' +
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
    // v4 大④: 12本の横並び → 左に一覧・右に1本＋実装一覧の表。
    // このページは `PageHeader` を使わない（独自の見出し）ので、v4 で足した部品で判定する
    ['ラック図', '/equipment/racks', 'client-equipment/src/pages/RackLayoutPage.tsx', 'rack/RackUnitTable',
      '**印刷は今までどおり絞り込んだラックを全部出します**（画面で1本ずつ見るのと紙に全部並べるのは別の用途）。' +
      '印刷の寸法（`rack/printConstants.ts`）は実機で合わせた値なので触っていません。' +
      '**A4 の PDF を実際に出して1ページ目で切れないことを確認済み**（画面の中身が印刷で場所を取り、' +
      '白紙が1枚増えていたのもここで見つけて直しました）'],
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
    ['② プロジェクト一覧', '/gpm/projects', 'client/src/contexts/gpm/pages/GpmProjectListPage.tsx',
      null,
      '**「見積」の列はいま出ている金額**（束ごとに最新版・値引きを引いた税抜）。' +
      '案件一覧の「見積金額」と**同じ式**（サーバーの `ESTIMATE_AMOUNT_LATERAL`）を読んでいます — ' +
      '写すと、同じ見積が画面によって違う金額に見えます。見積が1本も無い行は「見積なし」（0円ではない）'],
    ['③ プロジェクト詳細', '/gpm/projects/:id', 'client/src/contexts/gpm/pages/GpmProjectDetailPage.tsx',
      null,
      '**工程の名前を押すとその工程のタスクが出ます**（`projectDetail/OverviewTab.tsx`）。' +
      '足す・直す・消す・完了にするがこの画面でできます。件数（`3 / 7`）だけだった頃は' +
      '**何が残っているのかがここから分からず**、⑤ 全プロジェクトのタスクで絞り込み直していました。' +
      '**工程に付いていないタスクも下の束に出します** — 工程を消してもタスクは消えない' +
      '（サーバーは `gpm_phase_id` を NULL にするだけ）ので、出さないと外れたタスクが迷子になります。' +
      '工程は足す・並べ替える（隣と入れ替え）・消すができます'],
    ['④ 新規作成', '/gpm/projects/new', 'client/src/contexts/gpm/pages/GpmProjectFormPage.tsx'],
    ['⑤ やること（未確認事項）', '/gpm/tasks', 'client/src/contexts/gpm/pages/GpmTaskListPage.tsx'],
    ['⑦ 標準工程テンプレート', '/gpm/templates', 'client/src/contexts/gpm/pages/GpmTemplateListPage.tsx'],
    // 打合せの録音 → 文字起こし → AI の下書き。**案件と同じ表・同じサービス**
    ['議事録（プロジェクト詳細のタブ）', '/gpm/projects/:id/minutes',
      'client/src/contexts/gpm/pages/projectDetail/MinutesTab.tsx', 'ASK_TRACK',
      '`project_minutes` は `projects` にぶら下がる表で、プロジェクトは GLS-B の案件なので、' +
      '**表・サービス・Whisper の投げ方・整形のプロンプト・差分の記録を1つも作り直していません**' +
      '（写すと、同じ打合せが画面によって違う整形になります）。分けたのは口だけ — ' +
      '案件側のルートは `sales` を要求するので、`gpm` だけの人は開けませんでした。' +
      '**持ち帰りの行き先だけが違います**: 案件はタスク、プロジェクトは**未確認事項**' +
      '（工事の持ち帰りはほとんどが先方の判断待ちで、タスクにすると「自分がやること」に' +
      '相手待ちが混ざり、止まっている件数を数えられない）。' +
      '**同じ持ち帰りから二度は作れません**（`open_items[].ask_id` をサーバーが書き戻す）'],
    ['書類（BOX・プロジェクト詳細のタブ）', '/gpm/projects/:id/files',
      'client/src/contexts/gpm/pages/projectDetail/FilesTab.tsx', 'FolderCard',
      '**中のファイルを1階層ぶん出し、置けます**（案件詳細と同じ部品・同じ決めごと）。' +
      '社内限りと社外共有は別のカードで、置き場所を選ばせません（取り違えると原価が外に出る）。' +
      '**見るほうは BOX が落ちても 200 で理由を出し**、置くほうは失敗を返します。' +
      'フォルダは**押したときだけ作ります**（BOX に作ったものは ONAiR から消せない）'],
    // v4 大⑤: 独立した画面ではなく**プロジェクト詳細のタブ**（migration 173）
    ['⑥ 見積（プロジェクト詳細のタブ）', '/gpm/projects/:id/estimates',
      'client/src/contexts/gpm/pages/projectDetail/EstimatesTab.tsx', 'ui/row',
      '提出先（自社／依頼元／PM会社）ごとに1本。`estimates` を案件と共用し、' +
      '行き先は `project_id` 1本（migration 179）。案件（GLS-A）の見積と混ざらないよう、' +
      'サーバーが `gls_category` で分けています（外すと案件管理のダッシュボードに足される）。' +
      '**明細（品目と金額）は案件の見積と同じ部品**（`EstimateItems`）。' +
      '合計と粗利の計算は1か所で、写しを作ると片方だけ直した日から金額が食い違います。' +
      '保存する口だけ GPM 側に向けていて、サーバーは**プロジェクトの見積しか受け付けません**' +
      '（`gpm` だけの人に案件の金額を書かせない）'],
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
  '> **書体は手元でも本物で測っています。** LINE Seed JP は Google Fonts から配信していますが、',
  '> 開発用のコンテナのブラウザは外に出られないので、`verify:ui` が `curl` で落とした',
  '> 取り置き（`npm run verify:font`）を差し込んで描いています（「書体が実際に描かれている」が',
  '> それを見ています）。**配信そのものが生きているかは検証環境でしか分かりません。**',
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
