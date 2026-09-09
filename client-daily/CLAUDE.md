# client-daily — 日常業務（v4 対象）

いま効くルールだけを置く。経緯・当時の実測・撤回した方針は
[docs/reviews/daily-equipment-build-log.md](../docs/reviews/daily-equipment-build-log.md)。

## 役割と入口

- `/daily/`・ポート 5180。`BrowserRouter basename="/daily"`（`App.tsx`）なので **`nav.ts` の `to` は `/tasks` のように接頭辞なし**
- `shared/src/client/apps.ts`: `key: 'dailyops'`・`permissionModule: 'dailyops'`
- サーバー `server/src/contexts/dailyops`（routes `reports`／`inview`／`inbox`／`security-card`／`tasks`／`feedback-ticket`／`keep`／`keep-deck`。全部 `/dailyops/*`）。タスクの本体は `server/src/contexts/tasks/services/{my-tasks,task-intake,intake-ai,task-comments}.service.ts` を `tasks.routes.ts` が呼ぶ
- 権限: 読む `dailyops:reader`・書く `dailyops:editor`。問い合わせの詳細・作成・状態変更と受領書類は **`dailyops` か `sales`**（旧 `budget` は `sales` に統合済み・`inbox.routes.ts` の `requireAnyPermission`）。仕入・販管費へ行を作る `handoff` だけ `sales:editor`
- シェルは共通。ここにあるのは `components/layout/` の `AppShell.tsx`（設定を渡す）・`nav.ts`（メニュー＋下タブ）・`DailySearchButton.tsx`（上辺の検索＝`/search` を開く・⌘K）と `manual/content.tsx`（画面内マニュアル）。左メニューは ホーム・タスク ＋ 定期報告／届いたもの／現場の受付、下タブは **ホーム／やること／探す**（`DAILY_MOBILE_TABS`）
- MCP は [docs/mcp-server.md](../docs/mcp-server.md)（日常業務・内覧会・inbox・セキュリティカード・フィードバックチケット・隔週キープの節）。メール取込は [mail-intake スキル](../.claude/skills/mail-intake/SKILL.md)・[棚卸し 2026-09-06](../docs/reviews/2026-09-06-mail-intake-taxonomy.md)
- 設計の正: [daily.md](../docs/design/v4/daily.md)・[keep-report.md](../docs/design/v4/keep-report.md)・mockups の [tasks-redesign](../docs/design/v4/mockups/tasks-redesign/)／[weekly-redesign](../docs/design/v4/mockups/weekly-redesign/)／[keep-report](../docs/design/v4/mockups/keep-report/)。タスクの要件は [2026-07-25 の要件書](../docs/archive/2026/2026-07-25-collaboration-and-personal-agent.md)（D0〜D9）

## 画面一覧（URL → `src/pages/`）

| URL | 画面 | 入口 |
| --- | --- | --- |
| `/` | ホーム | `HomePage.tsx`（件数は `GET /dailyops/alerts`・`/tasks/summary`・`/security-cards/stats`。数え直さない） |
| `/tasks` | タスク・依頼（マイタスク／依頼／メモ履歴／チーム） | `TasksPage.tsx` ＋ `tasks/`・`lib/tasksApi.ts` |
| `/weekly` | 最新週へ転送（週が無いときだけ画面） | `WeeklyListPage.tsx` |
| `/weekly/:id`・`/keep`・`/deck` | ウィークリー活動報告（この週の報告／隔週キープの数字／資料をつくる） | `WeeklyDetailPage.tsx` ＋ `weekly/`（`keep/KeepSection.tsx`・`keep/mobile/KeepMobile.tsx`・`deck/DeckPage.tsx`＝PC専用） |
| `/news` | デイリーニュース報告（月ごと1ページ） | `DailyNewsPage.tsx` ＋ `news/` |
| `/inview`・`/inview/:date` | 内覧会 開催日の一覧／その日の受付 | `InviewPage.tsx`・`InviewDayPage.tsx` ＋ `inview/`（`logic.ts`＝正規化・人数） |
| `/inquiries` | 問い合わせ（＝入ってきた情報） | `InquiriesPage.tsx` ＋ `inquiries/`（`state.ts`＝行き先・タブ） |
| `/feedback-tickets` | フィードバックチケット（ONAiR への要望・不具合） | `FeedbackTicketsPage.tsx` ＋ `feedbackTickets/` |
| `/security-cards` | セキュリティカード（master-detail） | `SecurityCardsPage.tsx` ＋ `securityCards/`（`types.ts`＝レベル） |
| `/search` | 探す（下タブ3つ目） | `SearchPage.tsx` ＋ `search/matchers.ts` |
| `/finance` | 転送だけ（受領書類は `/budget/documents`。別バンドルなので `window.location`） | `App.tsx` の `RedirectToFinanceDocs` |

