# 制作技術支援（Qシート・旧「制作資料」） — **v4.1 で凍結を解いた（作り直しは進行中）**

⚠️ **2026-08-22 のご指示でアプリ名を「制作資料」→「制作技術支援」に再改名し、
大アプリ（プロジェクト管理と財務管理の間）に格上げした。** `shared/src/client/apps.ts` の
`APPS` 順とホームタイルの `DAILY_KEYS`（`client/src/contexts/platform/pages/HomePage.tsx`）を
参照。このファイル中の「制作資料」表記は旧名として残っている箇所がある。

ベースパス `/techops/`（旧 `/qsheet/`。後方互換で生かしたまま二重運用中）・ポート 5174。
**ディレクトリ名・ベースパス・`AppKey`・API prefix・Socket.IOは `techops` 対応済み**
（2026-08-22・Phase 1〜3）。`permissionModule`・DBテーブルは今も `qsheet` のまま
変えていない（MCPツール名は Phase 4 で新名に改名し、旧名も二重登録して残してある。
下記メモ参照）。

> 📝 **ディレクトリ/内部識別子リネーム進捗メモ（2026-08-22・Phase 4完了）**
> 表示名を「制作技術支援」に改名した際、ディレクトリ名 `client-qsheet/`・ベースパス `/qsheet/`・
> 内部識別子 `qsheet`（DB テーブル約90個・`permissionModule`・Socket.IO ネームスペース・MCP
> ツール名等）は `client-live` と同じ方針で意図的に据え置いていたが、
> [docs/reviews/qsheet-techops-migration-plan.md](../docs/reviews/qsheet-techops-migration-plan.md)
> の7観点監査・フェーズ計画に基づき段階的な改名に着手し、Phase 1〜4を完了した。
> - **Phase 1**: ディレクトリ名 `client-qsheet/`→`client-techops/`・ビルド設定・
>   `QSHEET_PC_ONLY`等のTS識別子
> - **Phase 2**: ベースパス `/qsheet/`→`/techops/`・`AppKey`・APIプレフィックスの二重マウント
> - **Phase 3**: Socket.IOを `/qsheet`・`/techops` 両ネームスペース対応にした。
>   **当初計画の「計画停止枠での一斉切替」ではなく「ブリッジ」方式**（両ネームスペースの
>   同名ルームへ常に相互転送する）を採った — 本番への直接アクセスができないこの環境からは
>   計画停止枠を伴う切替を実施・確認できないため、新旧混在を安全に許容する設計に変更した
>   （ユーザー確認済み）。クライアントの新規ビルドは `/techops` へ接続し、旧 `/qsheet` に
>   繋いだままの古いタブとも同期し続ける。実 Postgres・実 socket.io-client でのブリッジ
>   動作確認は `scripts/dev-verify/socket-bridge-check.mjs`（新設）で行った
> - **Phase 4**: MCPツール5本（`get_qsheet`等）を `get_sheet`等 へ改名し、旧名も二重登録した
>
> 旧 `/qsheet/*` の全ルート・全APIは後方互換で無期限に生かしたまま（`App.tsx` の
> `RedirectQsheetToTechops` がクライアント側を、サーバー側の二重マウント・Socket.IOブリッジが
> API・静的アセット・リアルタイム同期を担う）。**`permissionModule`・DBテーブルはまだ
> `qsheet` のまま変えていない**（明示的にスコープ外・`client-live` の前例どおり据え置き）。
> Socket.IOの `/qsheet` ネームスペース自体の撤去・MCPツール旧名の撤去の判断はまだ下していない
> — 同ドキュメント §6 の要判断事項を参照。

## いまの状態（v4.1・共通シェル載せ替え後）

⚠️ **「凍結解除」は段階的に進めている。段3で解いたのは「アプリ一覧・検査体系上の凍結」だけ**だった。
**段5 PR8 で外枠（ヘッダー・サイドバー・エディタ画面の外枠・共有ダイアログ）の見た目を v4 トークンに
寄せ、続く PR で `shared/src/client/shell/` への載せ替え自体を済ませた**。まだなのは
**表本体（`CueTable`/`CueRow`/`cells/*`）・`EditorSidebar` の詳細・本番3画面固有の実装**。
混同しないこと。

