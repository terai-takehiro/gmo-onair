# client — 案件管理・財務管理・カレンダー・設定（v4 対象）

ONAiR で一番大きいアプリ。**1つの Vite バンドルに5つの「入口」が入っている**。
ベースパス `/`・ポート 5173。

> **この文書は「いま効くルール」だけ。** 画面ごとの作り直しの経緯・当時の判断の理由・
> 実測・レビューで見つけた穴は
> [docs/reviews/client-v4-build-log.md](../docs/reviews/client-v4-build-log.md) に
> 全文そのまま移してある（2026-08-22）。「なぜこうなっているのか」を知りたいときはそちら。

## 入口とルート接頭辞

| 入口（利用者から見た名前） | ルート | 権限モジュール | contexts |
| --- | --- | --- | --- |
| 案件管理 | `/sales/*` | `sales` | `contexts/sales`, `contexts/tasks` |
| 財務管理 | `/budget/*` | `sales`（旧 `budget`） | `contexts/finance` |
| カレンダー | `/calendar/*`（**2026-08-22 に `/studio/*` から改名**・旧 URL は転送） | `sales`（旧 `studio` / `partner_schedule`） | `contexts/production` |
| 設定 | `/settings/*`（**v4 で `/admin/*` から改名**・旧 URL は転送） | `sales`（権限とメンバーの管理は `system_admin` だけ。旧 `admin` 区画は廃止） | `contexts/platform` |
| **プロジェクト管理（v4 で新規）** | `/gpm/*` | `sales`（旧 `gpm`） | `contexts/gpm`（新設） |

> ⚠️ 「権限モジュール」列は権限モデル単純化（`docs/reviews/permission-model-simplification-plan.md`）
> で `sales` に統合済み。5つの入口は URL・見た目としては今までどおり別々だが、
> 開けるかどうかの判定は1つの `sales` 区画にまとまっている。

- ルート定義は `src/App.tsx` の1ファイル。**旧URLからの転送表もここ**（`<Navigate>` / `RedirectKeepQuery` — 数は増え続けるので数えない。v4.2.0 時点で36本）
- **入口の URL（`/sales` など）はその入口のダッシュボードへ送る。** アプリ切替と
  トップページのタイルがここに来るので、案件一覧に送ってはいけない
- 左メニューの定義は `src/components/layout/nav.ts` の `CLIENT_NAV`（入口ごとの塊）
- ページは `contexts/<領域>/pages/` に置く。`contexts/shared/components/` は領域をまたぐ部品

## 案件のライフサイクル（旧「統合プロジェクトライフサイクル」）

- 旧 `opportunities` テーブルは廃止し、**単一 `projects` テーブル**に統合済み
- `stage`: `neta` → `d_hold` → `c_proposal` → `b_verbal` → `a_won` → `s_completed` / `e_lost`
- **GLS発番は `a_won`（受注済）に上げた瞬間に自動**（`changeStage`）。手動の
  `POST /projects/:id/issue-gls` は「口頭決定（`b_verbal`）のうちに先に番号が要る」
  ときのために残してあるだけで、**それより手前のステージからは呼べない**
  （v4.1.8・サーバー側でガード。以前は無条件に呼べ、問合せ段階でも番号を焼けた）
- **受注確定した案件の絞り込みは `stage`（`a_won`/`s_completed`）が正で、
  `gls_number` の有無ではない。** 受注は原則 GLS 番号が自動で付くが、案件分類
  （`gls_category`）が未設定の古いデータでは例外的に番号だけ付かないことがある
  （そのときは受注そのものは通し `gls_error` を返す）。**この2つを混同しない**:
  - 仕入・売上・精算PDF取込レビュー・予算詳細・書類引き渡しの案件プルダウンは
    `GET /projects/won-projects`（`stage IN ('a_won','s_completed')`）を使う。
    ここを `gls_number IS NOT NULL` で絞ると、受注済みなのに番号がまだ無いだけの
    案件に実務を記録できない詰みが起きる（v4.1.8 で修正済み）
  - 「GLS番号そのものへ紐づける」操作（回の追加・付け替え・費用を分け合う
    グループ）は `GET /projects/gls-projects`（`gls_number IS NOT NULL`）のまま
    でよい — 番号が無いと成立しない操作なので
