# `client-qsheet` / `/qsheet/` / 内部識別子 `qsheet` → `techops` 移行計画

> 2026-08-22 起票。表示名「制作資料」→「制作技術支援」への改名（同日）に伴い、
> `client-qsheet/CLAUDE.md` に記録されていた「将来のディレクトリ/内部識別子リネーム候補メモ
> （2026-08-22・未着手）」を、実コードベース監査（7観点）に基づいて具体的な移行計画に
> 起こしたもの。**このドキュメントの時点ではコード変更は一切行っていない。**
> 候補名 `techops` は同メモに記載のとおり現時点でも最有力（`support`/`production`/`studio`は
> 衝突・多義で却下済み）であることを `client-qsheet/CLAUDE.md` 冒頭で再確認済み。

## 1. 背景・目的

2026-08-22、アプリ表示名を「制作資料」→「制作技術支援」に改名し、大アプリ（プロジェクト管理と
財務管理の間）へ格上げした。しかし内部識別子は一切変えていない — ディレクトリ名
`client-qsheet/`、ベースパス `/qsheet/`、`AppKey`/`permissionModule` の値 `'qsheet'`、DBテーブル
群（`qsheet_*`）、Socket.IO ネームスペース `/qsheet`、MCPツール名（`get_qsheet`/`create_qsheet`等）
は全て `qsheet` のまま残っている。この「画面は制作技術支援と言うが、コード・URL・DBは
qsheetと言う」という不一致は、`client-qsheet/CLAUDE.md` に明示メモとして記録されている状態で、
まだ着手されていない。

**この不一致自体は今のところ実害を出していない**（会社の標準パターンどおり、表示名と内部識別子は
意図的に分離できる設計になっている）。しかし将来のリネーム候補として `techops` が既に
記録されている以上、いつ着手判断が下ってもよいように、**着手前に全体の作業量・リスク・
段取りを可視化しておく**ことが本ドキュメントの目的である。

### 会社の前例との比較（詳細は §7）

| 前例 | 対象範囲 | 動機 | 結果 |
|---|---|---|---|
| `studio` → `calendar`（カレンダー） | 単一アプリ内の1ルート（`AppKey`+ルートprefix） | **実害あり**: `studio` という文字列が「アプリの旧識別子」と「実在するスタジオ予約機能（`studio_bookings`等）」の2つの意味を持ち、混乱していた | 1PRで実施。旧URLは`RedirectKeepQuery`で維持。レビュー指摘0件 |
| `qsheet`/`client-qsheet`（本件） | ディレクトリ・URL・DB・Socket.IO・MCP・別言語別デプロイの外部サービス | **実害なし**（表示名の格上げに伴う一貫性の問題のみ）、かつ`studio`と同じ「既存機能との衝突」候補（`support`/`studio`）は事前に回避済み | **未着手**。大掛かりな作業と評価され据え置き |

`studio→calendar`が実施された条件（(a) 範囲が小さい・単一アプリのクライアント側ルーティングに
閉じる、(b) 具体的な実害がある）のうち、本件は**どちらも満たしていない**（範囲は広く、実害もない）。
したがって同じ軽さで着手すべきではなく、フェーズを割った段階的な計画が必要— というのが
本計画の基本認識である。

---

## 2. スコープの全体像

7観点の監査結果を、変更量とリスク（ブラストレディウス）でまとめる。

| # | 観点 | 変更対象の実体 | 規模 | リスク評価 |
|---|---|---|---|---|
| 1 | ディレクトリ/ワークスペース | `client-qsheet/` → `client-techops/`。root `package.json`（8箇所）、`Dockerfile`（ステージ名2箇所+COPY4箇所+アップロード先注意）、`client-qsheet/package.json`名、`package-lock.json`（要`npm install`再生成）、`scripts/*.mjs`（10ファイル、うち`check-ui-tokens.mjs`9箇所・`check-contrast-tokens.mjs`8箇所の**行番号付きexact-pathキー**） | 中規模・機械的だが漏れやすい | **中**（機械的だが`server/src/app.ts:143`を見逃すと本番404） |
| 2 | フロントエンドルーティング（base path・`AppKey`）＋**5本の本番URL** | `client-qsheet/vite.config.ts:7`の`base`、`server/src/app.ts:143`の静的マウント、`shared/src/client/apps.ts`の`AppKey`/`path`、`client-qsheet/src/App.tsx`のルート定義、cross-app links（`DayTab.tsx`/`BusinessProjectView.tsx`/`shortcuts.ts`）。**2026-08-22追記**: 計時・視聴者のミニアプリ化フェーズ2で`/qsheet/live/*`系5ルートが追加され対象が増えた（§3-2・§7参照） | 中規模だが**QRコード・OBSブラウザソースという「コード外の実在物」**への影響 | **最高**（editor/onair/rundown/prompter/audioの5URL。特にprompter=OBS、audio=印刷済みQR） |
| 3 | サーバールート（API prefix `/qsheet`） | `server/src/contexts/qsheet/index.ts`の**26個の`router.use('/qsheet', ...)`**、フロント側の呼び出し約80ファイル（`api.get('/qsheet/...')`） | 大規模・機械的 | **高**（サーバー・フロント同時書換 or 二重マウント必須） |
| 4 | Socket.IOネームスペース | `server/src/contexts/qsheet/socket.ts:45`の`io.of('/qsheet')`、`client-qsheet/src/lib/socket.ts:27`の`io('/qsheet', ...)` | 小規模（2箇所）だが**同時切替必須** | **高**（ライブ配信中の即時切替＝計画停止枠が必要、旧タブは無警告で同期停止） |
| 5 | DBオブジェクト（`qsheet_*`） | テーブル25・インデックス64・制約7＝**96個**の`qsheet_`を含むオブジェクト、`user_permissions.module`等に埋め込まれた値`'qsheet'` | 巨大（1新規migrationで対応可能だが影響先は無数） | **極高**（ただし§4の通り**方針としてスコープ外**） |
| 6 | MCPツール名（外部契約） | `production.tools.ts`の8ツールのうち`get_qsheet`/`create_qsheet`/`find_similar_qsheets`/`propose_qsheet_draft`/`discard_qsheet_proposal`の5つ。`gate.ts`のキー・`docs/mcp-server.md`・`mcp_audit_log.tool_name`（永続履歴） | 小規模（1ファイル内）だが**外部エージェントの契約破壊** | **高**（プロトコルレベルのエイリアス機構が存在しない＝二重登録以外に緩和策なし） |
| 7 | クロスサービス結合（rental-scraper） | 別言語・別デプロイのPythonコンテナ（`rental-scraper/`）が`qsheet_rental_items`/`qsheet_rental_sync_requests`に生SQLで直結、`docker-compose.yml`の`QSHEET_AI_*`環境変数4個 | 小規模だが**型システムの外**で手動同期が必要 | **高**（検証環境限定・本番影響ゼロだが、DBリネームをやるなら必ず巻き込まれる） |