| 解けたもの | まだのもの |
| --- | --- |
| `shared/src/client/apps.ts` の `frozen: true` を落とした → 一覧・アプリ切替に出る（段3） | v4 の共通部品（`Row` / `Money` / `DateRange` など）への置き換え |
| `scripts/check-frozen-css.mjs` の対象から外した（段3。このアプリの CSS 差分はもう機械で見張っていない） | トーストを帯（`NoticeBar`）に置き換えること（決めて残す。下記「トーストは残す」参照） |
| `check-mobile-declared` / `check-file-size` / `check-ui-tokens` の対象に登録した（段3） | **表本体**（`CueTable`/`CueRow`/`cells/*`）・`EditorSidebar` の詳細・モバイル編集の見た目作り直し |
`/techops/home`（進行台本の案件選択）を追加。`/techops/top`（**アプリ全体のトップ・番組/案件を選ぶ**）を新設し、`/techops` の既定の行き先にした（`routeSwitch.ts` の1行で切り替え・2026-08-22。旧 `/qsheet/*` は Phase 2 で後方互換リダイレクトになった。詳細は下記「番組・案件の選び方とミニアプリのハブ」） | `EditorSidebar.tsx` / `MicAssignmentCell.tsx` / `CueTable.tsx` / `PreviewModal.tsx`（印刷）/ `OnAirPage.tsx` / `AudioSupportPage.tsx` に残る生の `style={{ fontFamily: "'Roboto Condensed',sans-serif" }}`（`index.html` の Google Fonts はこれらのため外していない） |
| `src/index.css` が `base.css` 経由（→ `tokens-v4.css` → `tokens.css`）を読むようになった（段5 PR8） | 印刷ウィンドウ（`PreviewModal.tsx`）が外部 Google Fonts を読む点の同梱フォント化 |
| LINE Seed JP が有効になった（`tokens-v4.css` の `@import` 経由。上記の直書き箇所は対象外） | 表本体・`EditorSidebar` に残る `rounded-lg` 等の未整理箇所 |
| 外枠の角丸を v4 の役割名（`rounded-control-md` 等）・`--radius` に寄せた（`AppShell`/`Sidebar`/`EditorPage` のヘッダー・情報バー） | |
| **共通シェル（`shared/src/client/shell/`）への載せ替え。** 独自実装だった `Header.tsx`/`Sidebar.tsx` を削除し、`AppShell.tsx` を `SharedAppShell`（`appKey="qsheet"`）を呼ぶ薄いラッパーに置き換えた。メニュー項目は `nav.ts` の `buildQsheetNav`（**2026-08-22 に固定4項目から動的に作り直した**。いまの案件/番組の文脈があればその子アプリへのリンクを、無ければ「トップ」だけを出す。詳細は下記「番組・案件の選び方とミニアプリのハブ」と `nav.ts` 冒頭）。`PcOnlyGate`／通知ベル／マニュアル・バージョン履歴・MCPモーダルが使えるようになった | |

- **URL は生かしたまま。** ルーティングの公開URL5本（editor/onair/rundown/prompter/audio）は変更していない。
  ブックマーク・配布済みQR・OBS の出力URL・役割別URL はすべてそのまま動く
  （**本番の業務が止まらないことが最優先**）
- `shared/src/client/tokens-v4.css` の `.dark` が**段5 PR8 から効くようになった**（本番3画面
  ＝進行・ランダウン・プロンプターは `<html class="dark">` で暗い配色のまま動いている。
  切り替えた PR で実ブラウザ／ビルド後 CSS で暗いままであることを確認すること）

## UI の統一（2026-09-08〜・進行中）

「各ページのデザイン思想が統一されていない」というご指摘を受けた棚卸しと段取りは
**[docs/reviews/techops-ui-unification-plan.md](../docs/reviews/techops-ui-unification-plan.md)**。
ページ幅8通り・`<h1>` 11通り（14〜24px）・生 `text-*` 535 か所・
黙って落ちる `font-medium`/`font-semibold` 161 か所の実測値と、A〜G のブロック分担がある。

- **ページの外枠は `<PageShell>`**（`shared/src/client/ui/pageShell.tsx`。幅は
  `full` / `narrow` の2段だけ）、**画面の名前は `<PageHeader>`**。
  正は [docs/design/v4/_rules.md](../docs/design/v4/_rules.md) の「5. ページの外枠」