- 案件分類は `gls_category`（`A`=スタジオ / `B`=ビジネス）。発番後の A↔B 切替は
  `PATCH /projects/:id/gls-category`（採番し直し＋エピソードコード＋BOX フォルダを追随）
- 費用按分は `project_groups` テーブル

## v4 で作り直した画面（済み）

置き場所の対応表。**それぞれで決めたこと・経緯は
[docs/reviews/client-v4-build-log.md](../docs/reviews/client-v4-build-log.md)。**

| 画面 | 置き場所 |
| --- | --- |
| トップページ（共通） | `contexts/platform/pages/HomePage.tsx` ＋ `pages/home/` |
| 投入口（AIに任せる） | `contexts/tasks/components/intake/` |
| ① ダッシュボード | `contexts/platform/pages/DashboardPage.tsx` ＋ `pages/salesDashboard/` |
| ② 案件作成（**受付を統合**） | `contexts/sales/pages/projectNew/` |
| ③ 案件一覧 | `contexts/sales/pages/ProjectListPage.tsx` ＋ `pages/projectList/` |
| ④ タスク一覧 | `contexts/tasks/pages/TaskDashboardPage.tsx` ＋ `pages/taskList/` |
| ⑤ 見積・請求（全案件） | `contexts/sales/pages/BillingListPage.tsx` ＋ `pages/billing/` |
| ⑥ 案件詳細（7タブ） | `contexts/sales/pages/ProjectDetailPage.tsx` ＋ `pages/projectDetail/` |
| 案件を直す（新規・編集） | `contexts/sales/pages/ProjectFormPage.tsx`（欄は `projectNew/` の部品を共用） |
| 案件台帳（旧GLSを吸収） | `contexts/sales/pages/ProjectLedgerPage.tsx` ＋ `pages/projectLedger/` |
| ⑦ 標準工程テンプレート | `contexts/sales/pages/flow/` |
| ⑧ 料金表 | `contexts/sales/pages/PricingListPage.tsx` ＋ `pages/pricing/` |
| 営業活動記録（記録＋分析4タブ） | `contexts/sales/pages/ActivityLogPage.tsx` ＋ `pages/activityLog/`（分析は `pages/salesReview/`） |
| 費用を分け合うグループ | `contexts/sales/pages/ProjectGroup{List,Detail}Page.tsx` ＋ `pages/projectGroup/` |
| カレンダー ①〜④ | `contexts/production/pages/{UnifiedCalendarPage,RoomAvailabilityPage,HoldListPage,CalendarSettingsPage}.tsx` ＋ `pages/{calendar,holds,rooms,calendarSettings}/` |
| 設定 ①② ＋ システムの情報 | `contexts/platform/pages/{SettingsHubPage,SitesPage,SystemInfoPage}.tsx` ＋ `pages/settings/` |
| 設定 ⑤⑥⑦（お金・休日・通知） | `contexts/platform/pages/{money,hours,notify}/` |
| 権限とメンバー | `contexts/platform/pages/members/` |
| 探す（スマホ下タブ） | `contexts/platform/pages/SearchPage.tsx` ＋ `pages/search/` |
| 財務 ① ダッシュボード | `contexts/finance/pages/BudgetDashboardPage.tsx` ＋ `pages/financeDashboard/` |
| 財務 ② 請求・入金（締め） | `contexts/finance/pages/ClosingPage.tsx` ＋ `pages/closing/` |
| 財務 ③④⑤ 売上・仕入・販管費 | `contexts/finance/pages/{Revenue,Purchase,Sga}ListPage.tsx` ＋ `pages/ledger/` |
| 財務 ⑥ 受領書類（**ひとつづり表示**） | `contexts/finance/pages/DocumentsPage.tsx` ＋ `pages/documents/`（`GroupCard` / `GroupEditDialog`） |
| 財務 ⑦ 取り込み | `contexts/finance/pages/ImportPage.tsx` ＋ `pages/import/` |
| 財務 ⑧ 取引先（仕入先・パートナー） | `contexts/finance/pages/CounterpartyPage.tsx` ＋ `pages/counterparty/` |
| プロジェクト管理（GPM）一式 | `contexts/gpm/` |

