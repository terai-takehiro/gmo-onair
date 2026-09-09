# 制作技術支援・計時・視聴者・リアルタイムCG — 作り込みの記録（2026-09-08 起こし）

**この文書は記録。現役ルールは各 CLAUDE.md**（[client-techops/CLAUDE.md](../../client-techops/CLAUDE.md)・
[client-live/CLAUDE.md](../../client-live/CLAUDE.md)・[client-awards/CLAUDE.md](../../client-awards/CLAUDE.md)）。

2026-09-08（v4.6.10）に3つの CLAUDE.md を「いま効くルールだけ」に書き直した。そのとき外した
**経緯・当時の実測・判断の理由・段の履歴**を、出所（どのファイルのどの節か）と時期の分かる見出しの下に
**原文のまま**置く。本文は一切手を入れていない。リンクだけは置き場所に合わせて相対パスを直した
（`../docs/…` → `../…`）。原文の中の「いま」「まだ」は、見出しに書いた時期のものであり、
現在の状態ではない。現在の状態は各 CLAUDE.md と、そこから参照する設計文書を見ること。

書き直しで落としたのは経緯と実測だけで、ルールは1つも落としていない（同じルールが新しい
CLAUDE.md に短く残っている）。ルールの出典を確かめたいときにここへ戻る。

---

## 出所: `client-techops/CLAUDE.md`（書き直し前の全文・節ごと）

### 「冒頭」 — 2026-08-22（qsheet→techops 移行 Phase 4 完了時点の記述）

**原文の表題:** 制作技術支援（Qシート・旧「制作資料」） — **v4.1 で凍結を解いた（作り直しは進行中）**

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
> [docs/reviews/qsheet-techops-migration-plan.md](../reviews/qsheet-techops-migration-plan.md)
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

### 「いまの状態（v4.1・共通シェル載せ替え後）」 — v4.1 段3〜段5 PR8（`/techops/top` の新設は 2026-08-22）


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

### 「UI の統一（2026-09-08〜）」 — 2026-09-08


「各ページのデザイン思想が統一されていない」というご指摘を受けた棚卸しと段取りは
**[docs/reviews/techops-ui-unification-plan.md](../reviews/techops-ui-unification-plan.md)**。
ページ幅8通り・`<h1>` 11通り（14〜24px）・生 `text-*` 535 か所・
黙って落ちる `font-medium`/`font-semibold` 161 か所の実測値と、A〜G のブロック分担がある。

- **ページの外枠は `<PageShell>`**（`shared/src/client/ui/pageShell.tsx`。幅は
  `full` / `narrow` の2段だけ）、**画面の名前は `<PageHeader>`**。
  正は [docs/design/v4/_rules.md](../design/v4/_rules.md) の「5. ページの外枠」
- 画面を1つでも触るときは、その画面を**この形に寄せてから**直す（旧い書き方を増やさない）
- **段0〜F は済んだ**（トップ・ハブ・進行台本一覧・スケジュール・収録・配信・計時・
  テロップCG・レンタル・設定書き出し・AIナレッジ）。ページ幅は8通り→2段、
  `<h1>` は11通り→`<PageHeader>` 1つ、生 `text-*` 535→229、`font-medium`/`semibold` 161→89
- **まだなのは `components/editor/*`・本番4画面・`components/ai/*`・`components/excel/*`・
  `EditorPage.tsx`**（いずれも表本体／本番系の禁止事項に触れるか、分担から漏れた分）。
  内訳と理由は上記の計画文書の「まだ残っている作業（次の段）」
- `npm run lint`（`check-ui-tokens.mjs`）が `page-width-by-hand` /
  `page-h1-by-hand` / `page-safe-area-by-hand` で**増えたら止める**

### 「やってはいけないこと（見た目の作り直しが終わるまで）」 — v4.1（共通シェル載せ替え時に定めたもの）


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

### 「番組・案件の選び方とミニアプリのハブ（2026-08-22・ご指示で構成を訂正）」 — 2026-08-22


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

