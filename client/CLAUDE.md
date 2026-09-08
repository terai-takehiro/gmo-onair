# client — 案件管理・財務管理・カレンダー・設定・プロジェクト管理（v4 対象）

1つの Vite バンドルに5つの入口。ベースパス `/`・ポート 5173。**いま効くルールだけ**を書く。経緯・実測・判断の理由は [docs/reviews/client-v4-build-log.md](../docs/reviews/client-v4-build-log.md)。
パスは client `src/contexts/`・server `server/src/contexts/` からの相対、それ以外はルートから。

## 役割と入口

| 入口 | `AppKey`（`shared/src/client/apps.ts`） | ルート | client `contexts/` | server `contexts/` |
| --- | --- | --- | --- | --- |
| 案件管理 | `sales` | `/sales/*` | `sales`・`tasks` | `sales`・`tasks` |
| プロジェクト管理（GLS-B） | `gpm` | `/gpm/*` | `gpm` | `gpm` |
| 財務管理 | `budget` | `/budget/*` | `finance` | `finance` |
| カレンダー | `calendar` | `/calendar/*`（旧 `/studio/*` は転送） | `production` | `production`・`schedule`（外部カレンダー） |
| 設定 | `admin` | `/settings/*`（旧 `/admin/*` は転送） | `platform` | `platform` |

- **権限区画は `sales` 1つ**（5入口とも `permissionModule: 'sales'`・migration 210・[permission-model-simplification-plan.md](../docs/reviews/permission-model-simplification-plan.md)）。`PermissionRoute module="admin"`（人と権限・知らせと文面・データビューア・DBバックアップ）は区画が無いので**実質 `system_admin` だけ**（サーバーも `requireRole('system_admin')`）
- **ルートと旧 URL の転送表は `src/App.tsx` 1ファイル。** `/sales` `/budget` `/gpm` は**ダッシュボードへ送る**（アプリ切替・トップのタイルが来る）
- 左メニューは `src/components/layout/nav.ts`（`CLIENT_NAV`・`CLIENT_MOBILE_TABS`）。シェルは共通（`shared/src/client/shell/`）で、client 側は `src/components/layout/` の `AppShell.tsx`（`appOfPath()`・`PcOnlyGate`）・`PermissionRoute.tsx`（`module`/`anyOf`/`minLevel`）・`GlobalSearch.tsx`＋`SearchPalette.tsx`＋`searchFeatures.ts`（⌘K）だけ
- ページは `contexts/<領域>/pages/`、領域をまたぐ部品は `contexts/shared/components/`、画面内マニュアルは `src/manual/content.tsx`

## 画面一覧（URL → ファイル）

v4 化の状態は [docs/v4-progress.md](../docs/v4-progress.md)（生成物）。ファイル列は各領域の `pages/` から、`＋ x/` は部品置き場。ログイン不要は `/login`・`/auth/*`（`platform`）・`/signage/:roomId`（`production/SignagePage.tsx`）。