- 画面を1つでも触るときは、その画面を**この形に寄せてから**直す（旧い書き方を増やさない）

## やってはいけないこと（見た目の作り直しが終わるまで）

- v4 の共通部品（`Row` / `Money` / `DateRange` など）で**既存画面を書き換えない**
- **トーストを帯（`NoticeBar`）に置き換えない。** このアプリは `src/lib/notify.ts` 経由で
  13 か所トーストを使っており、**放送中の「放送同期が切断されました」も含まれる**。
  v4 の3アプリは帯に移ったが、ここは今日のまま。見た目の作り直しのときに寄せる
  （P3 でバレルから外したので、import は深いパス
  `@gmo-onair/shared/src/client/ui/{use-toast,toaster}` を名指しする形になっている。
  `main.tsx` のトースト表示部品は共通シェルとは別に置いたまま — シェルの
  `<NoticeBar />` に統合しないこと）
- 表本体（`CueTable.tsx`・`CueRow.tsx`・`components/editor/cells/*.tsx`）とモバイル専用ファイルは
  **共通シェル載せ替えの対象外**（並行 PR が触るため）。触るのは別 PR で
- `index.html` の Google Fonts（Noto Sans JP / Roboto Condensed）は**まだ外さない**。
  `EditorSidebar.tsx` / `MicAssignmentCell.tsx` / `CueTable.tsx` / `PreviewModal.tsx` /
  `OnAirPage.tsx` / `AudioSupportPage.tsx` が今も `'Roboto Condensed'` を生の `fontFamily` で
  名指ししており、外すとそれらの数字表示が無指定フォントに落ちる
- ⚠️ **本番中に使う4画面（`OnAirPage.tsx`・`RundownPage.tsx`・`PrompterPage.tsx`・
  `AudioSupportPage.tsx`）とそこから呼ばれるコンポーネントには触らない。** `App.tsx` で
  「Full-screen pages without AppShell」と明記された、共通シェルの対象外の別ルート
  （`shared/src/client/shell/` を載せても影響しない・影響してはいけない）

不具合の修正は通常どおり行ってよい。見た目の刷新は表本体（編集画面）以降で順に進める。

## 番組・案件の選び方とミニアプリのハブ（2026-08-22・ご指示で構成を訂正）

**「まず番組・イベントを選び、そこからミニアプリへ分岐する」**のが正しい順番。
最初の実装（ミニアプリのタイルをいきなりトップに並べる案）は「押しても
どの番組の？が定まらない」ため訂正した。

```
/techops/top（ProductionTopPage.tsx・アプリのトップ）
  ① 案件管理の番組・イベント（GLS案件・/lookup/gls-options から検索）
  ② ここだけの番組（マニュアル・qsheet_programs・案件管理に登録しない番組）
       ↓ どちらを選んでも
/techops/projects/:id または /techops/programs/:id（JourneyPage.tsx・ハブ画面）
  ミニアプリのタイル（MiniAppTiles）:
    進行台本（Qシート）→ /techops/sheets?project=/program=<id>（絞り込み一覧）
    スケジュール表     → /techops/schedules?project=/program=<id>
    収録設定・配信設定 → panelPathOf('recording'|'streaming', <id>) で直接
```

（旧 `/qsheet/*` はすべて Phase 2 の後方互換リダイレクトとして生きている）

- **スケジュール表の第2版計画（機能・UI/UX・PR の切り方）は [`docs/design/v4/qsheet-v4-coding/14-schedule-v2-plan.md`](../docs/design/v4/qsheet-v4-coding/14-schedule-v2-plan.md)。**
  現状は列 0 本の表で何もできない（列を作る UI が無い）・表の設定／共有／削除が画面に無い、が最大の穴。
  段A はサーバー変更なしで既存 REST を配線するだけ。触る前に必ず読む

- **`qsheet_programs`（migration 227）が「番組（マニュアル）」の実体。** 案件（`projects`）とは
  別の軽い入れ物（id・name・event_date・notes だけ）。進行台本・スケジュール表・収録設定・
  配信設定はすべて `project_id` と対称の `program_id` を持てる（同時には持たない —
  収録設定・配信設定は `num_nonnulls(project_id, doc_no, program_id) = 1` の CHECK で強制）