## 決めごと（現役ルール）

### タスク・依頼
- 4タブ・9マス・今日やること3件・期限必須は要件 D2/D3/D8/D9。書き留める入口は案件管理トップ、ここは格納先と見直し
- **`/daily/tasks` は行き先そのもの**（案件管理ホーム `home/{AppTiles,TaskHubCard}.tsx` が向く。`GET /dailyops/tasks/mine` を出す唯一の画面）。消さない
- 主操作はタブごと: マイタスク＝タスクを追加（`TaskCreateDialog`・自分専用）／依頼＝**依頼する**（`RequestDialog`）。依頼タブから依頼を出せる状態を壊さない。欄は 相手→内容→補足→期限→重要度（相手で期限が必須に変わる＝`docs/design/v4/_form-order.md` 2-1）
- 依頼タブは master-detail（`DelegationList`＋`DelegationDetail`）。本文・やり取り・操作は選んだ1件だけに出す。行にコメント欄を戻さない。スマホはカード＋シート
- 「あなたの番」＝`isMyTurn()`（受けて未返答＋出して差し戻し）。タブの数字も帯もこれ1本。未完了の総数は出さない
- 段は `delegationBucket()` の4つ（辞退・相談は差し戻しに畳む）。完了は `is_completed` だけで決める
- 一覧は完了ぶんまで取る（`useMyDelegations(dir, true)`／`useMyTasks({include_completed:true})`）。段の数は未完了だけ・「すべて」は完了含む
- ページ幅は他と同じ全幅 `p-3 lg:p-6`（`mx-auto max-w-5xl` に戻さない）
- `sales` 権限が無い人にも自分のタスクは見せる（D0。金額は返さない・案件リンクは `can_open_project` で出し分け）
- メモ履歴（`IntakeLogTab`・`POST /dailyops/tasks/intake`）は AI 取込の全文と生まれたタスクの記録＝原則の条件1・2の器。消さない

### ウィークリー活動報告
- 並びは 総括→主要指標→トピックス→詳細内訳（読み手の順）。生成工程の順に戻さない
- 見出しは対象週（`WeekSwitcher`。週レールは持たない）。週の追加は月次カレンダーから週行を選ぶ（`WeekAddCalendar`）。削除は下書きだけ（`DELETE /reports/:id`＝論理削除・確定済みはサービス層が断る）
- 状態バッジは 下書き／確定済み だけ。既読は「確認した」（`POST /reports/:id/review`）、AI 由来は総括の署名（`SummarySection`）。3バッジに戻さない
- AI下書き `POST /reports/:id/draft-ai`（`weekly-report-ai`／`weekly-report-draft.service.ts`）→ 確定前だけ `PUT /reports/:id` → 確定時に `ai_corrections` へ差分を自動記録。**編集の入口を消すと条件2が形だけになる。** 確定を解くのは `POST /reports/:id/reopen`
- 数字は 確定済み＝`payload.stats`（`prev_week` 同梱）、スナップショットが無い下書きだけ `GET /weekly-stats`

### 隔週キープ（正は keep-report.md）
- 数字は定例報告パック1本（`GET /keep/pack?meeting=&entity_code=&segment=`・型 `shared/src/keepReport/types.ts`）。判定・比率・差はサーバーが計算する
- 週報を確定するとその会議日のパックが凍る（`payload.keep = {pack_id, meeting_date}`・`keep_report_packs`）。`?live=1` でいまの数字
- 絞り込みは URL（`entity_code` は SCS／GSS／GMO／`all`）。**タブ・ボタン間で `?meeting=` を持ち回る**（落とすと別の会議日の構成を開く／作る）。チップの件数は絞らない全体のパックから
- 稼働率＝利用があった営業日÷営業日（内覧・仮押さえ含む、メンテナンス除く）。数え方は `keep_settings`
- 資料に載せる案件の印は `projects.keep_pick`。ONAiR に無い数字は `keep_report_inputs`（`PUT /keep/inputs/:meeting`・満足度は 0〜4）
- Slack の文面はパックから決定的に作る（`GET /keep/slack-draft`・MCP `get_keep_slack_draft`）。bot が投稿したら `ts` と `pack_id` を残す（条件3）
- 資料をつくる（`DeckPage`）は PC 専用。構成 `keep_decks`（保存ごとに版）・人の直し `keep_deck_edits`（`deckState.ts` が 1.5 秒静止で自動保存・直列）。会議日は `?meeting=` が正で、決まるまで構成を読まない（`GET /keep/decks/:meeting` は無ければ版1を作る。読むだけは `?create=0`）。骨組みは `shared/src/keepReport/templates.ts` が正（画面と pptx が同じ位置で描く）

