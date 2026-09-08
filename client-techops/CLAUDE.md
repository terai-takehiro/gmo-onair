# client-techops — 制作技術支援（凍結解除中・作り直し進行中）

台本作成・本番進行・スケジュール表・収録/配信設定・レンタル機材検索・計時・視聴者・テロップCG を束ねる
大アプリ（ホームの「日々の業務」側）。「凍結解除中」の定義は [docs/v4-plan.md](../docs/v4-plan.md) の「用語」。
経緯・当時の実測は [docs/reviews/techops-build-log.md](../docs/reviews/techops-build-log.md)（ここは現役ルールだけ）。

## 役割と入口

| 項目 | 値 |
| --- | --- |
| ディレクトリ・ポート | `client-techops/`（旧 `client-qsheet/`）・5174。既定の `dev`/`typecheck`/`build` には入らない（`dev:techops`・`typecheck:all`・`build:all`） |
| ベースパス | `/techops/`。**旧 `/qsheet/*` は全ルートを転送で生かす**（`App.tsx` の `RedirectQsheetToTechops`。接頭辞だけ置換・クエリ維持）。サーバーも同じ `dist` を `/qsheet` と `/techops` で二重配信（`server/src/app.ts`） |
| `/techops` の行き先 | `src/routeSwitch.ts` の1行（いま `'top'`）。`/top`・`/home`・`/sheets` は常に3つとも存在する |
| `AppKey` | `techops`（`shared/src/client/apps.ts`）。**`permissionModule` は `qsheet` のまま変えない**（利用者の権限 JSON のキー） |
| API・サーバー | `/techops/*` と `/qsheet/*` の二重マウント（`server/src/routes/index.ts` → `createQsheetRoutes(prefix)`）。`server/src/contexts/{qsheet,liveops,graphics}` |
| DB | `qsheet_*`・`liveops_*`・`graphics_*` のまま（改名しない） |
| Socket.IO | 台本・本番進行は `/techops`（`src/lib/socket.ts`）。旧 `/qsheet` も同じサーバーが待ち受け、`broadcastToRoom()`（`server/src/contexts/qsheet/socket.ts` の `NAMESPACES`）で常時相互中継。テロップCGは `/graphics`（`cg:*`）、計時は `/liveops` |
| MCP | `get_sheet` / `find_similar_sheets` / `create_sheet` / `propose_sheet_draft` / `discard_sheet_proposal`。旧名（`get_qsheet` 等）も同じ実装で二重登録（`server/src/contexts/mcp/tools/production.tools.ts`・`gate.ts`）。一覧は [docs/mcp-server.md](../docs/mcp-server.md) |
| 画面に出す名前 | `MINI_APPS[].label`（`shared/src/production/miniapps.ts`）だけ。「Qシート」「qsheet」は内部識別子にのみ残す |

改名の残り（`permissionModule`・DB・Socket.IO `/qsheet` とMCP旧名・二重マウントの撤去時期）は**未決**。
判断材料は [migration-plan §6](../docs/reviews/qsheet-techops-migration-plan.md)。

## 画面一覧（URL → ファイル）

正は `src/App.tsx`。導線は **番組・案件を選ぶ → ハブ → ミニアプリ**（タイルをトップに直接並べない）。
左メニュー・スマホ下タブは `components/layout/nav.ts` の `buildQsheetNav` が **pathname と `lib/productionNavContext.ts`
のストア**から動的に組む（`useParams()` は使わない）。