| URL | ファイル |
| --- | --- |
| `/`・`/search`（権限なし。`GET /search` が種類ごとに見る） | `platform/HomePage.tsx` ＋ `home/`・`SearchPage.tsx` ＋ `search/` |
| `/sales/dashboard` | `platform/DashboardPage.tsx` ＋ `salesDashboard/` |
| `/sales/projects`（`?view=board`） | `sales/ProjectListPage.tsx` ＋ `projectList/` |
| `/sales/projects/new`（受付を統合・`?inquiry=`） | `sales/projectNew/NewProjectDialog.tsx` ほか |
| `/sales/projects/ledger` | `sales/ProjectLedgerPage.tsx` ＋ `projectLedger/` |
| `/sales/projects/:id(/:tab)`（`projectDetail/tabs.ts`） | `sales/ProjectDetailRoute.tsx` → `ProjectDetailPage.tsx` ＋ `projectDetail/` |
| `/sales/projects/:id/edit` | `sales/ProjectFormRoute.tsx` → `ProjectFormPage.tsx` ＋ `projectForm/`（欄は `projectNew/` と共用） |
| `/sales/tasks/:view`（kanban/list/gantt） | `tasks/TaskDashboardPage.tsx` ＋ `taskList/`・`tasks/components/` |
| `/sales/billing`・`/sales/activity-logs`（`?tab=`） | `sales/BillingListPage.tsx` ＋ `billing/`・`ActivityLogPage.tsx` ＋ `activityLog/`・`salesReview/` |
| `/sales/project-groups(/:id)` | `sales/ProjectGroup{List,Detail}Page.tsx` ＋ `projectGroup/` |
| `/sales/companies`（`?role=`・顧客も）・`/sales/customers/:id` | `sales/CompanyListPage.tsx` ＋ `company/`・`CustomerDetailPage.tsx` ＋ `customerDetail/` |
| `/sales/pricing`・`/sales/flow-templates` | `sales/PricingListPage.tsx` ＋ `pricing/`・`flow/FlowTemplatePage.tsx` |
| `/sales/inbox/new`・`/sales/record`（スマホ） | `sales/InquiryQuickPage.tsx`・`MeetingRecordPage.tsx` |
| 投入口（AI） | `tasks/components/intake/` |
| `/gpm/{dashboard,projects,projects/new,tasks,templates,cost-dashboard}` | `gpm/Gpm{Dashboard,ProjectList,ProjectForm,TaskList,TemplateList}Page.tsx`・`CostDashboardPage.tsx` ＋ 同名の小文字ディレクトリ |
| `/gpm/projects/:id(/:tab)`（`projectDetail/tabs.ts`） | `gpm/GpmProjectDetailPage.tsx` ＋ `projectDetail/` |
| `/budget/dashboard`・`/budget/billing`（締め） | `finance/BudgetDashboardPage.tsx` ＋ `financeDashboard/`・`ClosingPage.tsx` ＋ `closing/`・`billing/` |
| `/budget/{revenues,purchases,sga}`・`/budget/documents` | `finance/{Revenue,Purchase,Sga}ListPage.tsx` ＋ `ledger/`・`DocumentsPage.tsx` ＋ `documents/` |
| `/budget/import`（`?src=pdf\|gl\|dedup`）・`/budget/vendors`（`?tab=partner`） | `finance/ImportPage.tsx` ＋ `import/`・`CounterpartyPage.tsx` ＋ `counterparty/` |
| `/budget/reports/vendors`（旧実装） | `production/VendorReportPage.tsx` |
| `/calendar`・`/calendar/{rooms,holds,duplicates,settings}` | `production/{UnifiedCalendar,RoomAvailability,HoldList,DuplicateList,CalendarSettings}Page.tsx` ＋ `calendar/`・`rooms/`・`holds/`・`duplicates/`・`calendarSettings/` |
| `/settings`（案内板・権限なし・カードは `settings/hubCards.ts`） | `platform/SettingsHubPage.tsx` ＋ `settings/` |
| `/settings/{sites,system,ai-activity,data-viewer,db-backups}` | `platform/{Sites,SystemInfo,AiActivity,DataViewer,DbBackups}Page.tsx`（`system` は権限なし・`ai-activity` の URL は通知の link と対） |
| `/settings/{users,money,hours,notify,reorg}` | `platform/{members,money,hours,notify,reorg}/` |

**旧 URL は原則転送で生かす**（`RedirectKeepQuery`／`RedirectAdminToSettings`／`RedirectToDetailTab`）。削除した画面と理由は `App.tsx` のコメントと経緯ログ。

## 案件のライフサイクル