### デイリーニュース報告
- 月ごと1ページ（`GET /reports/items-by-month`）。列は 分類・AIの話題・注目度(1〜5)・記入者。「確認した」は日ごと
- 週報へは移すのではなく写す（`POST /items/:itemId/to-weekly`・2回押しても増えない）。送り先が確定済みかは行ごとの `weekly_locked`
- AI の投稿口は MCP `add_ops_report_items(kind='daily_news')` のまま。スマホ `NewsCards` は `NewsRows` の `useNewsRowActions` を共有

### 内覧会
- 検索は回をまたぐ。正規化は `inview/logic.ts` の `normalizeForSearch`（NFKC→小文字→かな→区切りを落とす）1本
- 同行者は1人ずつ受付（`POST /inview/:id/companions/:companionId/check-in`）。人数は組数ではなく `headOf()`
- スマホは検索欄だけ残し、説明・並び替え・会社別のまとめは `MobileFilterBar` のシートへ。CSV はスマホに出さない。PC は変えない。並び替えは `FilterChips` にしない（件数が出せない）
- `?scope=upcoming` を初期値で読む（ホームのバッジと揃える）。案件化は `POST /inview/:id/promote`、取込は MCP `register_inview_attendee`

### 問い合わせ（migration 171 / 247 / 292）
- `state` は6つ（`unsorted`／`stock`／`ticket`／`project`／`dropped`／`booked`）で正はこれ1本（`handled_at` で絞らない）。タブは3つ 本日対応／保留／仕分け済み（`state.ts`）
- 本日対応＝未処理＋見直しの日が来た保留。保留タブと重なるので足しても全件にならない
- 保留には見直す日 `stock_review_on` が要る。日を決めていない保留も机に出す。判定は `shared/src/utils/inboxDesk.ts` の `isStockReviewDue()` が正、サーバーは同じ条件を SQL で持つ（片方だけ直さない）
- 一覧は上限つき（既定50・最大200）。件数は `GET /inquiries/counts`・`/inquiries/tags`（サーバーが COUNT。運んだ行を数えない）
- 出どころ別・タグの枠は中身があるときだけ出す（`hasSourceBreakdown()`＝2経路以上）
- チケット＝`project_tasks` 1本（`source='inquiry'`・`source_ref=<id>`）を `misc_inquiries.task_id` で結ぶ。2回押しても増えない
- カレンダーに登録＝`studio_bookings` 1本（`BookingDialog`・`POST /inquiries/:id/book`・state `booked`）。項目はタイトル・日時・場所メモだけ。`予定候補` タグの行だけ主ボタン（`primaryActionFor()`）。AI は予約を作らない
- 案件はここで作らない（`/sales/projects/new?inquiry=<id>` → `POST /inquiries/:id/link-project` で書き戻し）。送ったものは `project` へ（未処理に残すと翌日また送って案件が2件できる）
- 戻しても実体（タスク・案件・予定）は消さない。そこから直接見送りにはできない（`actionsFor()`）
- AI の印は `ai_outputs`（kind=`inquiry_intake`）の有無（`is_ai`）。`source` は出どころ（mail／slack／phone／talk／manual）
- PC 専用ではない（スマホ `InquiryCards`・PC `InquiryRows`・props 共通）

### フィードバックチケット（migration 277）
- 送るのは `dailyops:reader` 全員、対応状況の更新は `editor`（editor でなくても `TicketDetailDialog` で読める）
- 絞り込みはサーバー・件数は `GET /feedback-tickets/counts`（軸ごとの総数・クロス集計しない）。既定50件＋「さらに読み込む」。0件は返ってきた行を優先して判定