- **owner の解決は `device-settings-owner.ts` の `Owner` 型が唯一の正。**
  `kind: 'project' | 'program' | 'doc'` の3択。収録設定・配信設定はここを経由するので、
  ミニアプリを増やすときもこの型に分岐を足すだけで済む
- **`JourneyResponse.project` は番組でも同じ形で返す**（`glsNumber` は常に `null`）。
  型を2つに割ると呼ぶ側の分岐が増えるため、あえて共有した
  （`shared/src/production/journey.ts` のコメント参照）
- **`production_journey_marks.scope_type` にも `'program'` を足した**（migration 227）。
  番組のハブでもピン留め（「決まった」「要注意」）が押せる
- **`TopPage.tsx`（`/techops/home`・ステージ別の件数つき案件選択）は主導線から外れた。**
  段3当時はここが「トップ」を名乗っていたが、いまは「①の別の入口候補」でしかない
  （`nav.ts` にリンクしていない・URL は生かしたまま）
- **`DeviceSettingsHome.tsx`（旧 `/qsheet/device-settings`。Phase 2 後は `/techops/device-settings`）は2026-08-22 に廃止した。**
  GLS番号・案件ID・番組IDを**手で入力**して開く旧来の簡易入口だったが、サイドバー・
  スマホタブが `buildQsheetNav`（`nav.ts`）でいまの案件/番組の文脈から収録設定・
  配信設定へ直接リンクするようになったため、手入力で遠回りする入口が不要になった。
  `App.tsx` にルートが無く、CLAUDE.md 冒頭の「廃止」の定義通りファイルだけ残っている。
  ハブ画面からは今までどおり `panelPathOf` で直接飛ぶ

## 計時・視聴者（liveops）の運用画面（v4.1 段2・ミニアプリ化フェーズ2で移植）

`client-live`（別バンドル）の運用画面を、このアプリへバンドル統合する作業。
**ダッシュボード・タイマー管理に続き、番組設定・組織の鍵設定も移植した。**
詳細は [`12-live-timer-decision.md`](../docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md) §4。

- **画面**: `pages/live/{LiveDashboardPage,LiveTimerAdminPage,LiveProgramSettingsPage,LiveOrgSettingsPage,LiveLegacyProgramsPage}.tsx`。
  ルートは `/techops/live/:ownerKey`（ダッシュボード）・`/techops/live/:ownerKey/timers`
  （タイマー管理）・`/techops/live/:ownerKey/settings`（番組設定）・
  `/techops/live-org-settings`（組織の鍵設定。`:ownerKey` を取らない）・
  `/techops/live-legacy`（案件に紐づかない既存セッション。同じく `:ownerKey` を取らない）。
  旧 `/qsheet/live/...` は Phase 2 の後方互換リダイレクトで生きている。
  `:ownerKey` は `device-settings-owner.ts` と同様 GLS番号・案件IDどちらでも通る
  （`getOwnerContext` で解決）
- **組織の鍵設定（`LiveOrgSettingsPage.tsx`）は案件に紐づかない。** system_admin/qsheet
  manager 向けの組織全体の設定（YouTube/Jstream/Zoom/Teams の API キー・資格情報）で、
  ダッシュボードのヘッダー（歯車アイコン「組織の鍵設定」・canManage のときだけ表示）から
  リンクする。**PC専用画面**として `src/pcOnlyScreens.ts` の `TECHOPS_PC_ONLY` に登録した
  （旧 `client-live` の `LIVE_PC_ONLY`「設定」と同じ理由 — 外部サービスの管理画面と
  往復しながら入力するため）。400行基準（`npm run lint`）に収めるため、節ごとに
  `PersonalTestKeysSection`/`ZoomSettingsSection`/`TeamsSettingsSection`/
  `ExportImportSection`/`ApiKeyTestControls`（接続テストボタン・取得方法ガイド）へ
  分割した（元は1ファイル。ロジック・見た目・保存の単位は変えていない）
- **番組設定（`LiveProgramSettingsPage.tsx`）は案件単位。** 旧 `ProgramsPage.tsx` の
  移植で、ダッシュボードと同じ `useLiveProgram` で owner 解決する。スマホでも開く
  （旧 `client-live` 版と同じ判断）