削除した画面（報告資料・AI活動履歴・旧GLS決算取込・営業レビュー単独ページ等）と
その判断の根拠も経緯ログにある。**旧 URL は原則転送で生かす**（削除時の例外も経緯ログ参照）。

## 事業主体（2026-09-06・migration 282）

- **案件は事業主体（`projects.entity`）を1つ持つ**: グループ内のお客様 → `gss`（GMOサムライスタジオ）／
  外部 → `gscs`（GMOサムライコンテンツスタジオ）。**お客様の区分から保存のたびに自動で決まる**
  （`customer_type` と同じ導出。正は `server/src/contexts/sales/services/project-entity.ts`、
  shared 側の写しは `shared/src/keepReport/entity.ts`）。`gig`（GMOインターネットグループ人格）は
  人が案件で選んだときだけ（`entity_manual = TRUE`。「自動」に戻すには `entity: null` を送る）
- **画面は「変えたときだけ `entity` を送る**」。値を送ると手で固定した印が付く
- 隔週キープの目標（主体別の月次予算・経理の補正値）と稼働率の数え方は **設定「お金のルール」**
  （`contexts/platform/pages/money/{MonthlyBudgets,MonthlyBudgetEditor,UtilizationRule}.tsx`・
  `lib/keepApi.ts`）。全体の目標は主体の合計で、入力しない
- ふりかえりタブの「隔週キープに載せる」（`projects.keep_pick`）は日常業務のヨミ表のチェックと同じ値

## v4 の設計判断（モックが明示しているもの）

- **案件は主担当（`assigned_to`）を1人持つ**（実装の実態に合わせて 2026-08-27 に書き直し。
  旧文言「案件担当者という概念を持たない」は方針と実装が食い違っていた——`projects.assigned_to`
  は NOT NULL の外部キーで、案件作成画面でも必須、案件台帳の既定列、GPM・ダッシュボード・
  週報・スケジューラー・MCP `create_project` も必須項目として扱う実装だった）。
  主担当は**責任の所在・通知の宛先・集計の軸**であり、実務の作業者を限定するものではない
  — **「誰が何をするか」の実務の割り当てはタスク単位**で表す（主担当と実務の担当者は
  一致しないことが普通にある）。案件詳細の概要タブは主担当を表示しない
  （お客様側の窓口＝`contact_name` だけを出す）が、これは「持たない」のではなく
  「この画面では出さない」という表示上の判断（詳細は
  [docs/project-ledger-simplification-plan.md](../docs/project-ledger-simplification-plan.md)
  §5 の `assigned_to`）
- 見積は明細をスタジオ／技術・人員／制作・その他の3グループで表示。行ごとに仕入（見込み）を持ち、
  **粗利率が30%を切ると赤くなるが保存は止めない**。値引きは単価を下げず別建て
- 値引き上限の超過は**保存を止めず「承認待ち」**にする（送付だけ止まる）
- **金額の同時編集は 409 で止める**（他の項目は同時編集可）

仕様は `docs/design/v4/` に画面ごとに切り出してある（モック HTML を直接 grep しない）。

## 現役の落とし穴（経緯から抽出した現行ルール）

経緯ログの中に埋まっていた「いまも効く」決めごと。詳しい理由は経緯ログの各節。

### URL・ルーティング

- **タブは URL で持つ。** 案件詳細は区間（`/sales/projects/:id/:tab`・
  `projectDetail/tabs.ts`）、取引先・取り込み・営業活動記録はクエリ（`?tab=` / `?src=`）。
  ローカル state にすると転送で「開いたら○○タブ」ができない。区間持ちの画面で
  `to="?tab=…"` と書いても**画面は変わらない**（実際に壊れていた）
- **詳細タブの URL 鍵は単数**（`task`）。`tasks` にすると既存の
  `/sales/projects/:projectId/tasks` と衝突して枠ごと消える（React Router は静的区切り優先）
- **行き先の無いリンクは 404 にならない。** `App.tsx` 最後の `<Route path="*">` が拾って
  黙ってホームに戻るので「押しても遷移しない」としか見えない。`scripts/check-links.mjs`
  （`npm run lint` 内）がルート表と `to=`/`href=`/`navigate()` を突き合わせる。
  わざと置く行き先は `ALLOW` に**理由付きで**足す