- **スケジュール表の第2版計画（機能・UI/UX・PR の切り方）は [`docs/design/v4/qsheet-v4-coding/14-schedule-v2-plan.md`](../design/v4/qsheet-v4-coding/14-schedule-v2-plan.md)。**
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

### 「計時・視聴者（liveops）の運用画面（v4.1 段2・ミニアプリ化フェーズ2で移植）」 — v4.1 段2〜2026-08-25（migration 237）


`client-live`（別バンドル）の運用画面を、このアプリへバンドル統合する作業。
**ダッシュボード・タイマー管理に続き、番組設定・組織の鍵設定も移植した。**
詳細は [`12-live-timer-decision.md`](../design/v4/qsheet-v4-coding/12-live-timer-decision.md) §4。

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

### 「テロップCG（旧リアルタイムCGの移行先・`pages/graphics/`）」 — 2026-09-06（段A〜F）


旧「リアルタイムCG」（`client-awards/`・**廃止**）の後継ミニアプリ。ハブ（`JourneyPage`）のタイルから
`/techops/graphics/:ownerKey` へ入る。サーバーは `server/src/contexts/graphics/`（Socket.IO `/graphics`・`cg:*`）。

- **2026-09-06 に機能と UI/UX をゼロベースで再設計した。段A〜F（①一覧＋右パネル・
  ②本番モードの作り直し・③コーナー見出し＋台本から取り込む＋台本と違いますバッジ・
  ④依頼フォームの3欄化＋台本から選ぶ＋スマホ閲覧＋緊急CLEAR・⑤台本に追従＋前の番組から
  コピー・⑥旧リアルタイムCGの畳み込み）を全て実装済み。これで再設計・移行は完了した。**
  正は [docs/design/v4/graphics-redesign.md](../design/v4/graphics-redesign.md)（利用者に見せる語は
  テロップ／種類／出す順／見た目 の4つ・画面は PC 4＋スマホ 2＋出力 1・本番の動詞は TAKE／CLEAR／進める）。
  段A〜Fで実装したファイルの一覧・意図した簡略化は同文書 §11「段A 実装メモ」〜「段F 実装メモ」
  （段B〜Eはマルチエージェントのワークフローで実装・検証し、検証段の批判的レビューが
  実際に問題を検出→修正した経緯も記録してある——**段Eでは①状態帯に置くべきUI要素を
  誤って別の場所〈上段ボタン行〉に実装してしまうブロッカーを検証段が検出**。段Cはさらに、
  検証に使ったシード台本〈`seed-subapps.ts`〉自体に既存のギャップ〈テロップ/映像/音声セルが
  実編集画面と違う形・行にIDが無い〉があることも見つけている）。
  モックは同文書の冒頭のキャンバス（作業ファイル `docs/design/v4/mockups/native/telop-cg/`）
- 初版の設計（部品の思想・出力の契約・組版の数値）は [docs/design/v4/graphics.md](../design/v4/graphics.md)、
  アワード演出の移植内容は [graphics-awards-migration-plan.md](../design/v4/graphics-awards-migration-plan.md)
