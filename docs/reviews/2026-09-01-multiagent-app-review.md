# 2026-09-01 マルチエージェント全方位アプリレビュー

**依頼**: 「AIエージェントをマルチに使って、アプリのバグ / コーディングの無駄 / DB・ソースの
ゴミ / UI の不体裁・バグ / サイバーセキュリティリスクなど、あらゆる観点からレビューし、修正実装する」。

## やり方（再現できるように残す）

1. **検出**: 14観点の finder を並列実行（下記）。各 finder は該当コードを実際に読み、
   file:line と根拠コード・再現手順つきでのみ報告するよう縛った。→ 生 **144 件**。
2. **重複統合**: 同一欠陥をまとめて **137 件**。
3. **敵対的検証**: 137 件それぞれに「この指摘を**反証せよ**」という検証エージェントを当て、
   呼び出し元・ミドルウェア・凍結状態まで読ませて確認できたものだけ残した
   → **確認 130 件 / 棄却 7 件**（棄却の理由は末尾に記録）。
4. **修正実装**: ファイル単位で衝突しない 21 グループに分け、各グループを
   「実装エージェント → 敵対的レビューエージェント（diff を読んで直接修正）」の2段で処理。
   全 21 グループが承認、コード修正 **111 件**を実装。
5. **掃除**: 0参照のファイル 19 本を削除、未使用依存で 38 パッケージ削減。
6. **ゲート**: `typecheck:all` / `npm test`（1941件・新規4件）/ `lint` / `build:changed` 全通過。

⚠️ **この文書自体がフィードバックループの記録**（`docs/branching.md`「マージしたら棚卸しに移す」）。
CLAUDE.md が繰り返し警告している通り、この版もエージェント主導の変更で
**人手レビューは事実上ゼロ**である。だからこそ、意図して残した判断・未検証項目を最後に明記する。

## 内訳

- **確認 130 件**: P1 17 / P2 57 / P3 56
- 観点別: dead-code-waste 17, server-sales-finance 15, client-main-state 14, perf-waste 13, client-daily-equipment-state 10, client-techops-live-state 9, server-gpm-tasks 8, db-garbage-schema 8, error-handling-500 8, server-platform-daily-equipment 7, ui-responsive-a11y 7, security-authz 6, server-production-live 5, security-injection-xss 3

## お金・セキュリティに直結した主な修正（本番実害を出しうる状態だったもの）

- **グループ請求の二重計上**（`project-groups` 削除で按分明細が残り group_id だけ外れる）→ 削除時に按分行も消す。
- **全社月次損益からグループ請求が丸ごと欠落**（全体集計だけ `group_id IS NULL` で按分を足していなかった）。
- **請求書HTMLが見積段階の売上まで合算・契約一括は¥0**（`status='confirmed'` 条件欠落＋`lump_sum_amount` 未参照）。
- **消費税が税区分・丸め設定を無視した固定10%**（請求書・見積書HTML）。
- **getSummary が見積段階の売上を粗利に含める**（`status` 条件欠落）。
- **Socket.IO の /graphics・/quiz ネームスペースが無認証**（本番CG操作・投票数/正解の改竄が誰でも可能）→ 既存の認証パターンを適用。
- **MCP 読み取りツールが権限すり抜け**（HTTP 側の read 権限を Bourne せず、財務・顧客・PII が0権限ユーザーに露出）。
- **機材の破壊的書き込みが reader 権限で通る**（複数ルートで write 権限チェック欠落）。
- **auth ミドルウェアが DB エラーを 401 に握り潰す**（DB 障害時に全ユーザーが強制ログアウト）→ 障害と認証失敗を分離。
- **計時タイマーが再接続後にルーム再参加せず凍る**（会場・OBS 表示が無言で止まる）。

## 全確認事項（130件）

