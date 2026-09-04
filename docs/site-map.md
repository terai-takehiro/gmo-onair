# サイトツリーと相関関係 — バグ修正・機能修正の起点

**この文書の役割**: 「この画面を直したら、どこまで影響するか」を先に見積もるための地図。
サイトツリー自体・v4の進み具合は [v4-progress.md](v4-progress.md)（生成物）、
入口を増やすときの決めごとは [ia.md](ia.md)、各アプリの実装ルールは
`<アプリ>/CLAUDE.md` が正。**ここは3つが持たない「画面をまたぐ相関関係」だけを書く**
（重複させると片方が古くなるため、機能の詳細・実装場所は各アプリの CLAUDE.md にリンクするだけに留める）。

> 生成物ではないので**手で更新する**。大きな画面追加・データモデル変更をしたら、
> 該当の節に追記すること（`## まだ入っていない機能` に相当する節はここには作らない —
> それは v4-progress.md の役目）。

## 目次

1. [全体構成（8ワークスペース）](#1-全体構成8ワークスペース)
2. [サイトツリー（画面 → 機能一言 → 主要テーブル）](#2-サイトツリー画面--機能一言--主要テーブル)
3. [データの中心軸: `projects` テーブルと GLS番号](#3-データの中心軸-projects-テーブルと-gls番号)
4. [API プレフィックスと DB の対応（サーバー側 contexts）](#4-api-プレフィックスと-db-の対応サーバー側-contexts)
5. [アプリをまたぐ相関関係（実例）](#5-アプリをまたぐ相関関係実例)
6. [権限モデルの相関](#6-権限モデルの相関)
7. [「唯一の正」一覧 — 直す前に必ずここを見る](#7-唯一の正一覧--直す前に必ずここを見る)
8. [バグ修正・機能修正のチェックリスト](#8-バグ修正機能修正のチェックリスト)
9. [関連ドキュメント索引](#9-関連ドキュメント索引)

---

## 1. 全体構成（8ワークスペース）

```
                         ┌─────────────────────────────────────────┐
                         │   server (Express + PostgreSQL 単一プロセス)│
                         │   contexts/ 配下16区画 (§4)                │
                         └───────────────┬───────────────────────────┘
                                         │ 静的配信 + /api/v1/*
        ┌──────────────┬────────────────┼────────────────┬──────────────┬──────────────┐
        ▼              ▼                ▼                ▼              ▼              ▼
   client         client-daily     client-equipment  client-techops  client-live   client-awards
   `/` :5173       `/daily/` :5180  `/equipment/`:5175  `/techops/`:5174 `/live/`:5178 `/awards/`:5179
   案件・財務        日常業務          機材管理           制作技術支援      計時・視聴者    リアルタイムCG
   カレンダー・設定                                       (旧qsheet)      (表示画面のみ独立) (凍結・URL直叩きのみ)
   GPM(新規)
        └──────────────┴────────────────┴────────────────┴──────────────┴──────────────┘
                         全アプリが shared/ (共通シェル・トークン・UI部品) を読む
                         触ると全アプリに効く → PRの影響範囲に必ず入れる
```

| ワークスペース | 詳細 | 権限モジュール |
| --- | --- | --- |
| [`client/`](../client/CLAUDE.md) | 案件管理 `/sales`・財務管理 `/budget`・カレンダー `/calendar`・設定 `/settings`・GPM `/gpm` の**5入口が1バンドル** | `sales`（旧5区画を統合済み） |
| [`client-daily/`](../client-daily/CLAUDE.md) | 週報・ニュース・内覧会・受領書類・セキュリティカード | `dailyops` |
| [`client-equipment/`](../client-equipment/CLAUDE.md) | 機材台帳・ラック図・貸出・棚卸し | `equipment` |
| [`client-techops/`](../client-techops/CLAUDE.md) | 台本作成・本番進行＋計時/視聴者/テロップCGのミニアプリ群 | `qsheet`（旧`liveops`も統合済み） |
| [`client-live/`](../client-live/CLAUDE.md) | 表示画面 `/live/display/` のみ独立稼働。運用画面は`client-techops`へ移植済み | `qsheet`（表示画面は認証なし） |
| [`client-awards/`](../client-awards/CLAUDE.md) | 凍結。URLは生きているが一覧に出ない | `awards` |
| [`shared/`](../shared/CLAUDE.md) | 共通シェル・トークン・UI部品。**唯一の正の置き場が多数集まる**（§7） | — |
| `server/` | Express + PostgreSQL。`contexts/` 配下16区画 | — |

---

## 2. サイトツリー（画面 → 機能一言 → 主要テーブル）

**URL一覧そのもの（v4対応済みかどうかの印つき）は [v4-progress.md](v4-progress.md) が正**
（生成物・`node scripts/v4-progress.mjs --write`）。ここでは**各画面が触る主要テーブル**と
**他画面への波及**だけを補う。

### 案件管理 `/sales/*`

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| 案件作成（受付統合） `/sales/projects/new` | 引き合いを読んで案件化するか決める | `projects`, `misc_inquiries` | 日常業務「入ってきた情報」から`?inquiry=`で来る（§5） |
| 案件一覧 `/sales/projects` | 毎日開いて次の一手を決める | `projects` | ダッシュボードの件数と同じ`GET /projects`を再利用 |
| 案件詳細 `/sales/projects/:id/:tab` | 8タブ（概要/やり取り/タスク/回/見積/書類/当日/ふりかえり） | `projects`, `episodes`, `estimates`, `project_tasks`, `studio_bookings` | タブはURLの区間で持つ（§7） |
| 見積・請求（全案件） `/sales/billing` | 確定売上のうち請求待ちを横断で見る | `revenues`（`status='confirmed'` かつ `group_id IS NULL`） | 財務ダッシュボードと同じ確定条件 |
| 標準工程テンプレート `/sales/flow-templates` | 案件のタスクを一括生成 | `flow_templates`, `project_tasks` | GPMの標準工程とは別系統（テーブルも別） |
| 案件台帳 `/sales/projects/ledger` | 列を出し入れして網羅的に見る・一括更新 | `projects`（案件一覧と**同じ口**`GET /projects`） | ステージは持たない（履歴・GLS発番の確認を飛ばすため意図的に除外） |
| 費用を分け合うグループ `/sales/project-groups` | 複数案件で1つの請求・按分 | `project_groups`, `revenue_allocations`, `purchase_allocations` | 請求一覧は按分の親行を二重に数えない（`group_id IS NULL`条件） |

### 財務管理 `/budget/*`

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| ダッシュボード `/budget/dashboard` | 月次PL・営業見通し（パイプライン） | `revenues`, `purchases`, `sga_expenses`, `project_stage_probabilities` | 内訳クリックは台帳へ遷移せずモーダル表示（読取専用） |
| 売上 `/budget/revenues` | 全ステージ（失注除く）で登録可 | `revenues` | 見積タブから`convertToRevenue`/`revertToEstimate`で相互移動 |
| 仕入 `/budget/purchases` | 同上 | `purchases` | 同上 |
| 受け取った書類 `/budget/documents` | 精算書類の受領記録（旧日常業務から移設） | — | `budget`か`dailyops`のどちらの権限でも開ける |
| 取り込み `/budget/import` | 精算PDF・総勘定元帳・二重計上チェック | — | 受注確定済み(`a_won`/`s_completed`)だけの案件プルダウン（`GET /projects/won-projects`） |

### カレンダー `/calendar/*`

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| 予定 `/calendar` | 統合カレンダー（月/週/一覧/香盤の4表示） | `studio_bookings`, `personal_events` | 自前実装（FullCalendar不使用）。祝日は設定⑥から読む |
| 部屋の空き `/calendar/rooms` | 拠点ごとの部屋の空き状況 | `studio_bookings`, `studio_rooms` | 帯の色は「種別の色」（①③と同じ`BOOKING_TYPE_COLORS`） |
| 重複疑い `/calendar/duplicates` | 複数経路からの二重登録疑いを集める | `studio_bookings`（`possible_duplicate`系の印） | 保存は止めない（印を残すだけ） |

### 設定 `/settings/*`

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| 権限とメンバー `/settings/users` | 役割5種を権限の「型」として付与 | `users`, `user_permissions`, `permission_roles` | 判定は311か所そのまま（役割ベースに置換していない） |
| お金のルール `/settings/money` | 支払期日逆算・消費税端数・値引き上限 | `money_rules` | 期日計算はサーバーのみが持つ（画面には写さない） |
| 休日・営業時間 `/settings/hours` | 拠点ごとの営業時間・休業日 | `business_hours`, `holidays` | 祝日API`GET /business-hours/holidays`は権限なしで開放 |

### プロジェクト管理（GPM）`/gpm/*`（新規）

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| プロジェクト一覧 `/gpm/projects` | GLS-Bの案件一覧 | `projects`（`gls_category='B'`） | 見積列は案件管理と**同じ式**（`ESTIMATE_AMOUNT_LATERAL`） |
| プロジェクト詳細 `/gpm/projects/:id` | 工程（`gpm_phases`）ごとにタスクを管理 | `gpm_phases`, `project_tasks`（`gpm_phase_id`） | 工程を消してもタスクは消えない（`gpm_phase_id`をNULLに） |
| 議事録 `/gpm/projects/:id/minutes` | 打合せ記録・持ち帰り管理 | `project_minutes` | 持ち帰りの行き先は「未確認事項」（案件管理はタスク） |
| 見積 `/gpm/projects/:id/estimates` | 提出先別（自社/依頼元/PM会社） | `estimates`（`gls_category`で案件と分離） | 明細部品`EstimateItems`は案件見積と共用 |

### 日常業務 `/daily/*`

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| ウィークリー活動報告 `/daily/weekly` | 自動集計→AI本文→人が書くトピック | `ops_reports`, `ops_report_items` | 確定後は追記不可 |
| 内覧会 `/daily/inview` | 開催日一覧＋当日受付 | `inview_registrations` | 検索は回をまたぐ（`inview/logic.ts`の正規化） |
| 入ってきた情報 `/daily/inquiries` | 未仕分けを空にする机（3タブ） | `misc_inquiries` | チケット化＝`project_tasks`を1本作る／案件化は`/sales/projects/new?inquiry=`へ送る（§5） |
| セキュリティカード `/daily/security-cards` | エリア解錠権限の貸出台帳（機材とは別台帳） | `security_cards`, `security_card_lendings` | レベルはDB6種が正（モックの3種畳みは採らない） |

### 機材管理 `/equipment/*`

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| 機材台帳 `/equipment/items` | 機材・貸出機材・ケーブル・コネクタの4タブ | `equipment_items`, `equipment_rental_categories` | IDは「拠点-種別-連番5桁」 |
| ラック図 `/equipment/racks` | 1U単位・前面/背面切替 | `equipment_items`（設置U位置） | 印刷寸法は実機合わせの固定値（触らない） |
| 棚卸し `/equipment/inventory` | 保管場所ごとに✓/×、下書き→実施中→完了 | `inventory_checks` | スマホは「現場のスキャン」に自動切替、端末に溜めて送信 |
| 貸出・返却 `/equipment/lendings` | 貸出可設定した機材のみ対象 | `equipment_lendings` | 案件に紐づく貸出は`project_id`（nullable） |

### 制作技術支援 `/techops/*`（旧qsheet・凍結解除中）

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| トップ `/techops/top` | 番組・案件を選ぶ（GLS案件 or 独自番組） | `projects`, `qsheet_programs` | 選んだ先はハブ画面（JourneyPage） |
| ハブ `/techops/projects/:id` `/programs/:id` | ミニアプリ（進行台本/スケジュール/収録設定/配信設定/計時・視聴者/テロップCG）への分岐 | — | owner解決は`device-settings-owner.ts`の`Owner`型が唯一の正 |
| 進行台本（Qシート） `/techops/sheets` | 台本作成（Yjs同時編集） | `qsheet_documents`, `qsheet_doc_yjs` | 連携キーはGLS番号＋エピソードコード |
| 本番4画面（`/techops/{onair,rundown,prompter,audio}`） | 本番進行の同期・プロンプター・音声サポート | `qsheet_documents` | ⚠️ 見た目の作り直しの対象外。Socket.IOで同期 |
| 計時・視聴者 `/techops/live/:ownerKey` | タイマー・視聴者カウンター運用画面 | `liveops_programs`, `liveops_timers` | 表示画面`/live/display/`とは別実装（意図的な複製） |
| テロップCG `/techops/graphics/:ownerKey` | リアルタイムCGの後継（**設計段階・実装未着手**） | `graphics_*`（先行実装あり） | 単独アプリとしては再登場しない、ミニアプリのみ |

### 計時・視聴者 `/live/*`（表示画面のみ）

| 画面 | 機能一言 | 主要テーブル | 波及先 |
| --- | --- | --- | --- |
| 表示画面 `/live/display/:timerId` | 会場モニター・OBSが読む公開URL | `liveops_timers` | ⚠️ 認証なし・見た目を変えない決まり（`liveDisplayContract.test.ts`が固定） |

### リアルタイムCG `/awards/*`（凍結）

見た目・URLとも現状維持。ダッシュボード・トップページ・左メニューには出ない。
出力6画面（`/awards/output/*`）は放送に出る映像そのもの・認証なし。

---

## 3. データの中心軸: `projects` テーブルと GLS番号

**`projects` テーブルが全アプリの結節点。** ステージ遷移とGLS発番:

```
neta(ネタ) → d_hold(要件確認) → c_proposal(見積・提案) → b_verbal(決定見込み)
  → a_won(受注済) → s_completed(完了) / e_lost(失注)

GLS発番: a_won に上がった瞬間に自動（changeStage）。手動 issue-gls は b_verbal から呼べる例外のみ
```

- **`gls_category`**: `A`=スタジオ（案件管理 `/sales/*` が扱う）／ `B`=ビジネス（GPM `/gpm/*` が扱う）。
  同じ`projects`テーブルを共有し、`gls_category`で画面・権限を分ける
- **受注確定の絞り込みは`stage`が正**（`gls_number IS NOT NULL`ではない）。
  仕入・売上・精算PDF取込・予算詳細・書類引き渡しは`GET /projects/won-projects`（`stage IN ('a_won','s_completed')`）、
  「GLS番号そのものへ紐づける」操作（回の追加・費用按分）は`GET /projects/gls-projects`（`gls_number IS NOT NULL`）

`projects.id` を外部キーで参照する主要テーブル（`project_id`列。詳細は各migrationファイル）:

| テーブル | 用途 | 所属アプリ |
| --- | --- | --- |
| `episodes` | 回（撮影単位） | client（案件詳細「回」タブ） |
| `estimates` | 見積（`gls_category`で案件/GPMを排他） | client（案件・GPM共用） |
| `revenues` / `purchases` | 売上・仕入 | client（財務管理） |
| `revenue_allocations` / `purchase_allocations` | 費用按分 | client（費用を分け合うグループ） |
| `project_tasks` / `task_columns` / `task_dependencies` | タスク | client（案件詳細・GPM共用） |
| `project_minutes` | 議事録 | client（案件・GPM共用、持ち帰り先だけ違う） |
| `activity_logs` | 営業活動記録 | client（案件管理） |
| `event_reports` / `event_report_kpt` | ふりかえり | client（案件詳細） |
| `gpm_phases` / `gpm_open_items` / `gpm_members` | GPM工程・未確認事項・メンバー | client（GPM） |
| `misc_inquiries` | 入ってきた情報（nullable、案件化前は空） | client-daily → client |
| `inview_registrations` | 内覧会の`promoted_project_id` | client-daily |
| `equipment_lendings` | 案件紐づけ貸出（nullable） | client-equipment |
| `studio_bookings` | 予約（`episode_id`とも紐づく） | client（カレンダー） |
| `liveops_programs` / `liveops_timers` | 計時・視聴者（`ON DELETE SET NULL`） | client-techops |
| `qsheet_recording_settings` / `qsheet_streaming_settings` / `qsheet_rental_reservations` | 収録・配信設定 | client-techops |

**列を DROP するときは `shared/tests/droppedColumns.test.ts` が全SQL文字列を検査する**
（`projects.notes`のDROPでGPM全画面が500になった実績あり。§7参照）。

---

## 4. API プレフィックスと DB の対応（サーバー側 contexts）

`server/src/routes/index.ts` の `createRoutes()` 登録順。実URLは `/api/v1/` 配下。

| context | 主なAPIプレフィックス | 主に呼ぶフロントエンド |
| --- | --- | --- |
| `platform` | `/auth`, `/dashboard`, `/users`, `/permission-roles`, `/notifications`, `/search`, `/data-viewer`, `/lookup`, `/admin/*` | 全アプリ共通（認証・検索）、設定画面は主にclient |
| `sales` | `/billing`, `/flow-templates`, `/project-groups`, `/projects/*`, `/customers`, `/companies`, `/pricing`, `/activity-logs`, `/stage-probabilities` | client（`/sales/*`） |
| `production` | `/projects/*`（episodes系）, `/calendar`, `/reports`, `/studios`, `/business-hours` | client（`/calendar/*`） |
| `finance` | `/revenues`, `/purchases`, `/sga`, `/vendors`, `/partners`, `/xpoint`, `/money-rules`, `/monthly-summary`, `/pipeline-forecast` | client（`/budget/*`） |
| `gpm` | `/gpm/*` | client（`/gpm/*`） |
| `asset` | `/equipment/*` へ委譲するだけの薄いラッパー | client-equipment |
| `equipment` | `/equipment/*` | client-equipment |
| `qsheet` | `/qsheet/*` と `/techops/*` の**二重マウント**（同一ルーター実体） | client-techops |
| `liveops` | `/liveops/{webhooks,settings,org-settings,programs,timers,display-templates,measure}` | client-live（Socket.IO `/liveops`）。運用画面は client-techops へ移植中 |
| `awards` | `/awards/*` | client-awards（凍結） |
| `quiz` | `/quiz/*` | client-awards（凍結） |
| `graphics` | `/graphics/*` | client-techops（テロップCG・設計段階） |
| `tasks` | `/task-dashboard`, `/projects/:projectId/task-columns`, `/projects/:projectId/tasks`, `/task-templates` | client（案件詳細・GPM共用） |
| `dailyops` | `/dailyops/*` | client-daily |
| `schedule` | `/schedule/{partner,personal,google,ms,task-feeds}` | client（カレンダーの個人予定拡張） |
| `mcp` | 別立て（`contexts/mcp/index.ts`）。REST routesではない | MCPクライアント（Claude等）専用 |

---

## 5. アプリをまたぐ相関関係（実例）

サーバー・フロントとも分かれているが、実際には強く結合している箇所。**片方だけ直すと壊れる**。

| 起点 | 終点 | 関係 |
| --- | --- | --- |
| 日常業務「入ってきた情報」 | 案件管理「案件作成」 | `/sales/projects/new?inquiry=<id>`へ遷移 → 登録後 `POST /dailyops/inquiries/:id/link-project` で書き戻す。**この画面では案件を直接作らない**（必須項目の二重管理を避けるため） |
| 案件管理・案件詳細「回」タブ | 制作技術支援（台本） | GLS番号＋エピソードコードで台本と紐づく（`qsheet_documents`） |
| 案件管理・案件詳細「見積」タブ | GPM「見積」タブ | `estimates`テーブルを共用。`gls_category`で行き先を分離（`project_id`か`gpm_project_id`のどちらかCHECK制約） |
| 案件詳細「タスク」タブ | GPM「未確認事項」 | どちらも`project_tasks`／`project_minutes`を触るが、議事録の持ち帰り先だけ**タスク vs 未確認事項**で分岐（相手待ちが混ざると止まっている件数を数えられないため） |
| 財務ダッシュボード内訳行 | 台帳（売上/仕入/販管費） | 仕入・販管費はモーダル表示（読取専用）に変更済み・**売上だけ台帳へ遷移**（v4.5.24で仕様変更） |
| トップページのタイル | 各アプリのダッシュボード | `DAILY_KEYS`（`HomePage.tsx`）と`EVENT_KEYS`（`AppTiles.tsx`）が対。片方だけ直すとタイルが二重/消失する |
| 計時・視聴者 運用画面 | 表示画面 `/live/display/` | Socket.IOで配信。表示画面は別実装（`client-live`側は意図的な複製、触らない） |
| 制作技術支援（旧qsheet） | サーバー | `/qsheet/*`と`/techops/*`が同じルーター実体を二重マウント。Socket.IOも`broadcastToRoom()`で相互中継 |
| リアルタイムCG（凍結） | テロップCG（`graphics`） | 旧実装の後継として設計中。CG配信の思想は引き継ぐが単独アプリとしては再登場しない |

---

## 6. 権限モデルの相関

**2段構造**: ①モジュール権限（どのアプリを触れるか）→ ②案件メンバー（どの案件のデータが見えるか）。

| 権限モジュール（`permissionModule`） | 対象アプリ・入口 | 備考 |
| --- | --- | --- |
| `sales` | client の全5入口（案件管理・財務管理・カレンダー・設定・GPM） | 旧`budget`/`studio`/`partner_schedule`/`admin`/`gpm`を統合済み |
| `dailyops` | client-daily | 「受け取った書類」だけ`sales`(旧budget)/`dailyops`のどちらでも通す |
| `equipment` | client-equipment | — |
| `qsheet` | client-techops（旧`liveops`区画も統合済み・migration 232） | `permissionModule`自体は改名していない（DBテーブル名と同じ理由で据え置き） |
| `awards` | client-awards | 凍結中も権限モデル自体は生きている |
| `system_admin` | 権限とメンバーの管理のみ | `sales`権限があっても人事的操作は`system_admin`限定 |

権限を持たないカードはカードごと非表示（403を踏ませない）。祝日API・音声サポート公開URL・
表示画面`/live/display/`だけは意図的に認証なし（§7「認証を通さない画面」参照）。

---

## 7. 「唯一の正」一覧 — 直す前に必ずここを見る

各アプリのCLAUDE.mdに散らばっている「ここが正・写すな」を1箇所に集約。**該当箇所を直すときは
リンク先の詳しい理由も読むこと**（ここには要点だけ）。

| 何の正か | 置き場所 | 崩すとどうなるか |
| --- | --- | --- |
| アプリ一覧（名前・URL・権限モジュール） | `shared/src/client/apps.ts` | 5か所に分かれ食い違っていた過去がある（S1で統合済み） |
| 万円の丸め | `shared/src/client/ui/numbers.tsx`（`manYen`/`toMan`） | 4通りに割れて同じ画面でKPIとグラフが違う金額に見えた実績 |
| タスクの完了判定 | `contexts/tasks/pages/taskList/state.ts`（`taskState()`） | `is_completed`が正・`work_state`は補助情報 |
| 案件分類（`project_type`） | サーバー1箇所 `server/.../project-classification.ts` | 画面から送らない（2段の入力だけ） |
| 見積金額 | サーバーが合計を出す（`ESTIMATE_AMOUNT_LATERAL`） | 案件一覧・GPM一覧が同じ式を参照。写すと画面によって金額が違って見える |
| owner解決（qsheet/GPMの文脈） | `client-techops/src/lib/device-settings-owner.ts`（`Owner`型） | ミニアプリを増やすときもここに分岐を足すだけで済む設計 |
| QRコードの読み方 | `client-equipment/src/lib/qrCode.ts` | ⑥QRスキャンと⑨棚卸しスキャンの両方が使う。写すと片方だけ形式が古くなる |
| 内覧会・探すの検索正規化 | `client-daily/src/pages/inview/logic.ts`（`normalizeForSearch`） | 写すと「内覧会では当たるのに探すでは当たらない」現象 |
| 期日計算（支払期日等） | サーバーのみ（画面は「試すと何日になるか」を訊く） | serverがsharedをimportしない構成のため、画面に写すと必ず食い違う |
| Yjs同時編集の差分器 | `client-techops/src/lib/collab/ydocDiff.ts` | section/rowは必ず`id`を持つ（`genId`）。付け忘れは1編集ごとに倍増して落ちる実績 |
| BOXファイル操作 | サーバー`project-box-files.service`1本 | 案件詳細・GPMの書類タブが共用 |
| 幅の分岐（PC/スマホ） | 各アプリの`useIsMobile()`1本（`shared/src/client-v4/mobile.ts`） | 部品内で`if (mobile) return`するとフック数が変わりReactが落ちる |
| 列幅の段（`SlotWidth`） | `shared/src/client/ui/row.tsx` | `MoneyCell`/`TableBadge`が両方これを参照。別々に持つと列がずれる |

**認証を通さない画面（意図的な例外）**:
- 祝日API `GET /business-hours/holidays`
- 音声サポート公開URL・サイネージURL `/signage/:roomId`
- 計時・視聴者表示画面 `/live/display/:timerId`
- リアルタイムCG出力画面 `/awards/output/*`（凍結中も維持）

---

## 8. バグ修正・機能修正のチェックリスト

1. **どの`projects`絞り込みを使うか確認する**（§3）。`stage`ベースか`gls_number`ベースかを混同しない
2. **react-queryの鍵の対を確認する**（`client/CLAUDE.md`「invalidateの対」）。タスク・標準工程・GPM・拠点略称は
   複数の鍵を同時に落とす必要がある
3. **`shared/`を触るなら影響は全アプリ**（§1）。1アプリだけのPRと分けて意識する
4. **列をDROPするなら`shared/tests/droppedColumns.test.ts`が通ることを確認**（§3）
5. **旧URLを消さない**。転送表（`App.tsx`の`<Navigate>`/`RedirectKeepQuery`）に追加、クエリを引き継ぐこと
6. **スマホ対応の宣言を忘れない**。画面を足したら各アプリの`pcOnlyScreens.ts`のどちらかの表に入れる
   （`npm run lint`の`check-mobile-declared.mjs`が強制）
7. **権限で出し分けているボタンは、サーバー側だけで止めない**。「押せるのに403」を避ける
8. **AI機能を新規・変更するときは`.claude/skills/ai-feedback-loop/`のスキルを必ず使う**（会社方針）
9. **凍結アプリ（`client-awards`）・表示画面（`/live/display/`）に触るときは特別扱い**。
   見た目を1バイトも変えない決まりがある画面は§7の「認証を通さない画面」を参照
10. 検証は `npm run typecheck`・`npm run test`（shared Vitest・CIが回す）・
    新規マイグレーションは `npm run verify:up` の検証DBに適用してから

---

## 9. 関連ドキュメント索引

| 知りたいこと | 読む場所 |
| --- | --- |
| v4対応の進み具合（画面ごとの✅/⬜/⏸/🆕） | [v4-progress.md](v4-progress.md)（生成物） |
| 新しい入口・メニューを増やすときの決めごと | [ia.md](ia.md) |
| v4開発計画・スコープ・凍結の定義 | [v4-plan.md](v4-plan.md) |
| 各アプリの実装ルール・置き場所 | `client*/CLAUDE.md`・`shared/CLAUDE.md` |
| qsheet→techops改名の進捗・残作業 | [reviews/qsheet-techops-migration-plan.md](reviews/qsheet-techops-migration-plan.md) |
| テロップCG（graphics）の設計 | [design/v4/graphics.md](design/v4/graphics.md) |
| ブランチ・PR・リリース手順 | [branching.md](branching.md) |
| 画面の文言ルール | [wording.md](wording.md) |
| レビュー指摘の棚卸し | [reviews/codex-findings-v4.md](reviews/codex-findings-v4.md) |