⚠️ **5と7はDBオブジェクトのリネームを伴うため、§4フェーズ計画では明示的にスコープ外とする**
（詳細な理由は §4 最終節）。

---

## 3. 各カテゴリの詳細

### 3-1. ディレクトリ / ワークスペース名

**何が変わる（機械的find-replaceで足りる箇所）:**
- root `package.json`: `workspaces`配列（9行目）、`dev:all`/`dev:frozen`（18-19行目）、
  `typecheck:all`（24行目）、`build:all`（26行目）、`build:render`（29行目）
- `client-qsheet/package.json:2`: `"name": "@gmo-onair/client-qsheet"` — grep確認済み、
  **他ワークスペースからの依存なし**（自己完結）
- `scripts/check-file-size.mjs:36`、`scripts/build-changed.mjs:15`: 配列エントリ1個ずつ
- `.github/CODEOWNERS:21`（コメントアウト済み、機能影響なし）、
  `.github/pull_request_template.md:84`（チェックリスト文言のみ）

**何が変わる（注意が必要・座標がずれると検査が壊れる箇所）:**
- `Dockerfile`行107-111: ステージ名`build-client-qsheet`の**定義**と、行173の`COPY --from=`
  参照が2箇所で連動。片方だけ変えるとビルド失敗。
- `Dockerfile`行178: `mkdir -p /app/uploads/qsheet` — これは**アップロードディレクトリで
  ワークスペース名とは別概念**。うっかり一緒にリネームしないこと（サーバー側の
  アップロード読み出しパスとの整合を個別に確認要）。
- `scripts/check-ui-tokens.mjs`: `V4_DIRS`配列1箇所＋`BASELINE`オブジェクトキー**9箇所**
  （645/650/655/664/670/676/691/698/711行）。`appOf()`のパス正規表現でapp名を導出しているため、
  キーが1つでもずれるとそのアプリの違反が「未ベースライン化の新規app」として検出漏れになる
  リスク。
- `scripts/check-contrast-tokens.mjs`: `APPS`配列1箇所＋`ALLOW`マップキー**8箇所**
  （64/66/68/70/72/74/76/79行、いずれも`'client-qsheet/src/....tsx:673'`のような
  **行番号付きフルパス文字列**）。ディレクトリ移動のみなら行番号は不変だが、パス接頭辞を
  8箇所すべて正確に書き換える必要あり。
- `scripts/check-mobile-declared.mjs`行47-53: `pcConst: 'QSHEET_PC_ONLY'` /
  `okConst: 'QSHEET_MOBILE_OK'` は**このスクリプトの文字列ではなく、
  `client-qsheet/src/pcOnlyScreens.ts`の実際のexport識別子名**（27/71行目、派生の
  `QSHEET_MOBILE_HIDDEN`が65行目）。ディレクトリ名だけ変えて識別子は`QSHEET_*`のまま
  残すか、識別子ごと`TECHOPS_*`に揃えるかは**要判断**（後者は`AppShell.tsx`の使用箇所も
  連動して変わる）。
- `scripts/verify-ime.mjs:58`: Viteエイリアス`@qsheet/lib` → `client-qsheet/src/lib`。
  `scripts/fixtures/ime-harness/src/main.tsx`とセットで移動が必要。
- `package-lock.json`: **手で編集しない**。ディレクトリ・`package.json`名の変更後に
  `npm install`で再生成する運用手順として明記する。

**変えてはいけないもの:** `client-qsheet/vite.config.ts`・`tsconfig.json`には
`client-qsheet`という文字列自体が存在しない（相対パス/`__dirname`ベース）ため、
ディレクトリ名変更単体ではこの2ファイルへの変更は不要。

**後方互換要件:** ディレクトリ名はビルド時にのみ意味を持ち、実行時の外部露出はない
（`server/src/app.ts:143`だけが実行時にディレクトリ実体を参照する—次項）。したがって
**このカテゴリ単体には後方互換の要件はない**。CIの`typecheck`/`lint`/`test`が通れば
リリース可能。

### 3-2. フロントエンドルーティング（base path・`AppKey`）と5本の本番URL

**何が変わる:**
- `client-qsheet/vite.config.ts:7`の`base: '/qsheet/'`
- `server/src/app.ts:143`: `serveApp('/qsheet', path.join(__dirname, '../../client-qsheet/dist'))`
  — **監査全体で最高リスクの1行**。ここを見逃すと本番が即404になる（CIでは検知できない、
  実機デプロイ後に初めて壊れる種類の不具合）。
- `shared/src/client/apps.ts`: `AppKey`ユニオン型の`'qsheet'`（115行目）、`APPS`エントリの
  `key`/`path`（172行目）