- **`scope === 'project'` と `scope === 'program'`（qsheet 独自の「番組（マニュアル）」）
  の両方で開ける**（2026-08-25・migration 237）。以前は `liveops_programs.project_id` が
  `projects` テーブルだけを指すFKで、`scope === 'program'` は「09完全統合案にも解決策が
  無い既知の空白」として対応していなかった（§3-5）——「独自に番組作成をした際に計時タイマーが
  表示されない」というユーザー指摘で、`liveops_programs.qsheet_program_id`（migration 237。
  `project_id` とは同時に持たない CHECK）を足して埋めた。`useLiveProgram`
  （`pages/live/useLiveProgram.ts`）が owner の `kind` に応じて「取得または作成」
  （`project` → `POST /liveops/programs/resolve-by-project/:projectId`・`program` →
  `POST /liveops/programs/resolve-by-program/:programId`）を呼び分ける（旧 `client-live` の
  `OpenByProjectPage.tsx` の役割をこの画面自身に統合したもの）。`MiniAppTiles.tsx` の
  計時・視聴者タイルも scope を問わず出すようにした。⚠️ **どちらのルートもゲートは
  `qsheet` の `reader`**（既存 program の取得までは reader/editor でも通る）。
  **「まだ program が無い」ときの新規作成（INSERT）だけ**、ハンドラ内で手動に `qsheet` の
  `manager` を要求する2段構え（v4.1 段2 レビュー対応。着手時は `canWrite`＝manager 固定で、
  reader/editor は既存セッションの閲覧すら常に 403 だった）
- **部品は `components/live/` に複製した。** `TimerDisplay` / `TimerControls` /
  `TimerSettingsPanel` / `ViewerCard` / `ViewerChart` / `chartUtils` / `format`
  （`formatTimer`/`formatCount`）— `client-live` 側の同名部品の移植（ロジック・
  見た目は変えていない）。`chart.js` / `react-chartjs-2` を依存に追加した
  （「視聴者数推移」グラフを含め機能を1つも落とさないため）
- **Socket.IO / タイマー操作は `shared/src/client/live/{socket,useTimer}.ts`
  （新設）を使う。** `client-live/src/lib/socket.ts` / `hooks/useTimer.ts`
  （`TimerDisplayPage.tsx` 専用として凍結）とは**別の複製**であり、
  表示画面側には一切触れていない
- **セッション一覧（旧 `client-live` の `/`・案件に紐づかない「スタンドアロン」作成）は
  廃止した**（12-live-timer-decision.md §3-5「抜け道として残す」の撤回。ユーザーの
  明示的な上書き決定）。`client-live` 側の `SessionHomePage.tsx` を削除し、`/live/` は
  案内画面（「制作技術支援の案件から開けます」＋ `/techops/top` へのリンク）に差し替えた
  （このバンドル側にセッション一覧・**新規**スタンドアロン作成の相当画面は移植していない）
  - ⚠️ **「新規作成の廃止」と「既存データへの UI 到達を失わせること」は別**
    （現場運用レビューでの指摘・GROUND_RULES §致命的2）。セッション一覧の廃止で、
    案件にも番組にも紐づかない**既存**の `liveops_programs`（`project_id IS NULL`。
    migration 237 で `qsheet_program_id` も足したいまは `qsheet_program_id IS NULL` も
    合わせて見る必要がある——`LiveLegacyProgramsPage.tsx` の絞り込みも両方 NULL
    で判定する）へ到達する画面がどこにも無くなっていた——旧URLの案内文「案件から開き直してください」も
    実行不可能だった（案件から開くと別の新しい program が作られるだけ）。
    `pages/live/LiveLegacyProgramsPage.tsx`（`/techops/live-legacy`。qsheet manager
    限定・`TECHOPS_PC_ONLY`）でこの一覧だけを復活させた。**新規作成ボタンは無い** —
    一覧・視聴者ソースの読み取り専用表示・既存タイマーの操作（`TimerDisplay`/
    `TimerControls`/`ViewerPanel` をそのまま再利用）だけ。`client-live` 側の
    `useLegacyProgramRedirect.ts` は、`project_id` の無い旧URLを開いたとき
    `?program=<id>` 付きでここへ `redirect` する（以前は `blocked` で
    案内文だけを出していた）