- 段A〜Eは1本のPRにまとめて出した（開発中は段ごとに commit・push のみで PR は都度出さず、
  「PRを」のご指示を受けてまとめて出す運用にした）。段F（旧アプリの畳み込み。
  [§13](../design/v4/graphics-redesign.md#13-旧アプリ移行中の扱い)参照）は
  検証環境で段A〜Eを確認できたことを受け、別PRで実行した。**過去実績データの本番への
  実移行（`AwardsMigrationPage.tsx`）自体は、本番へ直接アクセスできないこの環境からは
  実行できない運用上の作業として残っている**（system_admin が本番アプリ上で行う）
- 触るときの注意: `awards-migration` の GET 2本がサーバー側 `qsheet` reader 止まり
  （UI は system_admin 限定・棚卸しで見つかった既知の不整合・再設計のスコープ外）

### 「このアプリの中身」 — 2026-08-22（Phase 3 の Socket.IO ブリッジ後の記述）


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

### 「入力欄は素の `<input value onChange>` で書かない（日本語が壊れる）」 — v3.2.3 までの実測に基づく


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

### 「不変条件: 全ての section / row は `id` を持つ」 — 同時編集（Phase 2.2c）導入時の実測に基づく


同時編集の差分器（`src/lib/collab/ydocDiff.ts`）は **`id` を鍵に prev と next を突き合わせる**。
id が無い section / row は毎回「Y.Doc にまだ無いもの」と判定され、
**1 回の編集ごとに全部がもう一度追加される**（倍々に増える）。

- 実際に **CSV 取込が id を付けておらず**、取り込んだあと打鍵するたびに倍増して落ちた
  （実測: 8 回の編集で 3 → 769 ロール。20 回で百万件）
- section / row を新しく作るところでは **必ず `genId("sec")` / `genId("row")`**（`src/lib/stableIds.ts`）
- 付け忘れても壊れないよう、`updateData` は `applyDataUpdate` を通す
  （① Y 側の id 無しを埋める → ② prev を読む → ③ next に id を付ける、の順。順番を崩すと増殖する）
- 固定してあるテスト: `shared/tests/qsheetCsvImport.test.ts`（`npm run test`）

---

## 出所: `client-live/CLAUDE.md`（書き直し前の全文・節ごと）

### 「冒頭」 — 2026-08-22（改称・識別子の対応表・権限区画の統合 migration 232）

**原文の表題:** 計時・視聴者（タイマー） — **v4 対象（凍結を解いた）**

ベースパス `/live/`・ポート 5178。

⚠️ **2026-08-22、`docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` のフェーズ1・
PR-B（ミニアプリとしての導線追加と同じPR）で「計時LIVE」→「計時・視聴者」に改称した。**
**変えたのは画面表示名だけ。** コード上の識別子はどこも変えていない — 知らずに触ると
混乱するので対応表を残す:

| 識別子 | 値（そのまま） |
| --- | --- |
| ディレクトリ名 | `client-live/` |
| ベースパス | `/live/` |
| DBのテーブル名 | `liveops_programs` 等 |
| Socket.IO 名前空間 | `/liveops` |
| `localStorage` キー | `lv_display_{timerId}` 等 |
| `MiniAppKey` / `AppKey` の値 | `'liveops'` |

⚠️ **`permissionModule` / 権限区画だけは例外。** 計時・視聴者のミニアプリ化フェーズ2の
着手にあたり、`'liveops'` 区画を `'qsheet'` へ統合した（migration 232・
[`12-live-timer-decision.md`](../design/v4/qsheet-v4-coding/12-live-timer-decision.md) §9
の未決事項に対する決定）。`requirePermission('liveops', ...)` はサーバー側から全て消え、
`usePermissions.ts` / `AppShell.tsx` の判定も `'qsheet'` を見るようになった。

### 「ミニアプリ化フェーズ2（バンドル統合）進行中」 — v4.1 段2〜2026-08（リリース準備で旧運用画面を削除した時点）


**運用画面（ダッシュボード・タイマー管理・番組設定・組織の鍵設定）は `client-qsheet`
バンドルへ移植した。** 新URL `/qsheet/live/:ownerKey`（ダッシュボード）・
`/qsheet/live/:ownerKey/timers`（タイマー管理）・`/qsheet/live/:ownerKey/settings`
（番組設定）・`/qsheet/live-org-settings`（組織の鍵設定。案件に紐づかないため
`:ownerKey` を取らない・system_admin/qsheet manager向け）。表示画面用の
`shared/src/client/live/{socket,useTimer}.ts` を新設し、このアプリの
`src/lib/socket.ts` / `hooks/useTimer.ts`（**`TimerDisplayPage.tsx` 専用として
凍結**）とは別に複製した（12-live-timer-decision.md §4-2 の決定どおり、表示画面が使う
実装には1文字も触れていない）。

- **旧URLは削除せず、すべて `/qsheet/...` へのリダイレクト専用画面に差し替えた**
  （v4.1 段2・URL再設計ステージ・`src/pages/redirects/`）。並行稼働（旧URLで運用画面が
  そのまま動く）はここで終わり、以後は旧URLを開くと必ず新URLへ跳ぶ:

  | 旧URL | 解決方法 | 部品 |
  | --- | --- | --- |
  | `/live/program/:id` | `GET /liveops/programs/:id` で `project_id` を引く | `RedirectFromProgram.tsx` |
  | `/live/program/:id/timers` | 同上 | `RedirectFromProgramTimers.tsx` |
  | `/live/program/:id/settings` | 同上 | `RedirectFromProgramSettings.tsx` |
  | `/live/settings` | API 不要（`/qsheet/live-org-settings` へ即遷移） | `RedirectFromSettings.tsx` |
  | `/live/open?project=` | クエリの `project` をそのまま渡す | `RedirectFromOpen.tsx` |

  ⚠️ **`project_id` が無い（案件に紐づかない旧スタンドアロン program）場合の案内文は
  現場運用レビューで一度事故った。** 当初は「制作技術支援の案件から開き直してください」
  という `blocked` 表示を出していたが、これは**実行不可能な指示**だった —
  案件から開くと `resolve-by-project` が**別の新しい** program を作るだけで、
  この旧スタンドアロン program（そこに設定済みのタイマー・YouTube/Zoom/Teams紐づけ）
  には二度と辿り着けなくなる。いまは `client-qsheet` 側に復活させた管理者向け一覧
  （`/qsheet/live-legacy`・下記「セッション一覧」参照）へ、この program を
  あらかじめ選択した状態（`?program=<id>`）で `redirect` する（`blocked` ではなく
  実際に辿り着ける行き先を返す）。
  ⚠️ **migration 237 で `qsheet_program_id`（独自作成の番組）が増えた後は、`project_id` が
  無いだけでは「案件に紐づかない」とは限らない。** `useLegacyProgramRedirect.ts` は
  `project_id` が無くても `qsheet_program_id` があれば `/techops/live/:qsheetProgramId`
  （通常の新URL）へ送り、両方無いときだけ `live-legacy` へ送るよう分岐している。
  `RedirectOnce` は同一バンドル内専用（react-router の
  `navigate()`）なので使えず、すべて `window.location.replace()` によるハード遷移
  （`pages/redirects/RedirectStatus.tsx`）
- **`DashboardPage.tsx`/`TimerAdminPage.tsx`/`ProgramsPage.tsx`/`SettingsPage.tsx`/
  `OrgKeysSection.tsx` は削除済み**（2026-08 のリリース準備・ユーザーの明示的な指示）。
  設計（§4-3・2-X/2-Y 分割）は当初、本番リリースの観測期間を挟んでから別PRで削除する
  予定だったが、この判断を前倒しした。`OpenByProjectPage.tsx` は `RedirectFromOpen.tsx`
  への置き換え時（v4.1 段2）に既に削除済み
- **セッション一覧（旧 `client-live` の `/`・案件に紐づかない「スタンドアロン」作成）は
  廃止した。** `SessionHomePage.tsx` は削除し、`/` は案内画面（`LiveHomeNoticePage.tsx`。
  「制作技術支援の案件から開けます」＋ `/qsheet/top` へのリンク）に差し替えた
  （12-live-timer-decision.md §3-5「抜け道として残す」の撤回・ユーザーの明示的な
  上書き決定）。新ダッシュボード（`/qsheet/live/:ownerKey`）も `scope === 'project'` の
  みに対応し、案件に紐づかないスタンドアロン作成の導線は新バンドル側に持たせていない
  - ⚠️ **「新規のスタンドアロン作成を廃止すること」と「既存のスタンドアロンデータへの
    UI到達を失わせること」は別**（現場運用レビューでの指摘）。案件に紐づかない**既存**の
    `liveops_programs`（`project_id IS NULL`）は消していない以上、それを見て開く手段は
    要る。`client-qsheet` 側に `LiveLegacyProgramsPage.tsx`（`/qsheet/live-legacy`。
    qsheet manager 限定・PC専用）を新設し、一覧・視聴者ソースの読み取り専用表示・
    既存タイマーの操作（`TimerDisplay`/`TimerControls`/`ViewerPanel` を直接再利用）
    だけを持たせた。**新規作成ボタンは無い** — `SessionHomePage.tsx` の「＋新規作成」を
    復活させたのではなく、あくまで残った実データへの到達性だけを回復させたもの。
    `LiveHomeNoticePage.tsx` にも qsheet manager 向けの控えめなリンクを1本足した
- ミニアプリのタイル・ヘッダーのスイッチャー（`client-qsheet` 側の `MiniAppSwitcher` /
  `MINI_APPS` レジストリ）は**このステージでも変更していない** — 引き続き
  `path: '/live/open?project=:ownerId'`（`shared/src/production/miniapps.ts` 等）
  経由でこのアプリの `/live/open`（＝上表の `RedirectFromOpen.tsx`）を踏んでから
  新URLへ跳ぶ。新URLへの導線切り替え自体（レジストリの `path` を直接
  `/qsheet/live/:ownerId` にする等）は後続の RegistryPermissions ステージが行う

### 「いまの状態」 — 2026-08（リリース準備で `hidden: true` にした時点）


**旧運用画面（セッション一覧・ダッシュボード・タイマー管理・番組設定・設定）は共通シェル
（`shared/src/client/shell/`）・v4トークンに載せ替えた（この記述は当時のまま残す）。**
その後 v4.1 段2 で、これらの URL 自体はリダイレクト専用画面に差し替わったが、
シェル（`AppShell.tsx`/`nav.ts`）自体は上記「ミニアプリ化フェーズ2」の案内画面・
リダイレクト画面もそのまま包んでいる。`client-daily` と同じ形で、
`src/components/layout/AppShell.tsx`（設定を渡すだけ）＋ `src/components/layout/nav.ts`
（メニューの中身）に整理した。旧 `Header.tsx` / `Sidebar.tsx` は削除済み。

- `scripts/check-frozen-css.mjs` の対象からは外れた（凍結アプリの CSS 差分を機械で
  見張る対象ではなくなった。詳細は同スクリプト冒頭のコメント）
- `scripts/verify-ui.mjs` は運用画面を v4 対象アプリと同じ基準（地の色 `#f7f8fa`・
  LINE Seed JP）で見る。表示画面だけ今までどおり別基準（下記）
- `shared/src/client/apps.ts` の `frozen` は元々このアプリには付いていなかった
  （09-live-timer-impl.md の段階で先に落ちていた）。一覧・アプリ切替には既に出ている
- ⚠️ **2026-08 のリリース準備で `apps.ts` の `liveops` エントリに `hidden: true` を
  付けた**（ユーザーの明示的な指示）。運用画面が制作技術支援のミニアプリへ移植済みで、
  単独のトップページタイル・アプリ切替・左メニュー・⌘K に出す入口としてはもう不要な
  ため。**エントリ自体・`/live/` の URL・`/live/display/:timerId` は消していない** —
  ミニアプリ導線（`/live/open?project=`）と旧URLの転送はこのアプリの実体を経由するので、
  `apps.ts` からエントリごと消すと `appOfPath()` がこの URL 群を解決できなくなる

### 「⚠️ 表示画面（`/live/display/:timerId`）だけは今までどおり例外」 — 09 §8・§10 PR6 以降の記述（13-live-display-layout-editor.md §1-2 の上書き前）


**本番中に会場モニター・OBS が読む公開URL。認証を通さない。この画面だけは
「見た目を変えない」決まりのまま**（09 §8・§10 の PR6 で一度 v4 モックへ寄せた後、
運用画面のシェル統合とは無関係にこの状態を保っている）。

- **`TimerDisplayPage.tsx` は触らない。** `App.tsx` の `DisplayRouter`（`AuthenticatedApp`
  も共通シェルも一切経由しない、完全に別のルーター）も同様。URL・認証無しの挙動は
  1文字も変えていない
- 契約は `shared/tests/liveDisplayContract.test.ts` が文字列で固定している
  （`App.tsx` の `'/live/display/'` 分岐・`TimerDisplayPage.tsx` の API パス・
  `snapshots.routes.ts` の認可無し）。**このテストが通り続けること**
- `src/index.css` の `@import` は運用画面のために `tokens.css` 直読みから
  `base.css` 経由（→ `tokens-v4.css` → `tokens.css`）へ切り替えたが、
  **表示画面の地の色・文字色は元から Tailwind の生の値**（`bg-black` / `bg-[#fafafa]` /
  `text-white` 等）で書かれていて token を参照しないため、この切替の影響を受けない。
  **書体・行間・字送りだけは `body` から継承する作りだった**ので、`index.css` に
  `:has(.timer-display-font)` 等（表示画面だけが使うクラス名が目印）で書体を
  Noto Sans JP に固定する規則を足し、`TimerDisplayPage.tsx` 自体に触れずに絶縁した
- `scripts/verify-ui.mjs` の `FROZEN_PREFIX` は `/live/display/` だけを指す
  （運用画面はここから外れて v4 の基準で見る）

### 「触るときの注意」 — v4.1 段2


- **シェルは共通** (`shared/src/client/shell/`)。残っているのは
  `components/layout/AppShell.tsx`（設定を渡すだけ）と `components/layout/nav.ts`
  （メニューの中身。番組を選んでいるかどうかで `buildLiveNav(programId)` が組み立てる）
- **画面を足したら `src/pcOnlyScreens.ts` のどちらかの表に入れること**（M2）。
  `LIVE_PC_ONLY` か `LIVE_MOBILE_OK` のどちらにも入っていないと `npm run lint` が止まる。
  **`LIVE_PC_ONLY` はいま空。** 旧「組織の設定」の PC専用判断は移植先
  （`client-qsheet/src/pcOnlyScreens.ts` の `QSHEET_PC_ONLY`）に引き継いだ。
  `check-mobile-declared.mjs` は `<Redirect...>` という名前の部品を使うルートを
  転送とみなして対象から外すので、`pages/redirects/` 配下の5画面はどちらの表にも
  入れない（入れると「宣言だけ残っていてルートが無い」で lint が止まる）
- **画面**: `pages/{LiveHomeNoticePage,TimerDisplayPage}` ＋ `pages/redirects/`
  （旧URLのリダイレクト専用5画面）。旧運用5画面（`DashboardPage.tsx` 等）は
  `client-qsheet` 側に移植済みで、ファイル自体も削除済み（上記「ミニアプリ化フェーズ2」参照）
- **`/live/display/:timerId` は認証を通さない**（表示機・OBS から開く）。`DisplayRouter` が分岐している
- 視聴者カウンターは YouTube / Jstream / Zoom / Teams の合算。認証情報は暗号化して保存
- **Socket.IO** で タイマー・視聴者数を配信（`server/src/contexts/liveops/socket.ts`）
- **v4 のモックアップは表示画面のみ存在する**（`docs/design/v4/qsheet-v4-coding/mockups/live/Display.dc.html`）。
  運用画面のモックアップはまだ無い（今回のシェル統合は枠と情報設計の移し替えのみで、
  見た目自体の作り直しは別作業。`shared/CLAUDE.md`「前回の刷新が捨てられた理由」を参照）

---

## 出所: `client-awards/CLAUDE.md`（書き直し前の全文・節ごと）

### 「冒頭」 — 2026-09-06（段F）

**原文の表題:** リアルタイムCG — **廃止（→ 制作技術支援＞テロップCG。コードは参照用に保存のみ）**

⚠️ **2026-09-06 に段F を実行し、「移行中」から「廃止」へ進めた。** 後継の
**制作技術支援のミニアプリ「テロップCG」（`client-techops/src/pages/graphics/`・
`server/src/contexts/graphics/`）が段A〜E で完成し、検証環境で確認できた**ため、
[docs/design/v4/graphics-redesign.md](../design/v4/graphics-redesign.md) §12-5 で
取得済みの承認に基づき、旧アプリの畳み込みを実行した。用語の定義は
[docs/v4-plan.md](../v4-plan.md) の「用語」の節。

ベースパス `/awards/`・ポート 5179（開発サーバーの設定のみ残す。本番では配信しない）。

### 「いまの状態（2026-09-06〜・段F）」 — 2026-09-06


**「URL は生かす」がここで初めて成り立たなくなった。** サーバーの配信・API・Socket.IO・
ビルド対象・画面上の入口をすべて外し、Web サイトのどこからも到達できなくした
（コード自体は今後の参照のため削除せず残す）。

- **サーバーが配信しない。** `server/src/app.ts` の `serveApp('/awards', …)` を外した。
  `/awards/*` は専用の配信が無くなり、案件管理アプリ（ルート `client`）の SPA シェルへの
  フォールバック（実測: HTTP 200・`/` と同一の `index.html`）を経て、その
  クライアント側ルーター（`App.tsx` の `<Route path="*" element={<Navigate to="/" replace />} />`）が
  即座に `/`（ホーム）へ戻す。**文字通りの HTTP 404 ではなく、`check-links.mjs` が言う
  「黙ってホームに戻る壊れリンク」**——旧アプリの機能・見た目は一切表示されない
- **API・Socket.IO を登録していない。** `server/src/routes/index.ts` から `createAwardsRoutes()`・
  `createQuizRoutes()`、`server/src/index.ts` から `initAwardsSocketIO()` / `initQuizSocketIO()` /
  `initInteractivePoller()` の呼び出しを外した（`contexts/awards/`・`contexts/quiz/` 自体は
  ファイルとして残っている。テロップCG側の `contexts/graphics/` は完全に独立した実装なので、
  この撤去による影響はない）
- **本番イメージに入らない。** `Dockerfile` の `build-client-awards` ステージと production
  ステージへの `COPY` を外した。ワークスペース自体は `package.json` に残っている
  （`npm ci --workspaces` の対象・`typecheck:all`/`build:all`/`dev:all` は元から対象外）
- **トップページ・アプリ切替・左メニューには出さない**（移行中のときと同じ。
  `shared/src/client/apps.ts` の `frozen: true` は「一覧に出さない印」として維持）
- **過去実績データは消していない。** `awards_events`・`awards_categories`・`awards_entries`
  等のDBテーブル、`uploads/awards/` の画像・音声ファイルはそのまま残っている。
  テロップCG側の移行ツール（`AwardsMigrationPage.tsx`。設定＞連携＞過去実績の移行・
  system_admin限定）が直接このデータを読むので、`client-awards` が配信されなくなっても
  移行ツールの機能には影響しない
  - ⚠️ **本番の実データを実際に移行する（プレビュー→確認→反映）操作自体は、この
    リポジトリ側の作業のスコープ外。** 本番環境への直接アクセスができないため、
    実データが入っているかどうかもこの環境からは判定できない。system_admin 権限を持つ
    利用者が本番アプリ上で実行する運用上の作業として残っている
- `shared/src/client/apps.ts` の `APPS` エントリは今回も触っていない（前回の廃止と同じ扱い）。
  権限モデル（`permissionModule: 'awards'`）・権限とメンバー画面の表示・DB のデータビューア
  （`awards_events` 等）はそのまま動く

### 「さらに凍結・移行中へ戻したいとき」 — 2026-09-06


上の3点（`server/src/app.ts` / `server/src/routes/index.ts` / `server/src/index.ts` の関連呼び出し・
`Dockerfile` の `build-client-awards` ステージと `COPY`）を戻せばよい。過去に一度
同じ経路（廃止→凍結）を辿った実績があり、そのときの手順はこのファイルの
更に前の版（git 履歴）に残っている。

### 「ホームのタイルにも出したいとき」 — 2026-09-06


`client/.../home/AppTiles.tsx` の `EVENT_KEYS` に `awards` を足すだけでよい（画面・API・DB
スキーマのどれも変えていないので、これだけで一覧に出るようになる。ただし配信を止めた
ままだと開いても 404 になるので、上の配信を戻すことと合わせて行うこと）。

### 「廃止前の決めごと（当時の記録・コードを読むときの参考）」 — 廃止前（〜2026-09-05）の記録


- **見た目は独自完結。** `src/index.css` は `shared` の `tokens.css` を読んでおらず、
  `tailwind.config.ts` も共通 preset を継承していない（自前の CSS 変数・自前の Tailwind 設定）
- **出力画面6本（`/awards/output/*`）は放送に出る映像そのもの。** 認証を通さず、
  1920×1080 固定で描画していた（`?bg=1` で背景あり・`?audio=1` で効果音・`?lang=` で言語）
- **画面**: 操作系 `pages/{CgCockpitPage,ControlPage,OneShotControlPage,QuizStackControlPage,EventEditorPage}` /
  出力系 `pages/{Output,OutputNext,OneShotOutput,OneShotOutputNext,QuizStackOutput,QuizStackOutputNext}Page`
- 送出は OA / NEXT / TAKE / CLEAR。サーバー側は `server/src/contexts/awards/socket.ts` と
  `quiz/socket.ts`
- CG の配色・書体は `src/cg/cg.css` と `src/oneshot/styles/tokens.css` に独立して持っている
- `src/components/ui/` が無く、部品を自前で持っている

### 「デモ用ダミーデータ（`server/src/shared/db/seed-awards.ts`）」 — 2026-08-25（「廃止」から「凍結」へ戻したときに新設）


復活させても DB が空のままでは URL を開いても何も映らないため、他の `seed-*.ts`
（`seed-subapps.ts` / `seed-tasks.ts` 等）と同じ仕組みでダミーデータの投入スクリプトを
新設した（開発・検証環境の起動時に自動実行。本番は既存の仕組みどおり `SKIP_SEED=true`
のため入らない。手動投入は `npm run db:seed:awards -w server`）。

- **イベント3件**: 開催中 (`live`) の「GMO ONAiR AWARDS 2026」・終了済み (`closed`) の
  「GMO ONAiR AWARDS 2025」・準備中 (`draft`) の「第3回 GMO ONAiR AWARDS」
- **カテゴリ9本**（直接選出 `direct` 7本・投票 `vote` 2本）・**エントリ計37件**
- **クイズ2問**（正誤つき `quiz` モード1・投票のみ `survey` モード1、選択肢に投票数も投入）
- 開催中イベント (`event_id=1`) は `awards_cue_state`（`step='nominees'`）・
  `awards_oneshot_cue_state`（`is_live=true`）もあらかじめ「表示中」まで進めてあるので、
  `/awards/output/*` を開いた瞬間から実際の画面が見える
- `awards_events` に既にデータがあれば何もしない（冪等・既存データは壊さない）

### 「検証状況」 — 2026-08-25（「凍結」へ戻したときの検証）


型検査・ビルド（`client-awards` の `tsc -b && vite build`、`server` の型検査・`tsc`）に加え、
実サーバー（検証用Postgres）を起動して確認済み: `seed-awards.ts` の投入と再実行時のスキップ、
`GET /awards/events`・`/events/:id`・`/events/:id/cg-status`（`ranking.live=true`・
`oneshot.live=true` を確認）・認証なしの公開エンドポイント `/events/:id/output` がダミーデータを
返すこと、`/awards/*`・`/awards/output/1` が200で返ること。Socket.IO・`interactive-poller` も
正常起動を確認済み。**実ブラウザでの操作確認（CGコックピット・出力画面の見た目）は未実施。**

---