- **`projects` 1テーブル**（旧 `opportunities` は廃止）。`stage`: `neta`→`d_hold`→`c_proposal`→`b_verbal`→`a_won`→`r_delivered`（実施済・財務処理中）→`s_completed`／`e_lost`（`server/src/shared/constants/statuses.ts`）。`r_delivered` は client の `ACTIVE_STAGES`／`TERMINAL_STAGES`（`projectList/stages.ts`）に入れず専用チップ
- **受注確定は `stage` が正**（`WON_STAGES`＝`a_won`/`r_delivered`/`s_completed`・`sales/services/project.service.ts`）、`gls_number` の有無ではない。案件プルダウン: `GET /projects/won-projects`（受注済み。予算・PDF取込・書類引き渡し）／`registerable-projects`（失注以外。売上・仕入の登録）／`gls-projects`（番号が無いと成立しない操作だけ）。落とす鍵は `sales/projectQueries.ts` の `invalidateProjectQueries` 1本
- **GLS 発番は `a_won` に上げた瞬間に自動**（`changeStage`）。手動 `POST /projects/:id/issue-gls`（editor）は `neta` 以外から通り、**ステージは上げない**。境界は server `GLS_BLOCKED_STAGES`（`project.service.ts`）と client `sales/glsIssue.ts` の2か所を同時に直す。`gls_category` 未設定なら受注は通し `gls_error` を返す
- **`gls_category`**: `A`＝スタジオ（案件管理）／`B`＝工事・構築（プロジェクト管理＝`gls_category='B'` の `projects` 行・migration 179・`gpm_kind` は B のみ）。発番後の A↔B は `PATCH /projects/:id/gls-category`（manager。採番し直し＋回コード＋BOX フォルダを追随）
- **案件分類は2段**（`audience`×`project_category`）だけ送り、`project_type` は `sales/services/project-classification.ts` が導く（GLS-B は NULL）
- **回**: レギュラー（`recurrence='regular'`）は受注時に第1回を自動作成し標準工程3列を当てる（`ensureFirstEpisode`）。単発 A への拡大は `org_transition.state !== 'off'` のときだけ。回コードは `{案件番号}-NNN`（`docs/design/v4/regular-series.md`）。「回」タブはレギュラーにだけ出る
- **主担当 `assigned_to` は1人（NOT NULL）**＝責任・通知・集計の軸。実務の割り当てはタスク単位。概要タブに出さないのは表示上の判断（[project-ledger-simplification-plan.md](../docs/project-ledger-simplification-plan.md) §5）
- 費用按分は `project_groups`。グループ請求は `revenues.group_id` の**1行**＋`revenue_allocations`（`group_id IS NULL` で絞ると締めから消える）
- 整合性チェック（`sales/services/project-integrity.ts` → 台帳 `IntegrityPanel`）は**数えるのも絞るのも同じ SQL**・`why`/`how` 必須・実施日／2段分類／リード経路は `gls_category='A'` だけ

## 計上会社（`entity_code`・2026年10月の事業再編）

正は [docs/reorg-2026-10-plan.md](../docs/reorg-2026-10-plan.md)。**P0〜P3 は実装済み**、P4（`done`・旧経路の削除・`entity_scope`・文書更新）は未着手。