- **旧 URL の転送はクエリを引き継ぐ**（`App.tsx` の `RedirectKeepQuery`）。落とすと
  `?inquiry=` が消えて書き戻せず、**同じ引き合いから案件が2件**できる
- **別バンドル（`/daily/` など）へは素の遷移**（`window.location`）。ルーターでは飛べない

### react-query の鍵（invalidate の対）

同じデータを別の鍵で持つ画面があり、**片方だけ落とすと「直したのに古いまま」になる**。
どれも実際に踏んだ:

- タスク: `invalidateTasks` は案件内の鍵に加えて **`task-dashboard`（全案件一覧）も落とす**
- 標準工程を案件に入れたら **4つ**: `task-columns` / `project-tasks` / `task-dashboard` / `project`
- GPM: `useInvalidateGpm`（`['gpm','tasks']` と `['gpm-project-tasks']` を含む）
- 拠点の略称を保存したら `project-studio-bookings` も落とす（案件詳細の会場が読む）

### データの正・導出（2か所に持たない）

- **タスクの完了は `is_completed` が正**・`work_state` は未完了時の止まり方。画面は必ず
  `taskState()`（`contexts/tasks/pages/taskList/state.ts`）を通す
- **案件分類の `project_type` は画面から送らない。** 2段（客入れ×配信/収録/イベント）だけ
  送り、サーバー1か所（`server/.../project-classification.ts`）が導く。GLS-B は 2段とも NULL
- **グループ会社の判定の正は取引先マスター**（`companies.is_gmo_group`）。案件の
  `customer_type` は人が選ばず、保存のたびにお客様から導く（`project.service` の
  `resolveCustomerType`）。列は残す — 「当時の姿」で数えるため
- **見積は `estimates` 別テーブル。`revenues` に相乗りさせない**（`revenues` を読む多数の
  箇所が `status` を見ておらず、混ぜると売上に足される）。版は `group_id` で束ね、
  `sent`/`superseded` は直せない（次の版を作る）。**合計はサーバーが出す**
- **`estimates` は GLS-A・GLS-B(GPM) とも `project_id` 1本だけを使う**（旧 `gpm_project_id`
  列と `project_id`/`gpm_project_id` の CHECK 排他は migration 179「プロジェクト管理を
  GLS-B に一本化」で廃止済み。GPM 案件も `projects.gls_category='B'` の行になった）。
  GLS-A の見積は `customer_id` を持ち、GPM の見積は代わりに `submit_to`（`self`/`client`/`pm`）を
  持つ——見分けは `gls_category` と、版を作るときは行き先（`project_id`）と提出先
  （`customer_id`/`submit_to`）を写す。請求の一覧は `status='confirmed'` かつ
  `group_id IS NULL`（按分の親行を二重に数えない）
- **受領書類は「1通」ではなく「1つの取引」が単位**（migration 281）。段（見積書のみ/発注済み/
  請求書あり）・払う金額・台帳へ渡せるかは `shared/src/utils/financeDocChain.ts` が決める。
  **サーバーにも同じ計算がある**（`server/src/shared/services/finance-chain.ts`。サーバーは
  `shared` を import できない）ので、**片方だけ直すと画面が出す支払期日と台帳に入る期日が
  別の日になる** — `shared/tests/financeDocChainParity.test.ts` が両方を突き合わせている
- **受領書類の当て先（どの案件か）は人が決める。** AI は `project_hint` を渡すだけで、
  サーバーが探して確からしさを付ける（**候補が複数なら付けない**）。人が直したら
  `project_source='human'` に変える — 変えないと、直した行が「AI が当てた」まま残り
  無修正採用率が実際より良く見える
- **万円へ丸めるのは `toMan` 1本**（`shared/src/client/ui/numbers.tsx`）。単位は数字と別に描く
- **同じ数字を2か所で数えない。** トップのタイル件数・ダッシュボードの帯は既存 API の
  数字を使い回す（数え直すと必ず食い違う）
- **「NULL＝決めていない」と 0 を混ぜない。** 値引き上限・料金の単価・来場人数などで
  区別が要る（0 を既定値に入れると「0と決めた」と見分けられない）

### サーバーの部分更新の原則