- `client-qsheet/src/App.tsx`・`routeSwitch.ts`・`lib/api.ts`の`loginPath: '/qsheet/login'`
- `shared/src/production/miniapps.ts`の`docPath`等のパステンプレート — **サーバー側に
  パリティ検査対象の複製**（`server/src/shared/production/miniapps.ts`、
  `scripts/check-collab-parity.mjs`が検査）があるため**両方同時に変更しないとビルドが
  失敗する**。
- cross-app links: `client/src/contexts/sales/pages/projectDetail/DayTab.tsx`
  （`href={`/qsheet/projects/${projectId}`}`・`api.get('/qsheet/documents', ...)`・
  `hrefOf={(d) => `/qsheet/editor/${d.id}`}`）、
  `client/src/contexts/production/components/episodes/BusinessProjectView.tsx`
  （`<a href={`/qsheet?project=${projectId}`}>`）、
  `client/src/contexts/platform/pages/search/shortcuts.ts`
  （`{ key: 'qsheet', to: '/qsheet', module: 'qsheet', external: true }`）
- ⚠️ **2026-08-22（PR #327）でスコープが増えた**: `client-live`（計時・視聴者）の運用画面
  （ダッシュボード・タイマー管理・番組設定・組織の鍵設定・旧セッション一覧）が
  「ミニアプリ化フェーズ2」で`client-qsheet`へバンドル統合され、`/qsheet/live/:ownerKey`・
  `/qsheet/live/:ownerKey/timers`・`/qsheet/live/:ownerKey/settings`・
  `/qsheet/live-org-settings`・`/qsheet/live-legacy`の5ルートが増えた（詳細は§7の
  「liveopsのqsheetへの統合」）。これらは収録設定・配信設定・レンタル検索と同じ
  「管理系ミニアプリ」の扱いで、5本の本番URL（下表）ほどの最高リスクではないが、
  Phase 2（§4）の対象に含める。

**5本の本番URL（`client-qsheet/CLAUDE.md`が「やってはいけないこと」として明示ロックしている
4画面が全て該当）:**

| ルート | 画面 | 実世界での依存 |
|---|---|---|
| `/qsheet/editor/:id` | `EditorPage` | ブックマーク・共有リンク |
| `/qsheet/onair/:id` | `OnAirPage`（全画面） | オペレーター画面のブックマーク/固定タブ |
| `/qsheet/rundown/:id` | `RundownPage`（全画面） | 同上 |
| `/qsheet/prompter/:id` | `PrompterPage`（全画面） | **OBSブラウザソースURL**（リポジトリ外のOBSシーンファイルに直書き） |
| `/qsheet/audio/:id` | `AudioSupportPage`（未認証公開） | **QRコード**（`AudioShareDialog.tsx`が生成・既に配布済みの印刷物は事後訂正不可能） |

**変えてはいけないもの:** `permissionModule: 'qsheet'`。これは`permissions` JSON列の
キーとして**既存ユーザーの保存済み権限データそのもの**に使われている（`canOpenApp`が
`permissions?.[app.permissionModule]`で参照）。`key`/`path`だけを`techops`にし、
`permissionModule`は`qsheet`のまま残すのが、`calendar`（`permissionModule: 'sales'`のまま）
と同じ既存パターン。

**後方互換要件:**
- `RundownPage`/`OnAirPage`/`PrompterPage`はSocket.IOで放送中にライブ同期している。
  クライアント側`<RedirectOnce>`（200msフォールバック）は1回のページロードには
  耐えるが、**数時間動き続けるOBSソースには効かない**（SPAリダイレクトをOBSが
  追従するとは限らない）。→ 旧`/qsheet/*`静的マウントを実ページとして生かし続ける
  （サーバー側の二重マウント or 301）必要があり、クライアント側リダイレクトだけでは
  不十分。
- 既存の段階的URL非推奨パターン（`LegacyUrlBanner.tsx` — 旧音声共有URL形式への警告）を
  流用すべき。新規のパターンを発明しない。

### 3-3. サーバールート（API prefix）

**何が変わる:** `server/src/contexts/qsheet/index.ts`の**26個**の`router.use()`呼び出し。
内訳: プレーンな`/qsheet`が23個、独自サブパスを持つものが3個（`/qsheet/stage-templates`・
`/qsheet/production`・`/qsheet/rental`）。対応するフロント側呼び出し（`client-qsheet/src/lib/api.ts`
経由で`api.get('/qsheet/documents')`等のリテラル、約80ファイル）も同時に書き換えが必要。

**後方互換要件:** HTTPルートは（Socket.IOと異なり）**二重マウントが可能**
（`router.use('/qsheet', ...)`と`router.use('/techops', ...)`を並行運用）。3-2の静的アセット
二重マウントと合わせて、この層は段階的移行が可能な唯一の層である。

### 3-4. Socket.IOネームスペース

**何が変わる:** `server/src/contexts/qsheet/socket.ts:45`の`io.of('/qsheet')`、
`client-qsheet/src/lib/socket.ts:27`の`io('/qsheet', { path: '/socket.io/', ... })`。
ルーム命名規則（`doc:<docId>`／`doc:<docId>:members`）自体は変更不要（ネームスペース内の
サブ構造のため）。

**⚠️ 段階的移行が不可能な唯一の層。** Socket.IOのネームスペースはHTTPルートと違い
エイリアス機構がなく、クライアント・サーバーを**同一デプロイで同時に**切り替える必要がある。
デプロイ直前にブラウザ/OBSタブを開いたまま放送中だったオペレーター画面は、**エラー表示なしに
サイレントに同期が止まる**。→ 計画停止枠（既知の非稼働時間帯）を設定したデプロイ計画が
必須で、通常のローリングデプロイに乗せてはいけない。

### 3-5. DBオブジェクト（`qsheet_*`）

**規模（実測）:** テーブル25・`qsheet_`で始まるインデックス5・`idx_qsheet_*`/`uq_qsheet_*`
形式のインデックス59・制約7 ＝ **`qsheet_`を含むオブジェクト合計96個**（先行メモの
「約90個」から migration 231 までの間に増加）。