- **ある物**: `legal_entities`（`SCS` コンテンツスタジオ／`GSS` サムライスタジオ／`GMO` グループ本体＝コストセンター。migration 284・`GJV`→`SCS` は 293）、`org_transition.state`（`off`→`preparing`→`cutover`→`done`。戻せるのは `cutover`→`preparing` だけ・人の操作でしか変えない）、`projects.entity_code`/`entity_source`（`rule`|`manual`）/`entity_note`、`project_numbers`（旧番号は永久に引ける）、帳簿4表と `estimates` の `entity_code`（NOT NULL・既存は `GSS`）、`finance_docs.entity_code`（NULL 可）
- **値はサーバーが導く**（`sales/services/entity-resolution.service.ts` `resolveEntity()`: `off` なら旧 GLS 採番／B→`GMO`／実施日が切替日より前→旧のまま／客先 `is_gmo_group`→`GSS`・外→`SCS`）。新番号は `generateProjectNumber()`（`number_prefix`＋4桁。`SCS-0001`、回は `-001`）。**画面に入力欄は無く `entity_code` を送らない。** 変えるのは改番だけ（`GET /projects/:id/renumber-preview`・`POST /projects/:id/renumber`＝manager・MCP `renumber_project`）。画面は保存値を読むだけで自分で導かない
- 設定「会社と切替」`/settings/reorg`（`platform/pages/reorg/`）: `GET /legal-entities`（`sales` reader）・`PUT /legal-entities/:code`・`PUT /org-transition`・`GET /org-transition/renumber-candidates`（移行センター。書く側は `system_admin`）。残り件数は候補配列の `.length` 1本。督促は `platform/services/scheduler.service.ts` の `renumber_needed`
- 呼び名は `projectList/stages.ts` の `ENTITY_BADGE_LABEL`（＝`legal_entities.short_name`。一覧のバッジだけ英字3文字）。型は `reorg/types.ts` `LegalEntityCode`＝shared `BusinessEntity`（`shared/src/keepReport/types.ts`・`shared/tests/keepReportEntity.test.ts` が固定）
- 台帳の絞り込みは**サーバーで**（`GET /projects?entity_code=`・`projectLedger/filters.ts`）。画面で絞るとそのページの 100 件だけ
- 財務5画面の会社タブは **URL `?entity=` が正**（`finance/pages/shared/entityFilter.tsx`。省略時は全社合算）。`money_rules`／`monthly_budgets`／`monthly_actual_overrides` は会社ごと（migration 288・PK `(entity_code, year_month)`）→ 設定「お金のルール」の会社タブ（`money/EntityTabs.tsx`・`MonthlyBudgets.tsx`・`src/lib/keepApi.ts`）。**保存は必ず `entity_code` を付ける**（省くと `CURRENT_ENTITY_CODE`＝`GSS`）。全体は `entity_code=all` で3社合計を**読むだけ**。稼働率（`UtilizationRule.tsx`・`/keep/utilization-settings`）は全社共通
- 請求書番号は発行者ごと `INV-SCS-2026-0001`／`INV-GSS-…`（`finance/services/invoice-number.service.ts`。旧 `INV-2026-` は凍結）。社内取引は `intercompany_links`（`finance/services/intercompany.service.ts`・案件詳細 `IntercompanySection`・`shared/components/IntercompanyTag.tsx`）。コストセンターは `kind='cost_center'`・`isProjectCostCenter()` で GPM「請求」タブのラベルだけ「予算と実績」に（`key` は変えない）
- 隔週キープ「載せる」＝`projects.keep_pick`（`PUT /projects/:id/keep-pick`・`projectDetail/review/KeepPickCard.tsx`）。数字は別バンドル `/daily/weekly`（素の `<a href>`）

**判断待ち**（§9 の [提案]）: D 切替日をまたぐグループ外案件／E 旧社名帳票の再発行／F 連結／H 名前とドメイン／I グループ本体のアカウント（`entity_scope`）／L GLS-B 完了済み4件。⚠️ 要確認: 本番の `org_transition.state` は `off`（2026-09-08・migration 293 の注記）。`preparing` へ進める時期は人が決める。

## 決めごと（現役ルール）

### URL・ルーティング

- **タブは URL で持つ。** 案件詳細は区間（`/:id/:tab`・`projectDetail/tabs.ts`）、取引先・取り込み・営業活動記録はクエリ（`?tab=`/`?src=`）。ローカル state だと転送で「開いたら○○タブ」ができない。区間持ちの画面に `to="?tab=…"` と書いても変わらない
- **詳細タブの URL 鍵は単数**（`task`）。`tasks` は旧ルート `/sales/projects/:projectId/tasks` と衝突して枠ごと消える
- **行き先の無いリンクは 404 にならない**（`path="*"` がホームへ戻す）。`scripts/check-links.mjs`（`npm run lint`）が突き合わせる。わざと置く物は `ALLOW` に理由付きで
- **旧 URL の転送はクエリを引き継ぐ**（`RedirectKeepQuery`。行き先のクエリが勝つ）。落とすと `?inquiry=` が消え、同じ引き合いから案件が2件できる
- **別バンドル（`/daily/` など）へは素の遷移**（`window.location`/`<a href>`）
- 案件が変わったら画面ごと作り直す（`ProjectDetailRoute`/`ProjectFormRoute` の `key={id}`。使い回すと前の案件の dirty な欄が残る）