- **旧URL（`/live/program/:id` 等・`/live/settings`）は、`client-live` 側で新URLへの
  リダイレクト専用画面に差し替えた**（v4.1 段2・URL再設計ステージ。詳細は
  `client-live/CLAUDE.md`「ミニアプリ化フェーズ2」の対応表）。旧ダッシュボード等の実体
  （`DashboardPage.tsx` 等）はまだ削除していない（本番リリースの観測期間を挟んでから
  別PRで削除する設計・§4-3・2-X/2-Y分割）が、旧URLを開くと以後は必ず新URLへ跳ぶ
- **ミニアプリのタイル・スイッチャー（`MINI_APPS` レジストリ）も更新済み。**
  `liveops` エントリは `kind: 'external'`（別バンドルへの遷移）から、収録設定・
  配信設定と同じ `kind: 'panel'` に統合し、`path` を `/techops/live/:ownerKey`
  に変更した（`MiniAppTiles.tsx`/`MiniAppSwitcher.tsx` は他の panel 系ミニアプリと
  同じ `panelPathOf('liveops', id)` ＋ `<Link>` で直接このバンドル内へ遷移する。
  `ExternalMiniAppLink.tsx`・`externalPathOf`・`MiniAppKind` の `'external'` は
  他に使うミニアプリが無くなったため削除済み）。`/live/open?project=:id` は
  旧URLとして `client-live` 側にリダイレクト専用画面（`RedirectFromOpen.tsx`）の
  ままだが、ハブ画面・ヘッダー切替からはもうそこを経由しない
- **権限区画は `qsheet` に統合済み**（migration 232）。`liveops` という権限区画は
  もう存在しない — `server/src/contexts/liveops/routes/*.ts` の
  `requirePermission()` はすべて `'qsheet'` を見る

## テロップCG（旧リアルタイムCGの移行先・`pages/graphics/`）

旧「リアルタイムCG」（`client-awards/`・**廃止**）の後継ミニアプリ。ハブ（`JourneyPage`）のタイルから
`/techops/graphics/:ownerKey` へ入る。サーバーは `server/src/contexts/graphics/`（Socket.IO `/graphics`・`cg:*`）。

- **2026-09-06 に機能と UI/UX をゼロベースで再設計した。段A〜F（①一覧＋右パネル・
  ②本番モードの作り直し・③コーナー見出し＋台本から取り込む＋台本と違いますバッジ・
  ④依頼フォームの3欄化＋台本から選ぶ＋スマホ閲覧＋緊急CLEAR・⑤台本に追従＋前の番組から
  コピー・⑥旧リアルタイムCGの畳み込み）を全て実装済み。これで再設計・移行は完了した。**
  正は [docs/design/v4/graphics-redesign.md](../docs/design/v4/graphics-redesign.md)（利用者に見せる語は
  テロップ／種類／出す順／見た目 の4つ・画面は PC 4＋スマホ 2＋出力 1・本番の動詞は TAKE／CLEAR／進める）。
  段A〜Fで実装したファイルの一覧・意図した簡略化は同文書 §11「段A 実装メモ」〜「段F 実装メモ」
  （段B〜Eはマルチエージェントのワークフローで実装・検証し、検証段の批判的レビューが
  実際に問題を検出→修正した経緯も記録してある——**段Eでは①状態帯に置くべきUI要素を
  誤って別の場所〈上段ボタン行〉に実装してしまうブロッカーを検証段が検出**。段Cはさらに、
  検証に使ったシード台本〈`seed-subapps.ts`〉自体に既存のギャップ〈テロップ/映像/音声セルが
  実編集画面と違う形・行にIDが無い〉があることも見つけている）。
  モックは同文書の冒頭のキャンバス（作業ファイル `docs/design/v4/mockups/native/telop-cg/`）
- 初版の設計（部品の思想・出力の契約・組版の数値）は [docs/design/v4/graphics.md](../docs/design/v4/graphics.md)、
  アワード演出の移植内容は [graphics-awards-migration-plan.md](../docs/design/v4/graphics-awards-migration-plan.md)