- **「渡さなければ今の値を保つ」。** `customer_type`・リード経路・`is_gmo_group`・拠点の
  略称などで実際に踏んだ壊れ方: 欄を持たない画面・MCP から保存されるだけで値が黙って
  消える/戻る。**知らない値は 400 にせず NULL に落とす**（古い呼び出しを止めない）
- **消す操作だけは明示の空値で受ける**（空文字→NULL、期限は鍵があれば `null` でも書く）

### SQL（型検査も lint も SQL の中身を見ない）

- **jsonb の存在演算子（疑問符）を書かない。** DB 層がプレースホルダと数えて落ちる。
  `->>` で書く（`shared/tests/sqlPlaceholder.test.ts` が再発を止める）
- **列を DROP したらサーバーの SQL 文字列を全部追う**（`shared/tests/droppedColumns.test.ts`
  が検査。`projects.notes` の DROP で GPM 全画面と投入口が 500 になった実績）
- **列名・型は実 DB で確かめてから書く**（`project_tasks.status` は存在しない・
  `due_date` だけ `date` 型、などで実際に踏んだ）
- `GROUP BY` に選択列を全部入れる（`u.name` 漏れで営業評価タブが必ず 500 だった）

### 二重登録・押し直しへの守り

- **「二度は作れない」はサーバーで守る**（画面のボタンを隠すだけだと、同時に開いた別の
  画面が古いままボタンを出す）。実例: 標準工程は `projects.flow_applied_at`・
  書類の台帳渡しは 409 `ALREADY_LINKED`・議事録の持ち帰り→タスク/未確認事項は
  **取引の中で `FOR UPDATE` してから `task_id`/`ask_id` を書き戻す**（外で確認すると
  同時押しで2件でき、参照の無い行が消せなくなる — 実測済み）
- **投入口の押し直しは `idempotency_key` を DB が拒否する**（`intake:<投入id>:<draft_key>`）
- **定時実行（`scheduler.service.ts`）は2段で守る**: `scheduled_job_runs(job_key, run_date)`
  の主キー＋`notifications` の一意索引。片方だけだと記録前に落ちた回・複数プロセスで二重になる

### 外部サービス（BOX）

- **読む口は BOX が落ちていても 200 ＋ `reason`**（`NO_FOLDER`/`NOT_CONFIGURED`/
  `UNAVAILABLE`）。500 にすると BOX 障害の日に案件詳細が全部開けなくなる。
  **置く（書く）口は失敗を理由付きで返す** — 上がっていないのに上がったように見えるのが一番困る
- 同じ名前は新しい版として上げる（409 → `uploadFileVersion`）。複数は1つずつ上げ、
  上がった分だけ返す。multer はファイル名を latin1 で読むので
  `Buffer.from(name, 'latin1').toString('utf8')` に通す（化けたまま BOX に載ると探せない）
- サーバー側の実体は `project-box-files.service` 1本（案件と GPM が共用）

### トップページ・アプリタイル

- **`DAILY_KEYS`（`pages/HomePage.tsx`）と `EVENT_KEYS`（`pages/home/AppTiles.tsx`）は対。**
  片方だけ直すとタイルが二重に出るかどこにも出なくなる（v4.2.1 で実際に起きた）
- **スクロール演出の既定は「見える」。** 隠すのは JS が `data-reveal="hidden"` を付けた
  ときだけ — CSS で先に隠すと JS が落ちた日にトップページが白紙になる
- `/dashboard/app-badges` は `sales` の権限ゲートの**外**（トップは全員が最初に開く画面）

### 権限

- **ボタンは権限で出し分ける。** サーバー側だけで止めると「押せるのに 403」になる
  （削除は `manager`、目標設定は `editor` など、実際に多数踏んだ）
- 経理と営業の両方が使う口は `requireAnyPermission`（`sales` か `budget` のどちらかで通す）
- ⌘K・左メニューで `module` 未指定の項目は**入口の権限を要求する**側に倒れる
  （`layout/searchFeatures.ts`。開けてある入口は設定だけ＝`OPEN_ENTRANCES`）
- **祝日の口（`GET /business-hours/holidays`）だけは権限を掛けていない**（公開情報。
  掛けるとカレンダーの日付が権限によって黒いままになる）。**サイネージの URL は
  ログインなしで開ける**ので、トークンの作り直しは `system_admin` だけ（配った URL が全部無効になる）