### react-query の鍵（invalidate の対）

片方だけ落とすと「直したのに古いまま」になる。案件本体は `invalidateProjectQueries`（`sales/projectQueries.ts`）に鍵を足す／タスクは `invalidateTasks`（`tasks/hooks/useProjectTasks.ts`。`project-tasks`＋**`task-dashboard`**＋`episodes`）／標準工程を入れたら `task-columns`・`project-tasks`・`task-dashboard`・`project` の4つ（`sales/pages/flow/ApplyFlowDialog.tsx`）／GPM は `useInvalidateGpm`（`gpm/queries.ts`）／拠点・部屋を保存したら `project-studio-bookings` も（`production/components/studio/StudioRoomsManagerDialog.tsx`）

### データの正・導出（2か所に持たない）

- **タスクの完了は `is_completed` が正**、`work_state` は未完了時の止まり方。画面は `taskState()`（`tasks/pages/taskList/state.ts`）を通す
- **グループ会社の判定は `companies.is_gmo_group`。** `customer_type` とリード経路 `intake_channel='group'` は人が選ばず保存のたびにサーバーが導く（`project.service.ts` `resolveCustomerType`）。列は残す（当時の姿で数える）
- **見積は `estimates`。`revenues` に相乗りさせない**（`revenues` を読む箇所は `status` を見ない）。版は `group_id` で束ね、直せるのは `draft` だけ（`sent` から次の版を作ると `superseded`）。**合計はサーバーが出す。** A・B とも `project_id` 1本（旧 `gpm_project_id` は廃止）。A は `customer_id`、GPM は `submit_to`（`self`/`client`/`pm`）
- 明細は3グループ（スタジオ／技術・人員／制作・その他）。**粗利率 30% 未満は赤くするが保存は止めない**（`projectDetail/EstimateItems.tsx`）。値引きは別建て。**上限超過は「承認待ち」にし送付だけ止める**（`sales/services/estimate.service.ts`）
- **受領書類は「1通」でなく「1つの取引（束）」が単位**（migration 281）。段・払う金額・台帳へ渡せるかは `shared/src/utils/financeDocChain.ts` が決め、サーバーにも同じ計算がある（`server/src/shared/services/finance-chain.ts`。server は shared を import できない）。`shared/tests/financeDocChainParity.test.ts` が突き合わせる
- **受領書類の当て先は人が決める。** AI は `project_hint` を渡すだけ、サーバーが確からしさを付ける（候補が複数なら付けない）。人が直したら `project_source='human'`（無修正採用率を嘘にしない）
- **万円へ丸めるのは `toMan` 1本**（`shared/src/client/ui/numbers.tsx`）。単位は数字と別に描く
- **同じ数字を2か所で数えない。** トップのタイル件数・ダッシュボードの帯は既存 API を使い回す。GPM 一覧の「見積」も案件一覧と同じ式（`ESTIMATE_AMOUNT_LATERAL`）
- **「NULL＝決めていない」と 0 を混ぜない**（値引き上限・単価・来場人数）
- 会場の書き方は `projectDetail/venue.ts` 1本（部屋は `rooms[]`・外現場は `location_note`・拠点は略称だけ前置き）

### サーバーの部分更新

- **「渡さなければ今の値を保つ」**（欄を持たない画面・MCP からの保存で値が消える／戻るのを防ぐ）。**知らない値は 400 にせず NULL に落とす**（古い呼び出しを止めない）。**消す操作だけは明示の空値**（空文字→NULL）。金額欄は「未指定＝保つ・null/空文字＝消す・整数（円）だけ」（`keep-report.routes.ts` `readAmount`）