**リネームする場合のコスト試算（このドキュメントでは実施しない、参考値）:**
migrationはappend-only（過去ファイルは書き換えない）ため、**新規migration1本**で足りる
（最大25テーブルRENAME＋64インデックスRENAME＋7制約RENAME＝約96文）。ただしPostgresは
テーブルRENAME時にインデックス/制約名を自動追随しないため、**個別に全部書く必要がある**。
加えて`requirePermission('qsheet', ...)`のようなアプリケーション層の文字列（`auth.routes.ts`の
`MODULES`配列、`permission-role.service.ts`、`~50箇所`の`server/src/contexts/qsheet/routes/*`）
も別途要修正。

**このカテゴリは §4 で明示的にスコープ外とする**（理由は§4末尾を参照）。

### 3-6. MCPツール名（外部契約）

**対象8ツール**（`production.tools.ts`、全て単一ファイル内）:

| # | ツール名 | 種別 | 名前に`qsheet`を含む |
|---|---|---|---|
| 1 | `list_production_docs` | read | いいえ |
| 2 | `get_production_journey` | read | いいえ |
| 3 | `get_qsheet` | read | はい |
| 4 | `get_day_schedule` | read | いいえ |
| 5 | `find_similar_qsheets` | read | はい |
| 6 | `create_qsheet` | write | はい |
| 7 | `propose_qsheet_draft` | write | はい |
| 8 | `discard_qsheet_proposal` | write | はい |

**関連ファイル:** `production.access.ts`（OAuth限定ゲート、全8ツール共通）、
`gate.ts:76-78`の`WRITE_TOOL_PERMISSIONS`（3つの書き込みツールを名前文字列でキー）、
`scripts/generate-mcp-tools.mjs`（`registerTool('name', ...)`を正規表現抽出して
`mcp-tools.json`を生成、書き込みツールが`gate.ts`に無いとビルド失敗する
`assertGateCoverage`付き）、`docs/mcp-server.md:255-275`（手動維持の外部向け表）、
`server/src/shared/db/migrations/114_mcp_audit_log.sql`の`mcp_audit_log.tool_name`
（過去の呼び出しは旧名のまま永久保存される）。

**MCP SDKにエイリアス機構は存在しない**（`node_modules/@modelcontextprotocol/sdk`の
`McpServer._registeredTools`はフラットな`{name: handler}`のみ、`registerTool`は
同名の二重登録を拒否するが、**別名で同じハンドラを2回登録することは可能**）。

**後方互換要件:** 外部MCPクライアント（Claude Desktop等）は`tools/call`をツール名の
完全一致で送るため、プロトコルレベルの移行支援は無い。唯一の緩和策は
**アプリケーションレベルでの二重登録**（ハンドラ本体を関数として切り出し、旧名・新名の
両方で`registerTool`する）。

### 3-7. クロスサービス結合（rental-scraper）

**結合点:** `rental-scraper/sync_to_postgres.py`が`qsheet_rental_items`
（`company, item_id`複合PKへの生UPSERT、列名がコード内にハードコード）、
`rental-scraper/sync_requests.py`が`qsheet_rental_sync_requests`（`FOR UPDATE SKIP LOCKED`の
ポーリングキュー）に直接SQLで依存。**Node側マイグレーションフレームワークの管理下に無く**、
テーブルリネーム時は**別リポジトリパス・別言語のコードを手動同期**する必要がある
（型システム・ORMによる自動検知が効かない）。

**運用面の結合:** `docker-compose.yml`の`QSHEET_AI_EXPIRE_NIGHTLY`/`QSHEET_AI_SETTLE_NIGHTLY`/
`QSHEET_AI_REVIEW_NIGHTLY`/`QSHEET_AI_REVIEW_OWNER_USER_ID`（4環境変数、prod/dev両方で
宣言、変数名自体に`QSHEET`を含む）。

**現状の影響範囲:** `rental_scraper_dev`は**検証環境限定**（本番用サービスは未実装、
`deploy.yml`のproductionジョブに`rental`関連の結線は一切ない）。したがって
**本件が本番へ与える直接影響は現状ゼロ**。

**このカテゴリも §4 で明示的にスコープ外とする。**

---

## 4. フェーズ分けした移行手順案

### 全体方針

DBオブジェクト（3-5）とrental-scraper結合（3-7）は**このドキュメントのスコープに含めない**。
理由: (a) 会社の標準パターンとして、`client-live`（`liveops`）も表示名変更時にDBテーブルを
リネームしていない、(b) `permission-model-simplification-plan.md`でも「区画名の統合」は
`ROLE_MODULES`という文字列キーの範囲で完結させ、DB列自体は変えていない、(c) 監査結果
（§3-5・3-7）自体が「大きな労力に対して実害・便益がない」と結論している。**この判断を
覆す具体的な理由が見つからない限り、DB/rental-scraperのリネームは将来にわたって
対象外とする。**

MCPツール名（3-6）は「リネームしない」という選択肢と「二重登録で移行する」という
選択肢の両方が現実的だが、外部契約という性質上、**どちらを選ぶにせよ会社の判断が必要**
（§6）。以下ではPhase 4として「実施する場合の手順」を示す。

### Phase 1 — 内部限定・外部露出ゼロの識別子のみ ✅ **完了（2026-08-22）**

**対象:** ディレクトリ名（`client-qsheet/`→`client-techops/`）、root `package.json`／
`client-qsheet/package.json`のワークスペース参照、`Dockerfile`のビルドステージ名・COPYパス
（**アップロードディレクトリ`/app/uploads/qsheet`は対象外**、3-1参照）、`scripts/*.mjs`の
パス文字列・ベースラインキー・許容リストキー、localStorageの`qs_print_pagemode`／
`qs_top_recents`（`qs_user`は既に非推奨フォールバックのため実質影響なし）。