### AI・録音（このアプリで AI を触るときは会社方針の5条件も必須）

- **録音は 32kbps**（既定の 128kbps だと 25 分で Whisper の 25MB 上限に当たる）
- **文字起こし・整形はリクエストの中で待たない**（nginx の `/api/` は既定 60 秒で切れる）。
  行を先に作って 202 を返し、画面がポーリングする。ジョブの表は作らない（行に状態を持つ）
- **AI に HTML を書かせるのはやり取りの整形だけ**（`html-sanitize.ts`・許可タグ9・属性0）。
  メール取込は「意味の単位」で受けて `RichContent`（`shared/src/client-v4/richContent.tsx`）が描く
- **差分の before は `ai_outputs.payload_snapshot`**（AI が出したもの）。直前の行と比べると
  書きかけ保存後の修正が全部「無修正」に数えられる
- 解析の主経路が落ちたら規則ベースに縮退し、**縮退したことを画面に書く**（黙って倒さない）

### 置き場所・部品

- **v4 専用の共通部品は `shared/src/client-v4/` に置く。** `shared/src/client/` に置くと
  凍結アプリの CSS が増える。新しい共通部品を `client/src/components/ui/` に実装しない
  （他アプリから使えない — `shared` へ）
- **欄・送信ロジックは写さず共用する。** 案件作成と案件を直すは `projectNew/` の同じ部品
  （`RequiredFields`/`MoreFields`・`mode: 'create' | 'edit'`）、PC とスマホの送信は同じ hook
  （`useCreateProject` 等）。写すと片方だけ直った画面が必ずできる
- 引き合いの種類の見せ方は `pages/inbox/kinds.ts` 1本（案件作成のレールとホームの
  「お待たせ中」の2か所が使う。書き写すと同じ引き合いが画面によって違う名前で出る）

### スマホ

- **幅の分岐は「薄い親」で行う。** 部品の中で `if (mobile) return …` と書くと幅が変わった
  瞬間にフックの数が変わって React が落ちる。判定は `useIsMobile()` 1本
  （`shared/src/client-v4/mobile.ts`・`lg`=1023px）
- **案件詳細のスマホタブは段階で入れ替える**（`projectDetail/tabs.ts` の
  `MOBILE_TABS_BY_PHASE`）。開けないタブを黙って概要にすり替えない（URL を共有された人が
  「見積を見せたのに概要が出た」ことになる）

## 触るときの注意

- **シェルは共通** (`shared/src/client/shell/`)。残っているのは
  `components/layout/AppShell.tsx`・`nav.ts`（4つの入口ぶんのメニュー）・
  `GlobalSearch.tsx`（上辺バーに差し込む検索）だけ。**旧 `Header.tsx` / `Sidebar.tsx` は削除済み**。
  どの入口にいるかは `appOfPath()` が URL から判定する（`BLOCK_APPS` の前方一致は廃止）

- **スマホの絞り込みは1行に畳んでシートで開く**（M6 → M8 で共通部品
  `shared/src/client-v4/mobileFilterBar.tsx` に移した。`projectList/MobileFilterBar.tsx` は
  **この画面固有の2つ**＝「何を既定と見なすか」（`activeFilterCount`）と
  シートの中身だけを持つ）。
  PC の帯をそのまま縦に積むと約 450px になり、**最初の案件に着くまで 470px**
  ＝ 1画面の7割が枠でした（実測）。畳んだあとは **284px**。
  - **props は PC 版と同じ**（`FilterBarProps` を共有）。写しを作ると片方だけ
    絞り込みが増えて、PC とスマホで違う結果が出る
  - **効いている数をボタンに出す。** 畳むと絞り込んでいること自体を忘れる
    （「12件しかないのはなぜ？」）。0 のときは出さない
  - **検索だけは畳まない。** 探すのは絞り込みではなく目的そのもの
- **`hidden: true` を付けた画面はスマホの左メニューと設定トップから消える**（M6・ご判断）。
  データを入れる道具（決算の取込・DB バックアップ・データビューア）と、
  案件の仕事に出てこない設定です。**ルートは消していない**ので、
  共有された URL を開けば今までどおり案内が出ます。
  - 落とす一覧は**左メニューと設定トップで同じ表**（`CLIENT_MOBILE_HIDDEN`）。
    2つに分けると片方だけ直したときに食い違う
  - 実測: 財務の左メニュー 8 → 7 項目（「取り込み」の節ごと消える）、
    設定トップ 10 → 7 枚