### SQL（型検査も lint も中身を見ない）

- **jsonb の存在演算子（疑問符）を書かない** — DB 層がプレースホルダと数えて落ちる。`->>` で書く（`shared/tests/sqlPlaceholder.test.ts`）
- **列を DROP したらサーバーの SQL 文字列を全部追う**（`shared/tests/droppedColumns.test.ts`）。`entity_code` を持つ表への INSERT は列を明示（`shared/tests/entityCodeInserts.test.ts`）
- 列名・型は実 DB で確かめてから書く（`project_tasks.status` は無い・`due_date` だけ `date` 型）。`GROUP BY` に選択列を全部入れる

### 二重登録・押し直しへの守り

- **「二度は作れない」はサーバーで守る**（ボタンを隠すだけだと古い画面が押せる）: 標準工程は `projects.flow_applied_at`・書類の台帳渡しは 409 `ALREADY_LINKED`・議事録の持ち帰り→タスク/未確認事項は**取引の中で `FOR UPDATE` してから `task_id`/`ask_id` を書き戻す**
- **投入口の押し直しは `idempotency_key` を DB が拒否**（`intake:<投入id>:<draft_key>`）。**定時実行（`platform/services/scheduler.service.ts`）は2段**: `scheduled_job_runs(job_key, run_date)` の主キー＋`notifications` の一意索引 `uq_notifications_dedup`
- 共同編集中の案件への全置換は 409 `COLLAB_IN_PROGRESS`（`sales/services/project-collab.service.ts`）。⚠️ 要確認: モックの「金額の同時編集は 409 で止める」は金額欄単位では未実装

### 外部サービス（BOX）

- **読む口は BOX が落ちていても 200 ＋ `reason`**（`NO_FOLDER`/`NOT_CONFIGURED`/`UNAVAILABLE`。500 だと障害の日に案件詳細が全部開けない）。**置く口は失敗を理由付きで返す**
- 同じ名前は新しい版として上げる（409 → `uploadFileVersion`）。複数は1つずつ上げ、上がった分だけ返す。multer のファイル名は `Buffer.from(name, 'latin1').toString('utf8')` に通す
- 実体は `sales/services/project-box-files.service.ts` 1本（案件と GPM が共用）。フォルダは押したときだけ作る（BOX に作った物は ONAiR から消せない）

### トップページ・アプリタイル

- **`DAILY_KEYS`（`platform/pages/HomePage.tsx`）と `EVENT_KEYS`（`home/AppTiles.tsx`）は対。** 出す・出さないだけを決め、並び順は `apps.ts` の `APPS`
- **スクロール演出の既定は「見える」。** 隠すのは JS が `data-reveal="hidden"` を付けたときだけ（`home/Reveal.tsx`・`shared/src/client/tokens-v4.css`）
- `/dashboard/app-badges` は `requireAuth` だけ（トップは全員が最初に開く）。「最近見たもの」は `platform/RecentTracker.tsx` 1か所で**読めてから積む**（URL だけだと 404 の行が残る）

### 権限

- **ボタンは権限で出し分ける**（サーバーだけで止めると「押せるのに 403」）。削除は `manager`・目標設定は `editor` など
- 経理・営業・日常業務が共に使う口は `requireAnyPermission(['sales','dailyops'])`（受領書類・受付）。画面側は `PermissionRoute anyOf`
- ⌘K・左メニューで `module` 未指定の項目は入口の権限を要求する（`searchFeatures.ts`。開けてある入口は設定だけ＝`OPEN_ENTRANCES`）
- 祝日 `GET /business-hours/holidays` は認証だけで権限を掛けない（掛けるとカレンダーの日付が黒いまま）。サイネージ URL はログインなしで開けるので、トークンの作り直し（`production/routes/studio.routes.ts` の `/rooms/feeds/regenerate-token`）は `system_admin` だけ（配った URL が全部無効になる）