**明示的に変更しないもの:** ベースパス`/qsheet/`、`AppKey`、`permissionModule`、
Socket.IOネームスペース、DB、MCPツール名 — 全て`qsheet`のまま。

**CI検証ゲート:** `npm run typecheck` / `npm run lint` / `npm run test` /
`npm run check:ui-tokens` / `npm run check-contrast-tokens` /
`npm run check-mobile-declared` に加え、**`Dockerfile`実ビルド一式が通ること**
（`build-techops`ステージ名変更後のCOPY整合を実機で確認）。`package-lock.json`は
手編集せず`npm install`で再生成。

**リリース判定:** 通常のPRフローで完結。本番影響なし（ディレクトリ名は実行時に
`server/src/app.ts:143`からのみ参照されるため、この1行だけは**Phase 1のPRに含めて**
同時に変更する）。

### Phase 2 — base path・`AppKey`・API prefix の二重マウント導入

**対象:** `vite.config.ts`の`base`を`/techops/`に、`shared/src/client/apps.ts`の
`AppKey`/`path`を`techops`に、`server/src/app.ts:143`の静的マウントを`/techops`に。
**同時に**旧`/qsheet`の静的マウント・API router（`router.use('/qsheet', ...)`×26）を
**残したまま並行稼働**させる（HTTPルートは二重マウント可能、3-3参照）。
`shared/src/production/miniapps.ts`とサーバー側複製の両方を同時変更
（`check-collab-parity.mjs`がずれを検知）。cross-app links（`DayTab.tsx`／
`BusinessProjectView.tsx`／`shortcuts.ts`）を新パスに更新。

**明示的に変更しないもの:** `permissionModule: 'qsheet'`（`calendar`の`permissionModule: 'sales'`
据え置きと同じ理由）。

**旧URLへの誘導:** `LegacyUrlBanner.tsx`と同じパターンで「新しいURLに移動しました」の
案内を旧パスアクセス時に表示。

### Phase 3 — 5本の本番URLの移行とSocket.IOカットオーバー

**HTTP系（editor/onair/rundown/prompter/audio）:** Phase 2の二重マウントを**当面
無期限で維持**（QRコード・OBS設定は事後訂正できないため、他の会社事例のような
「次の通常リリースを1回挟んで撤去」という短期の互換窓では不十分。§6で撤去可否・
時期を要判断とする）。

**Socket.IO（`/qsheet`→`/techops`ネームスペース）:** 二重運用不可（3-4参照）。
`phase3-2-plan.md`の互換確認チェックリスト（A: デプロイ直後のスモークテスト、
B: 使用状況の可視化、C: 継続監視、D: 判定基準）と同じ厳密さで、**放送予定のない
計画停止枠**を設定し、クライアント・サーバーを同一デプロイで切り替える。切替直後は
「放送中にタブが開きっぱなしのオペレーターがいないか」を運用側で事前告知・確認する
運用手順を別途整備する。

### Phase 4 — MCPツール名の移行（実施する場合）

MCPプロトコルにエイリアス機構が無いため、**二重登録による非推奨期間**を挟む
（3-6参照、`phase3-2-plan.md`のlegacy-ID互換パターンと同型）:

1. 各ハンドラ本体を関数として切り出し、新名（例: `get_techops_doc`）を主として登録
2. 旧名（`get_qsheet`等）も同じハンドラで再登録し、`description`に
   `[非推奨/deprecated — 次リリースで撤去予定]`を明記
3. `gate.ts`の`WRITE_TOOL_PERMISSIONS`に旧名・新名の両方を登録（撤去まで両方必要）
4. `docs/mcp-server.md`を新名を主に、旧名を「非推奨（引き続き動作）」として更新
5. `mcp_audit_log.tool_name`で旧名呼び出し頻度を観測し、`phase3-2-plan.md`の
   legacy-ID観測（実利用が実質0件であることを確認してから撤去）と同じ基準で
   撤去タイミングを判断
6. `qsheet_ai_proposals.kind`の値（`script_outline_draft`等）はツール名と独立した
   別の互換面のため、このフェーズでは**変更しない**

### 明示的スコープ外（この計画では実施しない）

| 対象 | 理由 |
|---|---|
| DBテーブル名・インデックス名・制約名（`qsheet_*`、96個） | `client-live`が`liveops`のDBテーブルをリネームしなかった前例と同じ判断。実益が労力に見合わない（§3-5） |
| `user_permissions.module`／`permission_role_modules.module`の値`'qsheet'` | `permissionModule`はセキュリティ境界の識別子。`calendar`が`permissionModule: 'sales'`を据え置いた前例と同じ扱い |
| rental-scraper（Python側のテーブル参照コード） | 検証環境限定・本番影響ゼロ。DBリネームをスコープ外にした時点で自動的に対象外（§3-7） |

---

## 5. リスクと軽減策