| 区分 | URL | ファイル | メモ |
| --- | --- | --- | --- |
| トップ | `/techops/top` | `pages/ProductionTopPage.tsx` | ①案件管理の案件（`/lookup/gls-options`）か ②ここだけの番組（`qsheet_programs`） |
| | `/techops/home` | `pages/TopPage.tsx` | 進行台本の案件選択。nav から外れたが URL は生かす |
| ハブ | `/techops/projects/:id`・`/programs/:id`・`/docs/:id` | `pages/JourneyPage.tsx` | `scope` = project / program / document。タイル `components/journey/MiniAppTiles.tsx`・切替 `MiniAppSwitcher.tsx` |
| 進行台本 | `/techops/sheets` | `pages/SheetListPage.tsx`・`pages/sheets/*` | 一覧（`?project=`/`?program=`）。`/techops/editor`（id無し）はここへ転送 |
| | `/techops/editor/:id` | `pages/EditorPage.tsx`・`components/editor/*` | 台本作成。PC専用。Excel は `components/excel/*`・`lib/excel/` |
| 本番（シェル無し） | `/techops/onair/:id`・`/rundown/:id`・`/prompter/:id` | `pages/{OnAir,Rundown,Prompter}Page.tsx` | PC専用。進行は実尺を `qsheet_cue_actuals` へ記録（`hooks/useCueActualsRecorder.ts`） |
| | `/techops/audio/:id` | `pages/AudioSupportPage.tsx` | 音声サポート。**公開・認証なし**・スマホ |
| スケジュール表 | `/techops/schedules`・`/schedules/:id` | `pages/schedule/*`・`components/schedule/*` | 第2版の計画と進捗は [14-schedule-v2-plan.md](../docs/design/v4/qsheet-v4-coding/14-schedule-v2-plan.md)。**触る前に読む** |
| | `/techops/settings/schedule-templates` | `pages/schedule/ScheduleTemplateSettingsPage.tsx` | 工程テンプレート。system_admin だけ nav に出す・PC専用 |
| 収録・配信設定 | `/techops/recording/:ownerKey`・`/streaming/:ownerKey` | `pages/recording/*`・`pages/streaming/*` | 案件に1セット（`kind: 'panel'`）。書き出し・コピーは `pages/settings-export/*`。旧 `/device-settings` 入口は廃止（`pages/device-settings/DeviceSettingsHome.tsx` はルート無しで残す・導線を戻さない） |
| レンタル機材検索 | `/techops/rental/:ownerKey`（`/list`・`/mail/:company`） | `pages/rental/*` | データは `rental-scraper/` → `qsheet_rental_items`（[README](../rental-scraper/README.md)・[設計](../docs/design/v4/rental-search/README.md)）。検証VPSは `SKIP_RENTAL_SEED=true` |
| 計時・視聴者 | `/techops/live/:ownerKey`（`/timers`・`/settings`） | `pages/live/*`・`components/live/*` | `client-live` から移植した運用画面。表示画面は `client-live` の `/live/display/:timerId`（[client-live/CLAUDE.md](../client-live/CLAUDE.md)） |
| | `…/timers/:timerId/layout`・`/techops/live-display-templates` | `pages/live/LiveDisplayLayoutEditorPage.tsx`・`LiveDisplayTemplateLibraryPage.tsx` | 表示レイアウト編集（PC専用）・全案件横断のテンプレート（[13](../docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md)） |
| | `/techops/live-org-settings` | `pages/live/LiveOrgSettingsPage.tsx` | 組織の鍵設定。`:ownerKey` 無し・manager・PC専用 |
| | `/techops/live-legacy` | `pages/live/LiveLegacyProgramsPage.tsx` | 案件にも番組にも紐づかない既存 `liveops_programs`（両方 NULL）の一覧。**新規作成ボタンは無い**・manager・PC専用 |
| テロップCG | `/techops/graphics/:ownerKey` | `pages/graphics/GraphicsHubPage.tsx` | ①一覧＋右パネル（PC）／⑥閲覧＋緊急CLEAR（スマホ・同じURL） |
| | `…/live`・`…/settings`・`…/templates` | `GraphicsConsolePage`・`GraphicsSettingsPage`・`TemplateManagerPage` | ②本番モード・④設定（4タブ）・上級者向け。PC専用 |
| | `…/request` | `pages/graphics/RequestFormPage.tsx` | ⑤依頼（スマホ最優先） |
| | `/techops/graphics/output/:projectId` | `pages/graphics/GraphicsOutputPage.tsx` | 出力。**公開・認証なし・シェル無し・1920×1080** |
| | `/techops/graphics/awards-migration` | `pages/graphics/AwardsMigrationPage.tsx` | 旧リアルタイムCGの過去実績の移行。system_admin（画面内ゲート）・PC専用 |
| | `…/parts`・`…/sounds`・`…/interactive-link` | 転送のみ | 旧独立画面 → ハブ／設定 `?tab=link` |
| AI | `/techops/ai-knowledge` | `pages/ai-knowledge/*` | `qsheet_ai_knowledge` の承認（閲覧 reader・操作 manager） |