### AI・録音（会社方針の5条件も必須・`.claude/skills/ai-feedback-loop/`）

- **録音は 32kbps**（`audioBitsPerSecond: 32000`・`projectDetail/thread/RecordDialog.tsx`・`tasks/components/intake/Recorder.tsx`。128kbps だと 25 分で Whisper の 25MB 上限）
- **文字起こし・整形はリクエストの中で待たない**（nginx の `/api/` は 60 秒）。行を先に作って 202 を返し画面がポーリング（`sales/routes/minutes.routes.ts`）。ジョブ表は作らず行に状態を持つ
- **AI に HTML を書かせるのはやり取りの整形だけ**（`server/src/shared/services/html-sanitize.ts`・許可タグ9・属性0）。メール取込は「意味の単位」で受けて `RichContent`（`shared/src/client-v4/richContent.tsx`）が描く
- **差分の before は `ai_outputs.payload_snapshot`**（直前の行と比べると書きかけ保存後の修正が全部「無修正」になる）
- 主経路（`tasks/services/intake-ai.service.ts`）が落ちたら規則ベース（`intake-parser.service.ts`）に縮退し、**縮退したことを画面に書く**

### 置き場所・部品

- **v4 専用の共通部品は `shared/src/client-v4/`**（`shared/src/client/` は凍結アプリの CSS に入る）。`src/components/ui/` は `motion`/`animated-number` 以外1行の再エクスポート。**新しい共通部品はここに実装しない**（他アプリから使えない）
- **欄・送信ロジックは写さず共用する。** 案件作成と案件を直すは `projectNew/RequiredFields`・`MoreFields`（`mode: 'create' | 'edit'`）、PC とスマホの送信は同じ hook（`useCreateProject` 等）
- 引き合いの種類の見せ方は `sales/pages/inbox/kinds.ts` 1本、GLS 発番の境界は `sales/glsIssue.ts` 1本（発番ボタン・ダイアログ・案内文が共用）

### スマホ

- **幅の分岐は「薄い親」で。** 部品の中で `if (mobile) return …` と書くと幅が変わった瞬間にフックの数が変わって落ちる。判定は `useIsMobile()`（`shared/src/client-v4/mobile.ts`・`MOBILE_MAX`＝1023）1本
- **画面を足したら `src/pcOnlyScreens.ts` のどちらかに入れる**: `CLIENT_PC_ONLY`（`what`/`why`/`instead` を具体的に）か `CLIENT_MOBILE_OK`。無いと `scripts/check-mobile-declared.mjs` で `npm run lint` が止まる。基準は「読む／1タップで進める物は開ける・入力欄が並ぶ物・設定・データを入れる道具は PC」。スマホでは `AppShell` の `<PcOnlyGate>`（`shared/src/client-v4/pcOnly.tsx`）が案内に差し替える — 画面ごとに `useIsMobile()` を書かない
  - **並び順が効く**（先に一致した物が勝つ）: `/gpm/projects/new`・`/sales/projects/ledger` は `/:id` より前
  - `hidden: true` はスマホの左メニューと設定トップからも消す（`CLIENT_MOBILE_HIDDEN`＝取り込み・仕入先集計・データビューア・DBバックアップ・会社と切替）。ルートは消さない
  - **`/budget/billing` は PC 側に入れない**（⑫ 入金の確認 `closing/MobileCollect.tsx`。置かないのは台帳の表で、片づく1つの仕事は置く）