- 段A〜Eは1本のPRにまとめて出した（開発中は段ごとに commit・push のみで PR は都度出さず、
  「PRを」のご指示を受けてまとめて出す運用にした）。段F（旧アプリの畳み込み。
  [§13](../docs/design/v4/graphics-redesign.md#13-旧アプリ移行中の扱い)参照）は
  検証環境で段A〜Eを確認できたことを受け、別PRで実行した。**過去実績データの本番への
  実移行（`AwardsMigrationPage.tsx`）自体は、本番へ直接アクセスできないこの環境からは
  実行できない運用上の作業として残っている**（system_admin が本番アプリ上で行う）
- 触るときの注意: `awards-migration` の GET 2本がサーバー側 `qsheet` reader 止まり
  （UI は system_admin 限定・棚卸しで見つかった既知の不整合・再設計のスコープ外）

## このアプリの中身

- **データ**: `qsheet_documents` テーブルに JSONB で台本全体を保存。同時編集は Yjs（`qsheet_doc_yjs`）
- **連携キー**: GLS番号 ＋ エピソードコード（例 `GLS002-003`）
- **PDF出力**: サーバー側 pdfkit（A4/A3・Noto Sans JP）
- **画面**: `pages/{DashboardPage,EditorPage,OnAirPage,RundownPage,PrompterPage,AudioSupportPage}`
- **シェル**: `components/layout/AppShell.tsx`（`shared/src/client/shell/` を呼ぶ薄いラッパー）＋
  `components/layout/nav.ts`（左メニュー・スマホ下タブの中身）。`Header.tsx`/`Sidebar.tsx` の独自実装は削除済み
- **本番は1つのURL＋役割**（進行／ランダウン／プロンプター／音声サポート）。
  **音声サポートだけログイン不要の公開URL**（`/techops/audio/:id`。旧 `/qsheet/audio/:id` も
  後方互換で生きている）— 認証を付けないこと
- **Socket.IO** `/techops` ネームスペース（クライアントの接続先。Phase 3 で `/qsheet` から
  改名した）。旧 `/qsheet` ネームスペースも同じサーバーが待ち受けており、両者は
  `broadcastToRoom()`（`server/src/contexts/qsheet/socket.ts`）で常に相互中継される
  ブリッジ構成——新旧ビルドが同じ台本を同時に開いていても同期が止まらない:
  OnAir↔ランダウンの同期（`cue:update/sync/next/prev/jump/play/pause/reset`）
- サーバー側は `server/src/contexts/qsheet`（`collab.ts` が Yjs の部屋を持つ）

## 入力欄は素の `<input value onChange>` で書かない（日本語が壊れる）

台本の内容を編集する欄は、**必ず `BufferedInput` / `BufferedTextarea`**
（`src/components/editor/BufferedInput.tsx` / `CueRow.tsx`。中身は `src/lib/useBufferedValue.ts`）を使う。

打つ → ドキュメント全体を作り直す → collab (Y.Doc) を経由して props が返る、という流れなので
**value が返るのは 1 レンダー後**。素の controlled input だと、変換 (composition) の途中で
React が DOM の値を古い props へ書き戻し、**変換中の文字が二重に入る**。

- 実測: LED/XR シーンで「さくら」と打つと **「ささくさくらさくら」**（v3.2.3 まで）
- **型でも lint でも気づけない。** `page.keyboard.type()` でも再現しない
  （composition が起きないため）。確かめ方は `npm run verify:ime`
  （CDP の `Input.imeSetComposition` で実際の変換を再現する）
- `<select>` と数値・日付の欄はそのままでよい（変換が起きない）

## 不変条件: 全ての section / row は `id` を持つ

同時編集の差分器（`src/lib/collab/ydocDiff.ts`）は **`id` を鍵に prev と next を突き合わせる**。
id が無い section / row は毎回「Y.Doc にまだ無いもの」と判定され、
**1 回の編集ごとに全部がもう一度追加される**（倍々に増える）。

- 実際に **CSV 取込が id を付けておらず**、取り込んだあと打鍵するたびに倍増して落ちた
  （実測: 8 回の編集で 3 → 769 ロール。20 回で百万件）
- section / row を新しく作るところでは **必ず `genId("sec")` / `genId("row")`**（`src/lib/stableIds.ts`）
- 付け忘れても壊れないよう、`updateData` は `applyDataUpdate` を通す
  （① Y 側の id 無しを埋める → ② prev を読む → ③ next に id を付ける、の順。順番を崩すと増殖する）
- 固定してあるテスト: `shared/tests/qsheetCsvImport.test.ts`（`npm run test`）