| 重要度 | 場所 | 内容 | 対応 |
|---|---|---|---|
| P1 | `server/src/contexts/sales/routes/project-groups.routes.ts:141` | グループ削除で按分明細が残ったまま group_id だけ外れ、売上・仕入が二重計上になる | 修正済み |
| P1 | `server/src/contexts/finance/services/monthly-summary.service.ts:120` | 全社の月次損益からグループ請求 (按分) の売上・仕入が丸ごと抜け落ちる | 修正済み |
| P1 | `server/src/contexts/production/routes/reports.routes.ts:145` | 請求グループの請求書HTMLが status を見ずに revenues を合算し、契約一括 (lump_sum_amount) も無視する | 修正済み |
| P1 | `server/src/contexts/gpm/index.ts:79` | GPM estimate approval permanently blocked in UI: can_approve computed from deleted 'gpm' permission module | 修正済み |
| P1 | `server/src/contexts/tasks/services/intake-parser.service.ts:123` | Intake deadline parsing treats the container's UTC clock as JST: due dates a day early or already in the past | 修正済み |
| P1 | `server/src/contexts/graphics/socket.ts:29` | テロップCG の /graphics ネームスペースが無認証で本番CGを操作できる（cg:set / cg:continue） | 修正済み |
| P1 | `server/src/contexts/quiz/socket.ts:104` | /quiz ネームスペースが無認証で quiz_choices.vote_count と cue 状態を上書きできる | 修正済み |
| P1 | `server/src/contexts/equipment/routes/equipment.routes.ts:613` | 機材の破壊的な書き込み口が reader 権限だけで通る（権限の書き込みチェック漏れ） | 修正済み |
| P1 | `server/src/contexts/mcp/gate.ts:191` | MCP read tools bypass the module read-permission that HTTP enforces (financial + customer + PII disclosure to zero-permission OAuth users) | 修正済み |
| P1 | `server/src/contexts/production/routes/invoice-groups.routes.ts:193` | auto-by-recording-date can put already-billed episodes into a second invoice group (double billing) | 修正済み |
| P1 | `client/src/contexts/sales/pages/projectDetail/EstimateTab.tsx:336` | EstimateItems lacks key: toggling estimate versions can save one version's line items over another | 修正済み |
| P1 | `client-equipment/src/pages/RackLayoutPage.tsx:173` | ラック図の棚卸しモードが found にブール値を送り、INTEGER 列で必ず500 | 修正済み |
| P1 | `client-live/src/hooks/useTimer.ts:21` | Timer room is never re-joined after Socket.IO reconnect — venue/OBS timer display silently freezes | 修正済み |
| P1 | `client-techops/src/pages/PrompterPage.tsx:103` | Prompter listens for 'cue:update', an event the server never emits — prompter does not follow OnAir cue advances | 修正済み |
| P1 | `client-techops/src/pages/OnAirPage.tsx:294` | OnAir socket effect depends on next/prev/tog callbacks — full WebSocket teardown+reconnect on every cue advance and pause during live broadcast | 修正済み |
| P1 | `server/src/contexts/sales/services/keep-report.service.ts:101` | listEventReports/-Candidates run ~5-6 queries per row (N+1), fired concurrently — hundreds of queries per request | 修正済み |
| P1 | `server/src/shared/middleware/auth.ts:79` | Auth middleware swallows DB errors, turning DB outages into 401s that force-logout every active user | 修正済み |
| P2 | `server/src/contexts/production/routes/reports.routes.ts:154` | 請求書・見積書HTMLの消費税が税区分・丸め設定を無視した固定10% | 修正済み |
| P2 | `server/src/contexts/sales/services/project.service.ts:2530` | getSummary が見積段階 (status='estimate') の売上を確定売上として粗利に含める | 修正済み |
| P2 | `server/src/contexts/sales/services/estimate.service.ts:831` | convertToRevenue の版上書きが、請求書発行済み・入金済みの売上まで黙って書き換える | 修正済み |
| P2 | `server/src/contexts/finance/routes/excel.routes.ts:13` | 売上/仕入/販管費 Excel 取込の TAX_MAP に nontax (不課税) が無く、往復で tax10 に化ける | 修正済み |
| P2 | `server/src/contexts/sales/routes/project-groups.routes.ts:279` | グループ仕入/売上の PUT が部分更新契約を破る: vendor_id 省略で500、recognition_date 省略で計上日が消える | 修正済み |
| P2 | `server/src/contexts/sales/routes/project-groups.routes.ts:347` | グループ売上の明細・按分の全置換 (DELETE→INSERT) がトランザクション外で、途中失敗で明細が全損する | 修正済み |
| P2 | `server/src/contexts/finance/routes/revenues.routes.ts:522` | PUT /revenues/:id がグループ (按分) 売上の金額を按分を直さないまま変更できる | 修正済み |
| P2 | `server/src/contexts/finance/routes/revenues.routes.ts:439` | billing_key の連番採番が COUNT ベースでロック無し: 同時作成で請求KEYが重複する | 修正済み |
| P2 | `server/src/contexts/sales/routes/simulations.routes.ts:82` | シミュレーション保存の DELETE→INSERT がトランザクション外で、途中失敗すると既存データが全損する | 修正済み |
| P2 | `server/src/contexts/gpm/index.ts:374` | GPM estimate PDFs never filed to BOX: canStore checks the deleted 'gpm' permission module | 修正済み |
| P2 | `server/src/contexts/tasks/services/project-tasks.service.ts:382` | Task move/update accept a column_id from another project or a soft-deleted column — task vanishes from the kanban | 修正済み |
| P2 | `server/src/contexts/tasks/services/task-intake.service.ts:470` | commitIntake double-submit race duplicates tasks and minutes: status checked outside the transaction, task/minutes inserts carry no idempotency key | 修正済み |
| P2 | `server/src/contexts/gpm/services/gpm-estimate.service.ts:55` | GPM dashboard estimate KPIs include archived estimates the list deliberately hides, inflating 未提出/返事待ち amounts | 修正済み |
| P2 | `server/src/contexts/mcp/tools/tasks.tools.ts:49` | MCP list_tasks cross-project branch reads and sorts raw t.due_date, so due_at-only tasks appear deadline-less to the AI | 修正済み |
| P2 | `server/src/contexts/qsheet/routes/documents.routes.ts:487` | エピソード検索SQLの ESCAPE 句が括弧の外にあり、search 指定で必ず 500 になる | 修正済み |
| P2 | `server/src/contexts/graphics/services/interactive-poller.service.ts:127` | テロップCG投票ポーラーが fields を丸ごと書き戻し、送出中のオペレーター編集をロストする | 修正済み |
| P2 | `server/src/contexts/awards/routes/events.routes.ts:112` | GET /events/:id が SELECT * で interactive_link の apiKeySecret を平文でクライアントに返す | 修正済み |
| P2 | `server/src/contexts/equipment/routes/equipment.routes.ts:794` | 貸出の決めごと（equipment_settings 6項目）が画面で設定できるのにサーバー側で一切参照されない | 修正済み |
| P2 | `server/src/contexts/equipment/services/lending.service.ts:46` | 機材の二重貸出をアプリ層チェックだけで防いでおり DB 制約が無いため競合で二重貸出できる | 修正済み |
| P2 | `server/src/contexts/graphics/routes/projects.routes.ts:156` | Telop CG (graphics) write + live-broadcast-control endpoints only require qsheet:reader, contrary to the rest of the techops module | 修正済み |
| P2 | `server/src/contexts/equipment/routes/equipment.routes.ts:208` | PUT /equipment/items/batch-rental mutates equipment items at reader level (missing per-route permission) | 修正済み |
| P2 | `server/src/contexts/tasks/routes/task-columns.routes.ts:9` | Kanban task-column create/update/delete allowed at sales:reader on the HTTP path | 修正済み |
| P2 | `server/src/shared/utils/csv-export.ts:22` | CSV/formula injection in shared CSV export helper (finance & other exports) | 修正済み |
| P2 | `server/src/contexts/production/routes/invoice-groups.routes.ts:68` | Invoice-group episode linking never validates the episode belongs to the project (no DB constraint either) | 修正済み |
| P2 | `server/src/contexts/production/routes/invoice-groups.routes.ts:267` | Monthly-close buckets episodes by UTC month, not JST — completions before 09:00 JST on the 1st bill into the previous month | 修正済み |
| P2 | `server/src/contexts/finance/routes/partners.routes.ts:20` | Partners Excel import can persist invalid JSON in specialties, then every partners API 500s permanently | 修正済み |
| P2 | `server/src/contexts/sales/routes/billing.routes.ts:378` | 32 server call sites compute dates via UTC toISOString despite existing jstDate() util — overdue/doc dates wrong before 9:00 JST | 修正済み |
| P2 | `client/src/contexts/tasks/components/TaskDialog.tsx:110` | TaskDialog resync effect wipes unsaved edits when a checklist item is touched inside the open dialog | 修正済み |
| P2 | `client/src/contexts/sales/pages/projectForm/useProjectForm.ts:109` | Edit form reset() refires on every ['project', id] invalidation, discarding the user's unsaved edits | 修正済み |
| P2 | `client/src/contexts/sales/pages/ProjectDetailPage.tsx:95` | Winning a project (a_won) does not invalidate episodes/tasks/revenues that the server auto-creates | 修正済み |
| P2 | `client/src/contexts/tasks/components/EpisodesPanel.tsx:135` | Episode batch/frequency creation inserts revenue rows but never invalidates any revenues query | 修正済み |
| P2 | `client/src/contexts/sales/pages/projectDetail/EstimateTab.tsx:234` | convertToRevenue invalidates ['revenues'] which does not match the finance ledger key ['revenues-all'] | 修正済み |
| P2 | `client/src/contexts/tasks/pages/TaskDashboardPage.tsx:124` | Task complete/postpone/create from ④タスク一覧 skip the mandated episodes and task-deadlines invalidations | 修正済み |
| P2 | `client/src/contexts/sales/pages/customerDetail/ActivityFormDialog.tsx:57` | Activity saved from customer detail gets the UTC date — wrong 活動日 before 9:00 JST, with no visible field | 修正済み |
| P2 | `client/src/contexts/sales/pages/activityLog/types.ts:50` | EMPTY_FORM's default 活動日 is a UTC date frozen at module-load time; isOverdue also compares against UTC today | 修正済み |
| P2 | `client/src/contexts/sales/pages/BillingListPage.tsx:138` | Recording 入金/検収 in ⑤見積・請求 leaves the revenue ledger and project revenue pane stale | 修正済み |
| P2 | `client-equipment/src/pages/LendingListPage.tsx:91` | 貸出登録成功後にダイアログ状態が残り、次回開くと前回の機材・氏名のまま再送できる | 修正済み |
| P2 | `client-equipment/src/pages/equipmentList/useRentalToggle.ts:25` | 台帳の「貸出可」切替が存在しないキーを invalidate し、設定タブ・貸出機材・貸出ダイアログが古いまま | 修正済み |
| P2 | `client-daily/src/lib/securityCardApi.ts:178` | 「今日」を UTC で計算する箇所が残っており、JST の 0〜9時に日付の初期値と遅延判定が1日ずれる | 修正済み |
| P2 | `client-equipment/src/pages/EquipmentDetailPage.tsx:144` | 機材詳細で保存しても台帳一覧のキャッシュを invalidate しないため、戻ると旧データが最大60秒残る | 修正済み |
| P2 | `client-techops/src/lib/socket.ts:27` | getQsheetSocket singleton race: EditorPage's two consumers create two connections per mount and permanently leak the collab socket (ghost presence) | 修正済み |
| P2 | `client-live/src/hooks/useTimer.ts:16` | useRef(getLiveopsSocket()) creates sockets during render — leaks extra /liveops connections on every render before the singleton connects | 修正済み |
| P2 | `client-techops/src/components/live/ViewerPanel.tsx:67` | ViewerPanel copies programId-derived toggles into useState with no key and no resync — measurement started with the previous program's platform set | 修正済み |
| P2 | `client/src/contexts/finance/pages/ledger/RevenueItemsTable.tsx:217` | Mobile card branch squeezes 単価 CurrencyInput+税 button into a ~90px grid-cols-3 column | 修正済み |
| P2 | `client/src/contexts/sales/pages/company/CompanySummaryDialog.tsx:46` | 収支サマリー tiles: non-responsive grid-cols-3 with nowrap Money overflows at 375px; hardcoded palette colors | 修正済み |
| P2 | `client/src/contexts/tasks/components/ApplyEpisodeTaskTemplateDialog.tsx:93` | White chip text on seeded light column colors (#facc15, #4ade80) is unreadable (~1.6:1 contrast) | 修正済み |
| P2 | `shared/src/client/ui/tax-aware-amount-input.tsx:107` | Systemic: 478 of 647 <Label> usages have no htmlFor and wrap nothing — inputs programmatically unlabeled | 修正済み |
| P2 | `server/src/contexts/qsheet/routes/documents.routes.ts:45` | Document list SELECT d.* ships the full script JSONB of up to 200 documents | 修正済み |
| P2 | `client-techops/src/pages/SheetListPage.tsx:182` | 進行台本 list search fires the documents API on every keystroke with no debounce | 修正済み |
| P2 | `client/src/contexts/sales/pages/ProjectListPage.tsx:146` | 案件一覧 search fires the heavy GET /projects (3 queries, 5 LATERAL joins) on every keystroke | 修正済み |
| P2 | `server/src/contexts/sales/services/project.service.ts:2525` | getSummary aggregates the ENTIRE revenue_items table on every call | 修正済み |
| P2 | `client/src/contexts/gpm/pages/GpmProjectListPage.tsx:268` | GPM project list: per-keystroke search into an unbounded query with 6 correlated subqueries per row | 修正済み |
| P2 | `server/src/contexts/platform/routes/dashboard.routes.ts:610` | weekly-schedule runs 21 sequential queries (7 days × 3 tables) on the home page | 修正済み |
| P2 | `server/src/contexts/production/services/studio-booking.service.ts:87` | listBookings and getAvailability load the ENTIRE studio_booking_rooms table on every call, filtering in JS | 修正済み |
| P2 | `client/src/contexts/sales/pages/ActivityLogPage.tsx:166` | 活動記録 search fires the list API on every keystroke with no debounce | 修正済み |
| P2 | `client/src/contexts/finance/pages/ledger/RevenueProjectFields.tsx:42` | RevenueDialog project search hits GET /projects on every keystroke starting from the first character | 修正済み |
| P2 | `server/src/contexts/finance/routes/revenues.routes.ts:537` | PUT /revenues/:id 500s (TypeError on null) when changing tax_category on a revenue whose billing_key is NULL | 修正済み |
| P3 | `server/src/contexts/production/routes/invoice-groups.routes.ts:99` | 請求グループの PUT が非部分更新: title 省略で NOT NULL 違反の500、invoice_date/notes は黙って消える | 修正済み |
| P3 | `server/src/contexts/finance/routes/xpoint.routes.ts:127` | X-Point 取込の register に排他が無く、同時実行で同じ精算が二重登録される | 修正済み |
| P3 | `server/src/contexts/production/routes/reports.routes.ts:216` | 案件別損益CSVも status を見ずに revenues を合算し、見積段階の行が実績売上に入る | 修正済み |
| P3 | `server/src/contexts/tasks/routes/project-tasks.routes.ts:84` | Reorder endpoints iterate raw req.body without shape validation and apply per-row updates outside a transaction | 修正済み |
| P3 | `server/src/contexts/platform/services/appBadges.service.ts:63` | トップの機材バッジ（返却遅延）が returned_at IS NULL で数え、planned/lost まで遅延に含める | 修正済み |
| P3 | `server/src/app.ts:90` | CORS の許可メソッドに PATCH が無く、クロスオリジンからの PATCH がプリフライトで拒否される | 修正済み |
| P3 | `server/src/contexts/platform/routes/users.routes.ts:224` | 任意ユーザーの権限一覧が認証済みなら誰でも取得できる | 修正済み |
| P3 | `server/src/contexts/equipment/routes/equipment.routes.ts:772` | custom-values / custom-columns の失敗応答が生の DB エラー詳細を本番でも返す | 修正済み |
| P3 | `server/src/contexts/graphics/services/interactive-bridge.service.ts:63` | New authenticated SSRF surface: interactive-link baseUrl is fetched server-side without the safe-remote-url guard added for ICS (SEC-01) | 修正済み |
| P3 | `server/src/contexts/quiz/routes/quiz-public.routes.ts:15` | Public (unauthenticated) quiz output endpoints SELECT * and leak quiz_choices.is_correct before reveal | 修正済み |
| P3 | `server/src/contexts/platform/routes/data-viewer.routes.ts:182` | CSV/formula injection in data-viewer table CSV export | 修正済み |
| P3 | `client-techops/src/components/editor/PreviewModal.tsx:357` | Unescaped user-controlled cuesheet title injected into print-window HTML via document.write | 修正済み |
| P3 | `server/src/shared/db/migrations/013_interactive_schema.sql:4` | Nine interactive_* tables are schema garbage: created on every fresh DB, zero references in any server or client code | 記録のみ（本文参照） |
| P3 | `server/src/shared/db/migrations/001b_postgresql_schema.sql:223` | Write-orphan columns: purchases.external_ref_id, qsheet_rental_items.first_seen/last_updated, awards_events.module_config | 記録のみ（本文参照） |
| P3 | `server/src/shared/services/ai-output.service.ts:151` | ai_outcomes is write-only: rows are inserted but no code path ever reads the table | 修正済み |
| P3 | `server/src/shared/db/migrations/260_episode_number_unique.sql:31` | Migration 260 records success without creating the unique index when duplicates exist, and nothing ever re-checks | 修正済み |
| P3 | `shared/src/enums.ts:70` | shared TaxCategory drifted (missing 'nontax') while still feeding Revenue type used by live client pages | 修正済み |
| P3 | `shared/src/client/ui/data-table.tsx:46` | Shared DataTable (284 lines) has zero consumers in any app; only referenced by an equally-unused 5-line shim | 修正済み |
| P3 | `shared/src/client/ui/filter-bar.tsx:55` | Shared FilterBar component (143 lines) never imported by any app | 修正済み |
| P3 | `client-live/src/components/timer/TimerControls.tsx:19` | Six orphan components in client-live (~640 lines) keep chart.js + react-chartjs-2 as unused dependencies | 修正済み |
| P3 | `client/package.json:39` | recharts declared in client but imported nowhere in the workspace | 修正済み |
| P3 | `shared/src/client/ui/scroll-area.tsx:2` | Dead ScrollArea component is the only importer of @radix-ui/react-scroll-area, which client also declares unused | 修正済み |
| P3 | `client/src/contexts/production/pages/calendar/CalToolbar.tsx:30` | CalToolbar is dead (0 importers) while DesktopToolbar's comment claims 3 screens still use it | 修正済み |
| P3 | `client-techops/src/components/editor/StageDiagramEditor.tsx:27` | StageDiagramEditor is a dead 208-line duplicate of the live stage-diagram implementation | 修正済み |
| P3 | `client-techops/src/components/editor/ImageDropZone.tsx:10` | ImageDropZone kept although a neighboring file's comment documents it as dead | 修正済み |
| P3 | `scripts/deploy-webhook.js:4` | Gitea-era deploy webhook server and its systemd unit are dead leftovers from the pre-GHCR pipeline | 修正済み |
| P3 | `client-awards/package.json:12` | Unused UI dependencies: @dnd-kit trio in client-awards, @radix-ui/react-separator in client and client-equipment | 修正済み |
| P3 | `token-consumption-analysis.md:1` | Repo-root verdicts: token-consumption-analysis.md is a stale orphan snapshot; rental-scraper/ is live infrastructure | 修正済み |
| P3 | `deploy/setup-https.sh:1` | Three deploy/ shell scripts referenced by nothing (setup-https, check-db-encoding, migrate-db-encoding) | 修正済み |
| P3 | `shared/src/client/dashboard/chart-colors.ts:1` | chartColors/chartDefaults in shared dashboard module referenced by nothing except the barrel | 修正済み |
| P3 | `client-techops/src/pages/rental/RentalItemDetailDialog.tsx:1` | RentalItemDetailDialog forked between client-equipment and client-techops has drifted 165 diff lines | 修正済み |
| P3 | `shared/src/client-v4/pullToRefresh.tsx:51` | Exported usePullToRefresh hook never consumed (only the PullToRefresh wrapper is) | 修正済み |
| P3 | `client/src/contexts/finance/pages/ClosingPage.tsx:94` | Bulk 入金/検収 on the closing page misses ['revenues'] so the 案件詳細の請求カード stays stale | 修正済み |
| P3 | `client/src/contexts/finance/pages/ledger/RevenueDialog.tsx:176` | Ledger revenue save/delete does not invalidate the project detail revenue pane | 修正済み |
| P3 | `client/src/contexts/production/pages/HoldListPage.tsx:56` | 仮押さえ deadline math uses UTC today — 残りN日 off by one between 0:00 and 9:00 JST | 修正済み |
| P3 | `client/src/contexts/sales/pages/projectDetail/InvoiceGroupsSection.tsx:115` | LumpSumDialog can open with stale null initial before the invoice-group list loads | 修正済み |
| P3 | `client-equipment/src/pages/lending/LendingDialog.tsx:75` | 貸出ダイアログの案件(GLS)検索がデバウンス無しで1キーストロークごとにAPIを叩く | 修正済み |
| P3 | `client-daily/src/pages/tasks/TaskDialogs.tsx:94` | タスク編集・週次トピック編集が props→useState のまま再同期なし（既知クラスの未修正残り） | 修正済み |
| P3 | `client-equipment/src/pages/settings/LocationsTab.tsx:205` | 設定タブの編集ダイアログを下敷きクリック/Escで閉じると editingItem と入力途中の値が残る | 修正済み |
| P3 | `client-equipment/src/pages/catalog/CatalogDialog.tsx:63` | ケーブル/コネクタ新規登録で種別を切り替えると入力済みの全項目が黙って消える | 修正済み |
| P3 | `client-equipment/src/pages/RackLayoutPage.tsx:395` | 前面/背面トグルの「反対面に機材あり」ドットが表示中の1本ではなく絞り込んだ全ラックで判定される | 修正済み |
| P3 | `client-awards/src/hooks/useAwardsCue.ts:59` | sendCue calls getAwardsSocket while reconnecting — kills the socket carrying the page's sync listeners, console goes permanently deaf | 見送り（凍結アプリ） |
| P3 | `client-techops/src/pages/RundownPage.tsx:310` | Rundown fallback clock counts setInterval ticks instead of wall time — drifts and stalls under tab throttling | 修正済み |
| P3 | `client-awards/src/quiz/QuizInteractiveSync.tsx:27` | Interactive-link dropdown copies currentIqId into useState with no resync — 取込 can pull from a stale Interactive question | 見送り（凍結アプリ） |
| P3 | `client/src/contexts/production/components/episodes/businessProject/RevenueItemRows.tsx:207` | Second instance of the same mobile 単価 squeeze in the businessProject revenue editor | 修正済み |
| P3 | `client/src/contexts/finance/pages/ledger/RevenueItemsTable.tsx:157` | 17 icon-only Buttons across 10 files have no accessible name (no aria-label, title, or sr-only text) | 修正済み |
| P3 | `client/src/contexts/tasks/components/EpisodesPanel.tsx:166` | role="tablist"/role="tab" applied to toggle buttons without any tabs semantics (no tabpanel, aria-controls, or arrow-key support) | 修正済み |
| P3 | `server/src/contexts/sales/services/sales-analytics.service.ts:22` | Funnel analysis scans the projects table 5-6 times for numbers already present in its own GROUP BY | 修正済み |
| P3 | `server/src/contexts/platform/routes/dashboard.routes.ts:677` | monthly-chart issues 48 sequential queries (12 months × 4) over the same three tables | 修正済み |
| P3 | `client-techops/src/pages/live/LiveDisplayTemplateLibraryPage.tsx:123` | Display-template library search queries per keystroke | 修正済み |
| P3 | `server/src/contexts/tasks/services/my-tasks.service.ts:248` | NaN passes the limit clamp into SQL LIMIT — ?limit=abc returns 500 instead of 400 | 修正済み |
| P3 | `server/src/contexts/production/routes/calendar.routes.ts:31` | GET /calendar/events without from/to silently drops all episode events (undefined params become NULL in BETWEEN) | 修正済み |
| P3 | `server/src/contexts/awards/routes/sounds.routes.ts:67` | Public unauthenticated endpoint 500s on non-numeric :id (NaN sent to integer column) | 修正済み |
| P3 | `server/src/contexts/platform/routes/data-viewer.routes.ts:128` | Negative limit/page reach SQL LIMIT/OFFSET → 500 (also liveops log/snapshots routes) | 修正済み |
| P3 | `server/src/contexts/finance/routes/partners.routes.ts:44` | PUT /partners/:id without name → NOT NULL violation → 500 instead of 400 | 修正済み |
| P3 | `server/src/shared/middleware/errorHandler.ts:15` | errorHandler lacks res.headersSent guard — late async errors trigger a second response attempt and the original error is lost | 修正済み |

## 記録のみ（今回は消さず表に残した DB ゴミ）

- **`interactive_*` 9テーブル**（migration 013）: 全コードから0参照。ただし外部インタラクティブ連携の
  今後の受け皿の可能性があり、破壊的な DROP は本番 DB への直接影響が大きいので、この棚卸しに記録して
  **次の DB ドリフト整理でまとめて判断**する（`docs/reviews/db-drift-audit.md` と合流）。
- **write-orphan 列**（`purchases.external_ref_id` ほか）: 書かれるが読まれない列。同上、記録のみ。

## 見送り（凍結アプリ client-awards）

- `useAwardsCue` の再接続中 sendCue、`QuizInteractiveSync` の props→useState 再同期漏れ の2件は
  凍結中のリアルタイムCG（`/awards` UI）で、セキュリティ影響が無いため今回は見送り（表に残す）。

## 棄却した指摘（7件）— 反証が通ったもの

| 場所 | 主張 | 反証（要約） |
|---|---|---|
| `server/src/contexts/tasks/routes/project-tasks.routes.ts` | DELETE dependencies/:id ignores the projectId in the URL — any dependency in any project can be deleted through any project's route | The code observation is accurate (removeDependency deletes by id only, route discards :projectId, no 404 on 0 rows), but it is not a real de |
| `server/src/contexts/equipment/services/lending.service.ts` | returnLending が貸出中でない行に対して何も更新せず success を返す（返却の空振り） | The code-level observation is accurate (returnLending runs UPDATE ... WHERE id=$4 AND status='lent' without checking affected rows, and PUT  |
| `server/src/contexts/graphics/routes/images.routes.ts` | Publicly-served uploaded images lack X-Content-Type-Options: nosniff | Helmet is applied app-wide in /home/user/gmo-onair/server/src/app.ts:51 (app.use(helmet({...}))) before the internal API routes are mounted  |
| `server/src/shared/db/migrations/222_qsheet_ai.sql` | qsheet_doc_index: mic_unassigned_rows / reference_updated_by / reference_updated_at are dead columns; is_reference has no write path | The factual observations are correct (mic_unassigned_rows / reference_updated_by / reference_updated_at have no reader or writer yet; is_ref |
| `server/scripts/import-daily-news.mjs` | One-off import scripts and a 160KB data file ship in every production image via COPY server/scripts | The facts are accurate (Dockerfile:170 COPYs all of server/scripts; data file is 160,423 bytes) but the defect claim is refuted by the scrip |
| `client-awards/src/quiz/useQuizSocket.ts` | Orphan modules in frozen client-awards: useQuizSocket, FlapBlock, FlapText | The factual claim verifies: /home/user/gmo-onair/client-awards/src/quiz/useQuizSocket.ts, .../oneshot/animation/FlapBlock.tsx and FlapText.t |
| `client-equipment/src/pages/RackLayoutPage.tsx` | text-[8px] count badge (and 48 text-[10px] sites) undercut the repo's own mobile legibility floor | The anchor evidence fails on facts: the text-[8px] badge at client-equipment/src/pages/RackLayoutPage.tsx:1226 renders an inventory-mode sta |

## レビュー0件を埋めるための自己申告（意図して残した判断・未検証）

- **実ブラウザでの UI 動作確認をしていない**（375px レイアウト修正・ダイアログ再同期など）。
  検証は typecheck / 単体テスト / コード読解に留まる。実 Postgres への起動確認も各エージェントの
  ハードルール（並行実行のためサーバー起動禁止）で行っていない。
- **一部は範囲を絞って残した**: `DELETE /revenues/:id` の按分クリーンアップ、
  `estimate.service` の NULL billing_key 露出、`billing.routes:345` の UTC 既定月などは
  同型だが今回の指摘範囲外として**あえて手を付けず**、追随の候補として記録した。
- **equipment_settings は6項目中2項目のみ配線**（残り4項目は新機能が必要なため、
  「画面にあるが効かない」状態を解消せず**明示的に未実装**として残した）。
- **権限の締め直しに伴う挙動変更**: 機材 reader はカスタム列作成・カスタム値入力が不可になった、
  graphics 書き込みは manager 相当を要求、など。プロダクト判断が要る箇所は安全側（締める側）に倒した。