| リスク | 可能性/影響 | 軽減策 |
|---|---|---|
| `server/src/app.ts:143`の静的マウントパス変更漏れ | 低/**致命的**（本番全体404、CIでは検知不可） | Phase 1に含めて必ずディレクトリ名変更と同一PRで変更。デプロイ直後のスモークテスト（`curl /techops/`）を必須チェックリスト化 |
| Socket.IOカットオーバー時、放送中のOBS/オペレーター画面がサイレントに同期停止 | 中/**致命的**（放送事故） | 計画停止枠でのカットオーバー、事前の運用告知、切替直後30分の重点監視 |
| OBSブラウザソースURL・QRコードが事後訂正不可能 | 高（既に配布済み） | 旧`/qsheet/*`静的マウントを無期限維持する方針にする（Phase 3、撤去時期は要判断） |
| `check-ui-tokens.mjs`/`check-contrast-tokens.mjs`のexact-pathキー（9+8箇所）の書き換え漏れ | 中/中（CIが誤検知 or 検知漏れになる） | 手作業でなくスクリプト化したリネーム（sed等）で一括変更し、変更前後の行数一致を機械確認 |
| MCPツール名変更で外部エージェント（Claude Desktop等）の呼び出しが即エラー | 中/高（外部連携が突然壊れる、通知経路なし） | 二重登録による非推奨期間必須（Phase 4）。単純な一括リネームは選択しない |
| `permissionModule`まで誤ってリネームし、既存ユーザーの権限データ（`user_permissions`JSON）が孤立 | 低（対策済みなら）/**致命的**（サイレントに権限喪失） | Phase 1〜3で`permissionModule`は明示的に不変とする方針をコードレビューで必ず確認 |
| `rental-scraper`が別言語・別デプロイであることを見落としてDBリネームに巻き込む | 低（今回はDBをスコープ外にしたため）/高 | DBリネームをスコープ外と明記済み。将来この判断を覆す場合は`rental-scraper/`の生SQL修正を必須タスクとして計画に追加すること |
| Phase 2の二重マウント期間が長期化し、`router.use('/qsheet', ...)`×26と`/techops`×26の保守が二重コスト化 | 中/中 | 撤去条件（§6で要判断）を早期に決め、期限を明示する。「無期限」を選ぶ場合はそのコストを許容する判断であることを明記 |
| ドキュメント（`docs/design/v4/qsheet-v4-coding/`等、大量）が更新されず内部で混乱 | 高/低 | 機能的リスクは無いため優先度は低いが、Phase 1完了時点で最低限`CLAUDE.md`各所・`README.md`は更新する |

---

## 6. まだ決まっていないこと・要判断

1. **候補名`techops`の最終確定。** `client-qsheet/CLAUDE.md`のメモは「候補」の域を出ておらず、
   正式な決定文書（`client-live`の`12-live-timer-decision.md`に相当するもの）はまだ存在しない。
   着手前にユーザーの明示的な承認が必要。
2. **そもそも実施するかどうかのコスト対効果判断。** 監査結果が繰り返し指摘する通り、
   現状の不一致による実害は報告されていない。表示名と内部識別子の分離は会社の標準
   パターンとして許容されている以上、「やらない」という選択肢も引き続き有効。
3. **実施タイミング。** `client-qsheet/CLAUDE.md`によれば、表本体（`CueTable`/`CueRow`/
   `cells/*`）・`EditorSidebar`の詳細・本番3画面固有の実装の作り直しがまだ進行中
   （v4凍結解除の続き）。この開発と本リネームを並行させると、リネーム中のPRと
   機能PRが同じファイル（`OnAirPage.tsx`等）を触り合ってコンフリクトする可能性が高い。
   **表本体作り直しの完了後に着手する方が安全**という判断もあり得る。
4. **Phase 2の二重マウント撤去時期。** editor/onair/rundownの3URLは通常のブックマーク
   相当（`phase3-2-plan.md`の互換確認パターンで撤去可能）だが、**prompter（OBS）と
   audio（QR）は無期限維持が必要かもしれない**。撤去する場合の基準（利用ログが
   実質0件になったら等）を決める必要がある。
5. **MCPツール名を実際にリネームするか。** Phase 4は「実施する場合の手順」であって
   実施の可否自体は未決定。外部にどれだけ実利用があるか（`mcp_audit_log`で事前調査
   すべき）が判断材料になる。
6. **`permissionModule`／DB／Socket.IOネームスペース／rental-scraperまで踏み込むか。**
   本計画は明示的にURL/`AppKey`/ディレクトリ層に限定しているが、将来的にこれらの層まで
   統一したいという要望が出た場合は、**別の・さらに大掛かりな決定**として扱う
   （§4の「明示的スコープ外」を参照。覆す場合は理由をこの文書に追記すること）。
7. **`QSHEET_PC_ONLY`/`QSHEET_MOBILE_OK`等、TypeScript識別子自体をリネームするか。**
   ディレクトリ名だけ変えて識別子は`QSHEET_*`のまま残す（実害なし・低コスト）か、
   一貫性のため識別子ごと変える（`AppShell.tsx`等の連動修正が必要）か（3-1参照）。
8. **`client-live`の空洞化・削除とのタイミング調整。**（2026-08-22 追記）
   「計時・視聴者のミニアプリ化フェーズ2」により`client-live`の実体画面は
   `client-qsheet`側の`/qsheet/live/*`へ移植済みで、旧`client-live`側は
   リダイレクト専用画面に置き換わりつつある（§7参照）。実体（`DashboardPage.tsx`等）は
   観測期間を挟んで別PRで削除予定。**techopsリネームを`client-live`削除の前にやるか
   後にやるかで、Phase 2〜3の対象範囲が変わる**（`client-live`側の後方互換リダイレクト先
   URLも`/qsheet/*`から`/techops/*`への追随が必要になるため）。`client-live`側の
   空洞化が完了してから着手する方が、二重に面倒を見る対象が減って安全という見方もある。

---

## 7. 参考: 会社の前例

### `studio` → `calendar`（実施済み）

範囲: `AppKey`＋ルートprefix（`/studio/*`→`/calendar/*`）のみ、単一アプリ（`client/`）の
クライアント側ルーティングに閉じる。**動機は実害**: `studio`という文字列が
「アプリの旧識別子」と「実在する`studio_bookings`/`studio_locations`スタジオ予約機能」の
2つの意味を持ち、既に混乱の記録があった（`shared/src/client/apps.ts`に「4か所の食い違いの
うち表示名は決めたが識別子は変えていない」という既知debtとして記録されていた）。
`RedirectKeepQuery`で全旧URLを維持。検証は`tsc -b client`/`tsc -b server`/`lint`/
`test`（1329件）という通常のPR単位のゲートで完結し、レビュー指摘は0件だった。

**本計画への示唆:** 範囲が単一アプリのクライアント側に閉じ、かつ具体的な実害がある場合
のみ、通常のPR規模で完結できる。本件（qsheet→techops）はどちらの条件も満たさない
（範囲が広い、実害がない）ため、**同じ軽さでは実施できない**——これが§4でフェーズを
細かく割った理由。

### `client-live`（`liveops`）の表示名変更「計時LIVE」→「計時・視聴者」

`docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md`が、本件と全く同じ構造の
決定（表示名のみ変更、内部識別子は不変）を先に行っている。qsheet自身の2026-08-22の
改名メモは、この文書のフォーマット（対応表：識別子列／据え置き値列をアプリの
`CLAUDE.md`に残す）を明示的に踏襲している。決定doc自体は「識別子を変える基準」を
明文化してはいないが、実質的なルールとして次が読み取れる:

- 変える: `shared/src/client/apps.ts`の`label`、root`CLAUDE.md`のアプリ表、当該アプリの
  `CLAUDE.md`、`docs/wording.md`（旧→新の対応と理由を1行追記）
- 変えない（**表示名変更PR単体では**）: ディレクトリ名、base path、`permissionModule`、
  DBテーブル名、Socket.IOネームスペース、`localStorage`キー接頭辞、`AppKey`/`MiniAppKey`の値
   （それぞれ個別に理由付け: CI/Docker参照・公開URL・migration定義の権限境界・
     契約テストが文字列をpinしている・「一度決めたキーは変えない」原則）
- セキュリティ/契約境界（`permissionModule`等）に触れる場合は、二層防御の説明を明記し
  「見えるが403になる」穴を作らない
- 本格的な識別子リネームは**別の・より大掛かりな取り組み**として切り離し、
  表示名変更のPRには絶対に混ぜない

⚠️ **2026-08-22（PR #327・migration 232）でこの「変えない」の一部が更新された。**
計時・視聴者（`liveops`）の運用画面を`client-qsheet`へバンドル統合する「ミニアプリ化
フェーズ2」の一環として、**`permissionModule: 'liveops'`をユーザーが明示的に
`'qsheet'`へ統合すると決定した**（`12-live-timer-decision.md` §9 の未決事項の決着）。
`user_permissions`/`permission_role_modules`の`module`列は既存データも含めて
MAX集約で書き換えられ（migration 210の権限モデル単純化と同じ手口）、
`requirePermission('liveops', ...)`はコードから消えた。これは**「表示名変更に
識別子リネームを混ぜない」という原則への違反ではない** — 動機が表示名の一致ではなく
「2つのアプリが実質1つのミニアプリ構成になった」という構造変化そのものだったため、
「本格的な識別子リネーム」を**別の取り組みとして切り離した**という原則には合致している。
つまり正しくは: **`permissionModule`等の識別子は「表示名を揃えるためだけ」には
変えないが、アプリ同士が実際に統合される（バンドルが1つになる）ときは変える**、
という一段階詳しい基準だったと分かる。

**本計画への示唆:**
1. §4「明示的スコープ外」に書いた`permissionModule`不変の理由（`calendar`が
   `permissionModule: 'sales'`を据え置いた前例）は、**「表示名を揃えるだけの動機では
   変えない」という条件付きでは依然として正しい**。本計画（qsheet→techops）も
   表示名の一致が動機であり、バンドル統合を伴わないため、`permissionModule`を
   スコープ外とする結論そのものは変わらない。
2. ただし将来、`client-qsheet`（techops）と**他のアプリが実際にバンドル統合される**
   ような展開になった場合は、liveops同様に`permissionModule`の統合が
   「表示名リネームとは別の、しかし正当な」判断としてありうる — その場合はこの
   移行計画とは別に決定docを起こすこと。
3. **`client-live`は既に空洞化が進んでいる。** 旧URL（`/live/program/:id`等）は
   すべて新URL（`/qsheet/live/*`）へのリダイレクト専用画面に置き換わっており、
   実体（`DashboardPage.tsx`等）は本番リリースの観測期間を挟んで別PRで削除される
   設計（`12-live-timer-decision.md`§4-3）。**`client-live`ワークスペース自体が
   将来的に廃止される可能性がある**ため、techopsリネームの実施タイミングを
   `client-live`の完全空洞化・削除より前にするか後にするかは§6の新規要判断事項とする。
4. `qsheet`も表示名と内部識別子の分離を続けているという結論自体は変わらないが、
   「絶対に変えない」ではなく「**表示名だけが動機のときは変えない**」という
   条件が明確になった点は、本計画のPhase 4（MCPツール名）の判断にも参考になる —
   外部契約を伴う識別子であっても、構造変化が伴えばリネームの選択肢は開かれている。

### `customers`/`vendors`→`companies`統合のPhase 3-3（`phase3-2-plan.md`）

DBオブジェクトそのものではなく「旧IDでの互換アクセス」という別の互換面だが、
本計画のPhase 3（本番URL）・Phase 4（MCPツール名）が踏襲した**段階的撤去の型**の直接の
出典: (1) legacy解決経路を1箇所のヘルパーに集約してからログを仕込む、(2) 本番公開後の
実観測期間を置く、(3) 実利用が実質0件であることを確認してから撤去する、(4) 「観測した」
という記録自体を撤去条件の一部にする（チェックが付いているだけでなく「いつ・誰が・
どう確認したか」を残す）。本計画の§4 Phase 3・Phase 4、§5のMCPツール名リスク軽減策は、
この型をそのまま流用している。

---

**次のアクション（このドキュメント自体の後始末ではなく、着手判断のための最小ステップ）:**
1. §6の7項目についてユーザーに`AskUserQuestion`等で確認を取る
2. 実施が決まった場合、`client-live`の`12-live-timer-decision.md`に相当する正式な
   決定docを作成し、`client-qsheet/CLAUDE.md`のメモを「未着手」から「計画あり・
   本ドキュメント参照」に更新する
3. Phase 1のみを先行実施する場合でも、`server/src/app.ts:143`の変更を含む1PRで
   完結させ、Phase 2以降は別PRとして着手条件を満たしてから進める

---

## 8. 更新履歴

- **2026-08-22（初版）** — 7観点マルチエージェント監査に基づき起票。
- **2026-08-22（PR #320 反映確認）** — `feat(qsheet): 収録設定・配信設定のWEB会議とExcel書き出しを
  作り直した（段3）`がマージされたことを検知。`server/src/contexts/qsheet/index.ts`の
  ルートマウント数（26個）・DBマイグレーション数（`qsheet_`系96オブジェクト）に変化が
  無いことを確認済み（差分は`client-qsheet/`内の機能実装・`server/.../qsheet/routes|services`の
  既存ファイル変更のみで、新規マウント・新規テーブルは無し）。**§2〜§3の数値・§4の
  フェーズ計画に修正は不要。**
- **2026-08-22（PR #325/#326/#327/#329 反映）** — 複数のqsheet関連PRがマージされたことを検知し、
  実際に内容を確認・計画へ反映した。
  - #325（案件詳細ポップアップの入力幅）・#326/#329（rental-scraperの文字化け修正）は
    §2〜§3の前提事実に影響なし（`server/src/app.ts`の変更は静的配信の設定調整で
    ルートマウント自体は無改変。DB新規テーブルなし）
  - **#327「計時・視聴者のミニアプリ化フェーズ2（バンドル統合）」は前提事実に実質的な
    影響があったため§2・§3-2・§7・§6を修正した。** 要点: ①`client-live`の運用画面が
    `/qsheet/live/*`系5ルートとして`client-qsheet`へ移植された（§3-2に追記）
    ②`permissionModule: 'liveops'`がユーザーの明示的決定で`'qsheet'`へ統合された
    （migration 232）— これは§7で引用していた「識別子は変えない」前例の**部分的な
    修正**にあたるため、§7を「表示名変更が動機のときは変えない」という条件付きの
    基準へ書き改めた ③`client-live`が空洞化・将来削除に向かっていることを新規要判断
    事項として§6item8に追加した。DBオブジェクト数（`qsheet_`系96個）に変化はない
    （migration 232は既存テーブルの行を移すだけで新規テーブルは作成していない、
    `server/src/contexts/qsheet/index.ts`のrouter.use数も26個のまま）
- **2026-08-22（Phase 1 実施・完了）** — ユーザーの明示的な指示で§4 Phase 1に着手し、
  マルチエージェント（8タスク並行）＋手動での漏れ補完で完了させた。
  - `git mv client-qsheet client-techops` でディレクトリ本体をリネーム。root
    `package.json`（workspaces・dev:all/dev:frozen/dev:qsheet→dev:techops/typecheck:all/
    build:all/build:render）・`client-techops/package.json`の`name`・`Dockerfile`
    （ステージ名`build-client-qsheet`→`build-client-techops`とその`--from=`参照・COPY
    パス4箇所。**アップロードディレクトリ`/app/uploads/qsheet`は意図通り不変**）・
    `server/src/app.ts:143`の静的マウントの**ディレクトリパスのみ**変更（**URL prefix
    `/qsheet`は不変**）・`scripts/{check-file-size,build-changed,check-shared-wiring,
    check-ui-tokens,check-contrast-tokens,check-mobile-declared,verify-ime}.mjs`と
    `scripts/fixtures/ime-harness/`・`.github/{CODEOWNERS,pull_request_template.md}`
    を更新
  - `QSHEET_PC_ONLY`/`QSHEET_MOBILE_OK`/`QSHEET_MOBILE_HIDDEN`のTS識別子も
    `TECHOPS_PC_ONLY`等へ統一（§6 item7の判断: 一貫性のため識別子ごと変える方を選択）
  - ⚠️ **マルチエージェントの初回スコープ漏れを手動監査で発見・修正した**:
    `shared/tests/*.test.ts`（14ファイル）が`'../../client-qsheet/src/...'`という
    ワークスペース境界をまたぐ相対import/joinパスを直書きしており、Phase 1の対象
    タスクに含めていなかったため放置すれば`npm run test`が即壊れる状態だった。
    加えて`scripts/check-ui-tokens.mjs`の`TARGET_DIRS`/`NOT_A_SCREEN`配列（当初
    「対象外」と判断されていたが実際は機能に影響する配列だった）・
    `scripts/file-size-baseline.json`（7キー）にも同種の見落としがあった。
    最終的に**47ファイル**の残存参照を`sed`で一括修正し、`package-lock.json`に
    残った`"client-qsheet": {"extraneous": true}`の孤児エントリも手動で除去した
  - **検証**: `npx tsc -b`（client-techops/server/client/client-live/client-daily/
    client-equipment/client-awards、全ワークスペース）0エラー、`npm run test`
    1452件全通過（qsheet系14ファイル含む）、`npm run lint`0エラー・warning 59件
    （着手前と同数）、`npm run build --workspace=client-techops`・
    `--workspace=server`成功。⚠️ **Dockerの実ビルド検証は本セッションの環境に
    dockerデーモンが無く未実施**（`docker build --target build-client-techops`は
    `dial unix /var/run/docker.sock`で失敗。Dockerfileの変更内容は目視レビューと
    `npm run build`の成功で代替確認）
  - `client-techops/CLAUDE.md`・root`CLAUDE.md`・`README.md`のディレクトリパス
    表記も現状に合わせて更新（README.mdの他の凍結状態表記等、本リネームと無関係な
    既存の記述ずれは対象外のまま残した）
  - **Phase 2以降（ベースパス・`AppKey`・Socket.IO切替・本番URL）は未着手のまま。**
    本番URL・Socket.IOの後方互換確認・切替はこの環境から本番へアクセスできず
    検証しきれないため、着手にはユーザーの追加判断を要する（§6参照）