## 壊してはいけない契約

- **本番の5URL**（`editor` / `onair` / `rundown` / `prompter` / `audio`）**と旧 `/qsheet/*` の全ルート・API・Socket.IO。**
  ブックマーク・配布済みQR・OBS のブラウザソースが指している。撤去しない（基準は上記 migration-plan §6）
- **公開・認証なしの画面に認証を付けない**: `/techops/audio/:id`（旧 `/qsheet/audio/:id` も）・`/techops/graphics/output/:projectId`。
  `src/lib/api.ts` の `publicPaths` に登録済み。サーバーは `public-audio.routes.ts`・`graphics/routes/public.routes.ts`
- **音声サポートの `?token=` は発行・失効の管理だけ**（`qsheet_audio_shares`・`audio-share.service.ts`）。**パスは資料IDのまま変えない**
  （Socket.IO の room が資料IDのため）。トークン無しの旧URLは `ACCEPT_LEGACY_AUDIO_ACCESS` で受け入れ `components/LegacyUrlBanner.tsx` を出す。
  公開 API は `masters.persons`/`micTypes` を台本に出る名前だけに絞る（`shared/tests/qsheetAudioSharePayload.test.ts` が固定）
- **Socket.IO のブリッジ**: `/techops` と `/qsheet` の同名ルームへ常に相互転送（`yjs:update` / `awareness:update` / `presence:sync` /
  `cue:update|sync|next|prev|jump|play|pause|reset`）。実地検証は `scripts/dev-verify/socket-bridge-check.mjs`。
  テロップCGは別名前空間 `/graphics` の `cg:sync|set|continue`（`cue:*` と混ぜない）
- **MCP の旧ツール名の二重登録を外さない**（撤去は `mcp_audit_log` の観測と外部連携先の確認で判断）
- **`qsheet_documents.data`（JSONB）は Yjs の所有物**（`qsheet_doc_yjs`・`server/src/contexts/qsheet/collab.ts`）。サーバーは書かない
  （新規 INSERT だけ例外）。書き込みはクライアントの `applyDataUpdate(ydoc, prev => next)`（`lib/collab/ydocDiff.ts`）。
  `updater` は必ず `prev` の関数にする（定数を返すと同時編集で入った行が消える）
- **本番中は AI を呼ばない。** 実尺の記録は best-effort（落ちても本番を止めない）

## 決めごと（現役ルール）

### 入力欄は素の `<input value onChange>` で書かない
台本の内容を編集する欄は **`BufferedInput` / `BufferedTextarea`**（`components/editor/BufferedInput.tsx`・`cells/BufferedTextarea.tsx`、
中身は `lib/useBufferedValue.ts`）。value が返るのは1レンダー後なので、素の controlled input だと IME 変換中の文字が二重に入る。
**型でも lint でも気づけない。** 確かめ方は `npm run verify:ime`。`<select>`・数値・日付の欄はそのままでよい。

### 全ての section / row は `id` を持つ
差分器 `lib/collab/ydocDiff.ts` は `id` を鍵に prev と next を突き合わせる。無いと編集のたびに全部が追加され倍々に増える。
新しく作るときは **`genId("sec")` / `genId("row")`**（`lib/stableIds.ts`）。`updateData` は `applyDataUpdate` を通す
（①Y側の id 無しを埋める → ②prev を読む → ③next に id を付ける。順番を崩さない）。テスト: `shared/tests/qsheetCsvImport.test.ts`。

### 番組・案件と owner
- **`qsheet_programs`（migration 227）が「ここだけの番組」。** 進行台本・スケジュール表・収録/配信設定は `project_id` と対称の
  `program_id` を持てる（同時には持たない。収録/配信は `num_nonnulls(project_id, doc_no, program_id) = 1` の CHECK）