- **「外で判断するもの」は PC 専用から外した**（M10・ご判断）。実データを入れた検証環境で
  44 画面を 390px から開き直して測ったところ、**横にはみ出す画面は3枚だけ**で、
  多くはスマホでも普通に開けました（`/sales/customers` は表ですらなくカードだった）。
  基準は「**読む／1タップで進める**ものは開ける・**入力欄が並ぶもの・設定・
  データを入れる道具は PC のまま**」。第1波で開けたのは **v4 で作り直し済みの5枚**:
  `/studio/holds`（`production/pages/holds/HoldCards.tsx` でスマホ用に縦積み。
  PC の行だと「決める」160px に押されて予定名が 150px しか残らず、
  **何の予約か分からないまま「確定にする」を押させる**形だった → 283px）／
  `/budget/vendors`（Excel と「仕入先集計」をスマホから落とす。
  **後者は行き先が PC 専用で、押すと行き止まりになる**）／
  `/gpm/dashboard` `/gpm/projects` `/gpm/tasks`（そのままで崩れない）。
  - **旧のまま（v4 で作り直していない）4枚は据え置き**: 顧客・取引先マスター・
    お客様の詳細・営業活動記録。**理由文は書き直した** —
    元は「この幅では1社ぶんも並びません」だったが実測で嘘だと分かったため
    （本当の理由は「まだ作り直していないので指で押しにくい」）
- **画面を足したら `src/pcOnlyScreens.ts` のどちらかの表に入れること**（M2）。
  `CLIENT_PC_ONLY`（スマホでは開かない）か `CLIENT_MOBILE_OK`（スマホで触る／読む）で、
  **どちらにも入っていないと `npm run lint` が止まります**。
  - スマホでは `AppShell` の `<PcOnlyGate>` が表を見て**案内に差し替えます**
    （`shared/src/client-v4/pcOnly.tsx`）。画面ごとに `useIsMobile()` を書かないこと —
    書き忘れても「出ないだけ」なので誰も報告せず、**数えられなくなります**
  - **並び順が効く**（先に一致したものが勝つ）。`/gpm/projects/new` は
    `/gpm/projects/:id` より前に置く
  - **`/budget/billing` は PC 側に入れない** — ⑫ 入金の確認がスマホ用にある。
    モックの「お金は置かない」が指すのは**台帳の表**で、**片づく1つの仕事**は置く
  - 案件詳細のタブだけは画面の中で判定する（`MOBILE_TAB_KEYS`）。
    URL は同じで中身が変わるので表では書き分けられないため。
    案内は同じ `PcOnlyPanel` を使う

- **1ファイル400行を上限にする。** `BusinessProjectView.tsx`（GPM の請求・見積タブが
  呼ぶ旧実装）は **2,030行 → 200行** に分けた（中身は `episodes/businessProject/`。
  hook 4本・部品6枚。**JSX を1文字も変えずに移し、各段で実ブラウザの全文が
  一致することを確かめている**）。わずかに超える `ProjectFormPage.tsx`（416行）・
  `DashboardGantt/DashboardGanttView.tsx`（522行・旧実装のまま）は v4 で作り直すときに分割する
- `src/components/ui/` は **`motion` / `animated-number` の2本以外すべて1行の再エクスポート**。
  実体は `shared/src/client/ui/`（F3 で `table` / `searchable-select` / `currency-input` /
  `scroll-area` を移した。`dropdown-menu` は参照0件だったので削除）。
  **新しい共通部品は `shared` に置くこと** — ここに実装を足すと他アプリから使えない
- **`motion` / `animated-number` だけ残してある**。`framer-motion` が案件管理にしか入っておらず、
  v4 は hover を色・罫線だけに絞り画面遷移も CSS で行う（`docs/design/v4/_tokens.md`）ため。
  **v4 の画面を作るときは使わない**（Phase 2 で整理する）
- `src/index.css` にアプリ固有 CSS が約200行（FullCalendar の上書き・サイネージ）。
  サイネージの色はトークン外の直書き