- **案件詳細のスマホタブは段階で入れ替える**（`projectDetail/tabs.ts` `MOBILE_TABS_BY_PHASE`・`projectPhase()` は実施日の両端も見る）。開けないタブを黙って概要にすり替えず `PcOnlyPanel` で案内する。GPM 詳細も同型（`gpm/pages/projectDetail/DetailHeader.tsx`）
- **スマホの絞り込みは1行に畳んでシートで開く**（`shared/src/client-v4/mobileFilterBar.tsx`）。`props` は PC 版と同じ（`FilterBarProps`）・効いている数をボタンに出す（0 は出さない）・検索だけは畳まない。画面固有は `activeFilterCount` とシートの中身だけ（`projectList/MobileFilterBar.tsx`）
- 台帳の表はスマホでカード（`finance/pages/ledger/LedgerList` が幅の分岐を1か所で持つ・金額は `MoneyCell width={128}` で右端固定）。取り消しは PC から

## 触るときの注意

- 検査: `npx tsc -b client`・`npm run lint`・`npm run test`（shared の Vitest）・`npm run verify:ui`（実ブラウザ）。v4 の PR は `node scripts/v4-progress.mjs --write` で [docs/v4-progress.md](../docs/v4-progress.md) を作り直す
- `npm run lint` で client に効く検査: `check-links`・`check-mobile-declared`・`check-form-submit`（`onSubmit` を持つ `FormDialog`/`Sheet` の中のボタンに `type` を書く。書かないと「キャンセル」で保存が走る）・`check-file-size`（**1ファイル 400 行のラチェット**・`scripts/file-size-baseline.json`。超えるなら `ProjectDetailRoute.tsx` のように薄い入口へ分ける）・`check-ui-tokens`/`check-tokens`/`check-contrast-tokens`（部品と色をトークン外で書かない）・`check-shared-wiring`・`check-changelog`
- `predev`/`prebuild` が `scripts/generate-version-history.mjs`・`generate-mcp-tools.mjs` を回す（`client/package.json`）
- `framer-motion` は client にしか入っておらず、v4 の画面では使わない（動きは `shared/src/client/tokens-v4.css` の末尾・`docs/design/v4/_tokens.md`）。`src/index.css` はサイネージの直書き CSS だけ（土台は `shared/src/client/base.css`）
- 仕様は `docs/design/v4/`（[projects.md](../docs/design/v4/projects.md)・[finance.md](../docs/design/v4/finance.md)・[schedule.md](../docs/design/v4/schedule.md)・[settings.md](../docs/design/v4/settings.md)・[gpm.md](../docs/design/v4/gpm.md)・[mobile.md](../docs/design/v4/mobile.md)・[_rules.md](../docs/design/v4/_rules.md)）。案件管理のダッシュボード・案件作成・一覧・詳細は `mockups/v4-live-sales.dc.html` が正（[README](../docs/design/v4/README.md)）
- 旧実装のまま残る大物: `tasks/components/DashboardGantt/DashboardGanttView.tsx`（522行）・`production/components/episodes/BusinessProjectView.tsx`（GPM の請求タブが呼ぶ・スマホ非対応）

## 残作業・判断待ち

| 何が | どこ |
| --- | --- |
| v4 化の状態（サイトツリー・生成物） | [docs/v4-progress.md](../docs/v4-progress.md) |
| 全画面ネイティブ級化のバックログ | [docs/v4-native-ui-plan.md](../docs/v4-native-ui-plan.md) |
| 案件・タスク・AI・共有の根源整理 | [docs/core-redesign-plan.md](../docs/core-redesign-plan.md) |
| 案件台帳（`projects` 57列）の整理・Phase C の 🔲 判断待ち | [project-ledger-simplification-plan.md](../docs/project-ledger-simplification-plan.md)・[project-ledger-phase-c-design.md](../docs/project-ledger-phase-c-design.md) |
| 事業再編の未決分岐（§9）・P4 | [docs/reorg-2026-10-plan.md](../docs/reorg-2026-10-plan.md) |
| レビュー指摘の棚卸し | [docs/reviews/codex-findings-v4.md](../docs/reviews/codex-findings-v4.md) |

## 経緯の記録

[docs/reviews/client-v4-build-log.md](../docs/reviews/client-v4-build-log.md)（2026-08-22 に移動。2026-09-08 にこの文書から外した圧縮前の本文を末尾に追加）。