- **owner の解決は `server/src/contexts/qsheet/device-settings-owner.ts` の `Owner` 型が唯一の正**（`kind: 'project' | 'program' | 'doc'`）。
  `:ownerKey` は GLS番号・案件ID・番組IDのどれでも通る。ミニアプリを増やすときもこの型に分岐を足す
- `JourneyResponse.project` は番組でも同じ形（`glsNumber` は `null`・`shared/src/production/journey.ts`）。`production_journey_marks.scope_type` に `'program'`
- **ミニアプリの登録は `shared/src/production/miniapps.ts` の `MINI_APPS` だけ**（`kind: 'document' | 'panel'`。`docPrefix`/`docNoSeq` は変えない）。
  サーバー側の複製 `server/src/shared/production/miniapps.ts` との一致は `scripts/check-collab-parity.mjs` が検査
- 計時: `liveops_programs` は `project_id` か `qsheet_program_id`（migration 237）で owner を引く。`pages/live/useLiveProgram.ts` が
  `POST /liveops/programs/resolve-by-project/:id` / `resolve-by-program/:id` を呼び分ける。ゲートは `qsheet` reader、**まだ無いときの
  INSERT だけ manager**。権限区画 `liveops` は `qsheet` に統合済み（migration 232）。`components/live/*` は `client-live` の複製、
  Socket は `shared/src/client/live/{socket,useTimer}.ts`（表示画面用の `client-live/src/lib/socket.ts` とは別）

### UI 統一の規約（2026-09-08〜）
- **外枠は `<PageShell>`**（`shared/src/client/ui/pageShell.tsx`。幅は `full` / `narrow` の2段だけ）、**画面の名前は `<PageHeader>`**。
  正は [docs/design/v4/_rules.md](../docs/design/v4/_rules.md) の「5. ページの外枠」
- 画面を1つでも触るときは**この形に寄せてから**直す。中間の幅（`max-w-4xl` 等）・`<h1>`・`env(safe-area-inset-bottom)` をページ側で書かない
- `npm run lint`（`scripts/check-ui-tokens.mjs`）の `page-width-by-hand` / `page-h1-by-hand` / `page-safe-area-by-hand` /
  `page-shell-missing`（このアプリだけ）が**増えたら止める**。棚卸しと残りは [techops-ui-unification-plan.md](../docs/reviews/techops-ui-unification-plan.md)

### 見た目の作り直しが終わるまでやってはいけないこと
- v4 の共通部品（`Row` / `Money` / `DateRange` など）で**既存画面を書き換えない**
- **トーストを帯（`NoticeBar`）に置き換えない。** `src/lib/notify.ts` 経由で多数使い、放送中の「放送同期が切断されました」も含む。
  import は深いパス `@gmo-onair/shared/src/client/ui/{use-toast,toaster}` の名指し。`main.tsx` の `<Toaster />` はシェルと別に置いたまま
- **表本体**（`CueTable.tsx`・`CueRow*.tsx`・`components/editor/cells/*`）・`EditorSidebar*.tsx`・モバイル編集（`CueCard*`・`CueRowMobile*`・`CueRowSheet`）は別 PR で
- **`index.html` の Google Fonts（Noto Sans JP / Noto Serif JP / Roboto Condensed）を外さない。** 生の `fontFamily: 'Roboto Condensed'` が
  `components/editor/{EditorSidebar,MicAssignmentCell,CueTable,PreviewModal}.tsx`・`pages/onair/onairFormat.tsx`・`pages/{OnAir,AudioSupport}Page.tsx`・
  `pages/graphics/ranking*` に残る。Noto Serif JP 800/900 はテロップCGの出力用
- ⚠️ **本番中に使う4画面（`OnAirPage` / `RundownPage` / `PrompterPage` / `AudioSupportPage`）とそこから呼ばれる部品に触らない。**
  `App.tsx` の「Full-screen pages without AppShell」＝共通シェルの対象外。本番3画面は `<html class="dark">` で `tokens-v4.css` の `.dark`
  を使う（`verify:ui` は `dark: true` で測る）