### セキュリティカード
- 機材の貸出とは別台帳（用賀の24枚・migration 133）。レベルは DB の6つ（master／room_a／room_b／room_c／meeting／vip）が正。モックの3分類はまとめ方だけ採り、1枚の名前は6レベルのまま（畳むと ROOM A/B を渡し間違える）
- 「返却遅延」は「貸出中」の一部（足しても「すべて」にならない）。`?filter=`・`?card=<id>` を初期値で読む。スマホは `CardTiles`＋`Sheet`

### 受領書類
- 画面は財務管理（`client/src/contexts/finance/pages/DocumentsPage.tsx`）。API は `inbox.routes.ts`（`finance-docs`／`finance-doc-groups`／`handoff`）のまま。このアプリの `lib/inboxApi.ts` にフックを置かない（呼び手ゼロの写しになる）
- 左メニューとホームのタイルは消さない（`dailyops` だけの人はアプリ切替に財務管理が出ない）。メニューは `tag: '財務管理'` で行き先を出す（`external` は使わない）

### 探す
- 受付の道具（来場予約／セキュリティカード／問い合わせ）。正規化は `normalizeForSearch` を使う（写さない）。3本とも小さい表なので開いた時点で引く
- 打つ前に左メニューの写しを出さない。出すのは今日の回・貸出中のカード・未処理の情報だけ（0 は出さない）
- カードは `?card=<id>` で選んだ状態で開く。問い合わせの行はスマホでも押せる

## 触るときの注意

- 検査: `npx tsc -b client-daily`・`npx eslint client-daily`・`npm run lint`・`npm run test`（`shared/tests/keepReport*.test.ts` が隔週キープの数字を守る）
- 画面を足したら `src/pcOnlyScreens.ts` の `DAILY_PC_ONLY` か `DAILY_MOBILE_OK` へ（M2。無いと `npm run lint` が止まる）。PC 専用は「資料をつくる」の1枚。表は空でも消さない（`scripts/check-mobile-declared.mjs` が `App.tsx` と突き合わせる）。M2／M8／M9 は [mobile.md](../docs/design/v4/mobile.md)
- 1ファイル400行が上限（`docs/v4-plan.md` B-4・`scripts/check-file-size.mjs`）。いま超過なし（最大 `InquiriesPage.tsx` 367）。超えたら役割で分ける（`inview/{DayRow,SearchHits}.tsx` の切り出し方）
- `html`／`body`／`#root` は触らない（`shared/src/client/base.css`・F2）。`index.css` はそれを import してアプリ固有だけ
- 一覧の行は `inview/DayRow.tsx` を写す: `<Row divider interactive>`＋`<RowMain>`（唯一伸びる）＋`<RowSlot w>`（`SLOT_WIDTHS` 56/72/96/128/160/200/240）。空は `Delayed`＋`SkeletonRows`／`EmptyState`／`NoSearchResults`、確認は `confirmAction`、結果は `notifySuccess`／`notifyApiError`（`window.confirm`／`alert` 禁止）
- 行ぜんぶをリンクにするなら `stackOnMobile` を使わない（`Row` 直下の `RowMain` を狙うので `<Link>` が挟まると効かない）。畳む列は `hideOnMobile`、落とした数字は `RowSub`。スマホは列を消さずカードに組み直す（`DayCards`／`NewsCards`／`CardTiles`／`InquiryCards`）
- `TableBadge` は折り返さない（長い文字は `truncate`）。`useIsMobile()` は薄い親で1回・境界 1023px（`shared/CLAUDE.md`）

## 残作業

- `src/index.css` の計時LIVE由来の未使用クラス（`.timer-*`／`.viewer-*`／`.phase-*`）を消す
- `nav.ts` のコメントが根拠にする `MyTasksSummarySection.tsx` は無い（導線は `client/src/contexts/platform/pages/home/{AppTiles,TaskHubCard}.tsx`）
- AI の器の現状は `.claude/skills/ai-feedback-loop/references/onair-current-state.md`
- ⚠️ 要確認: `inquiries/SidePanels.tsx` の但し書き「取込側が `source`／`tags` を渡していない」は古い可能性（MCP `record_inquiry` は両方を受け、mail-intake は `source` を渡す）。枠を出す条件自体は現役
- ⚠️ 要確認: 呼び名が「問い合わせ」（`nav.ts`・`InquiriesPage` の見出し）と「入ってきた情報」（`pcOnlyScreens.ts`・`state.ts`・設計文書）で割れている

## 経緯の記録

[docs/reviews/daily-equipment-build-log.md](../docs/reviews/daily-equipment-build-log.md)