- 不具合の修正は通常どおり行ってよい

### AI 機能
`components/ai/*`・`pages/ai-knowledge/*`・サーバー `ai-*.routes.ts`。**AI の出力は `data` に直接書かず `qsheet_ai_proposals` に置き**、人が取り込む。
MCP の制作系ツールは OAuth actor 専用（静的 API キーは 403）。触るときはルート `CLAUDE.md` の「AIを使い捨てにしない」
（`.claude/skills/ai-feedback-loop/`）。設計は [04-ai.md](../docs/design/v4/qsheet-v4-coding/04-ai.md)・[impl/07](../docs/design/v4/qsheet-v4-coding/impl/07-ai-proposals-impl.md)。

## 触るときの注意

- **検査**: `npx tsc -b client-techops`・`npm run lint`・`npm run test`（`shared/tests/qsheet*`・`techops*`・`graphics*`・`liveDisplayContract`）・
  `npm run verify:ui techops`・`npm run verify:ime`
- **画面を足したら `src/pcOnlyScreens.ts` の `TECHOPS_PC_ONLY` か `TECHOPS_MOBILE_OK` に入れる**（`check-mobile-declared.mjs`）。
  `<Navigate>`・`<Redirect…>` のルートは転送として数えない。`<PcOnlyGate>` はシェル配下でしか効かない（本番3画面・出力画面は宣言だけ）
- 1ファイル 400 行（`check-file-size.mjs`）。`tailwind.config.ts` は `preset` ＋ `v4Preset`（`check-shared-wiring.mjs`）
- **シェル**: `components/layout/AppShell.tsx`（`appKey="techops"`）は `shared/src/client/shell/` の薄いラッパー。**閲覧ゲートは無い**（足すなら別作業）。
  コメントに部品名を山括弧で書かない（`check-shared-wiring.mjs` が実物として数える）
- `awards-migration` の GET 2本はサーバー側が `qsheet` reader 止まり（UI は system_admin）。既知の不整合・再設計のスコープ外

## 残作業

- **表本体・`EditorSidebar`・モバイル編集の作り直し**（[06-editor.md](../docs/design/v4/qsheet-v4-coding/06-editor.md)・[impl/05](../docs/design/v4/qsheet-v4-coding/impl/05-editor-impl.md)）
- **本番系4画面の作り直し**（[07-onair-roles.md](../docs/design/v4/qsheet-v4-coding/07-onair-roles.md)）
- UI 統一の残り: `components/editor/*`・本番4画面・`components/ai/*`・`components/excel/*`・`EditorPage.tsx`・
  `shared/src/client/ui/input.tsx` の `sm:text-sm`・`verify:ui` に id 付き画面を並べる（上記計画の「まだ残っている作業」）
- Google Fonts の同梱化（上の `fontFamily` 直書きを直してから）・`PreviewModal.tsx`（印刷）の外部フォント
- スケジュール表 第2版の残り（14-schedule-v2-plan.md）・改名の残り（migration-plan §6）
- 旧リアルタイムCGの過去実績の**本番**移行は system_admin が本番アプリ上で行う（この環境からは実行できない）

## 経緯の記録・設計書

- 経緯・実測: [docs/reviews/techops-build-log.md](../docs/reviews/techops-build-log.md)。改名の Phase 1〜4: migration-plan
- 設計書の索引: [qsheet-v4-coding/README.md](../docs/design/v4/qsheet-v4-coding/README.md)・[impl/README.md](../docs/design/v4/qsheet-v4-coding/impl/README.md)
- テロップCG: [graphics-redesign.md](../docs/design/v4/graphics-redesign.md)（正・段A〜F 済み）・[graphics.md](../docs/design/v4/graphics.md)（初版）・
  [graphics-design-specs.md](../docs/design/v4/graphics-design-specs.md)・[graphics-awards-migration-plan.md](../docs/design/v4/graphics-awards-migration-plan.md)。モック `docs/design/v4/mockups/native/telop-cg/`
- 計時・視聴者: [12-live-timer-decision.md](../docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md)・13-live-display-layout-editor.md
