# 段3 実装設計 — アプリ構造（レジストリ・ルート・トップ・ジャーニー・`doc_no`・ピン）＋凍結解除

> 対象の設計書: [`../01-app-structure.md`](../01-app-structure.md)
> 実装の順序での位置: [`../README.md`](../README.md) §7 の **段3**（0→1→2 の次）
> **この文書はコードを1行も含みません。** 実装前に「実装を読んで確かめた事実」と
> 「その事実に合わせて直した設計」を置くための文書です。
>
> ⚠️ 本文中の `ファイル:行` は **2026-08-21 時点の `claude/qsheet-v4-coding-guide-udbo1u`**
> で実際に開いて確認した位置です。行がずれたら**その場で確認し直してから**直してください。

---

## §1 この段でやること

| # | やること | 主な成果物 |
| --- | --- | --- |
| 1 | **凍結解除**（`client-qsheet` を v4 の検査体系に移す） | `apps.ts` / 検査スクリプト5本 / `client-qsheet/CLAUDE.md` |
| 2 | **ルーティングの作り替え**（公開URL5本は1文字も変えない） | `client-qsheet/src/App.tsx` |
| 3 | **ミニアプリのレジストリ**（`shared` ＋ `server` の意図的複製） | `shared/src/production/miniapps.ts` ほか |
| 4 | **`doc_no`（資料番号）の DDL と採番** | migration 1本 ＋ `docNo.service.ts` |
| 5 | **ジャーニーのピン（`production_journey_marks`）の DDL** | migration 1本 |
| 6 | **トップ／ジャーニーの取得 API**（サーバーは数えた事実だけ返す） | `scopes.routes.ts` / `journey.service.ts` |
| 7 | 画面（トップ・ジャーニー・一覧・設定ハブ）の器 | `client-qsheet/src/pages/*` |

**この段でやらないこと**（境界をここで固定します）:

- スケジュール表そのもの（表・列・項目・ひな形）は **段4（`02-schedule.md`）**。
  この段は「レジストリに `schedule` を1行載せる」「ジャーニーの `frames[]` の**型**を決める」までです。
- 編集画面の作り直しは **段5（`06-editor.md`）**。この段では `/qsheet/editor/:id` は**触りません**。
- 本番4役割・公開音声は **段2 と `07-onair-roles.md`**。この段では**見た目を守る**側だけを扱います（§7）。
- `qsheet_doc_index`（`duration_gap` / `mic_unassigned` の出どころ）は **04**。
  この段では**その2件の手がかりを出さない**で始めます（§6・§10）。

---

## §2 実装前の事実確認

**すべて実装を開いて確認したものだけを書きます。確認していないものは「未確認」と明示します。**

### 2-1. 現行のルート定義（公開URL5本の実際のパス）

`client-qsheet/src/App.tsx` の全ルート（全53行・これで全部です）:

| 行 | `path` | 要素 | シェル | 認証 |
| --- | --- | --- | --- | --- |
| `App.tsx:31` | `/qsheet/login` | `LoginPage` | 無し | 不要（認証済みなら `/qsheet` へ） |
| `App.tsx:37` | `/qsheet` | `DashboardPage` | あり | 要 |
| `App.tsx:38` | `/qsheet/editor` | `DashboardPage` | あり | 要 |
| `App.tsx:39` | `/qsheet/editor/:id` | `EditorPage` | あり | 要 |
| `App.tsx:43` | `/qsheet/onair/:id` | `OnAirPage` | **無し** | 要 |
| `App.tsx:44` | `/qsheet/rundown/:id` | `RundownPage` | **無し** | 要 |
| `App.tsx:45` | `/qsheet/prompter/:id` | `PrompterPage` | **無し** | 要 |
| `App.tsx:48` | `/qsheet/audio/:id` | `AudioSupportPage` | **無し** | **不要（公開）** |
| `App.tsx:50` | `*` | `RedirectOnce to="/qsheet"` | — | — |

- ベースパスは `client-qsheet/vite.config.ts:7` の `base: '/qsheet/'`。
- 静的配信は `server/src/app.ts:143` の `serveApp('/qsheet', …)`。
  `serveApp` は `prefix` と `${prefix}/*` の両方に `index.html` を返す（`app.ts:131-138`）ので、
  **`/qsheet/` 配下にルートを何本足してもサーバー側の変更は要りません**。
- 資料IDから本番URLを組み立てている実コード（配布経路の実体）:
  `AudioShareDialog.tsx:20-21`（公開音声の絶対URL・QR用）、
  `EditorPage.tsx:665,669,673`（ランダウン／プロンプター／進行）、
  `DashboardPage.tsx:645`（OnAir）、`DayTab.tsx:121`（案件詳細 → 編集）。

### 2-2. アプリ一覧と凍結フラグ

| 事実 | 出どころ |
| --- | --- |
| アプリ登録の唯一の正は `shared/src/client/apps.ts`。`AppDef.frozen?: boolean` は `apps.ts:116` | `apps.ts` |
| `qsheet` の行は `apps.ts:147`。**`label` は既に `'制作資料'`**（`'Qシート'` ではない） | `apps.ts:147` |
| ⚠️ `apps.ts:25-33` のヘッダーコメントは「`qsheet` いまは『Qシート』/ v4 の文書は『制作資料』」と書いたまま。**実データ（147行）と食い違っている**（古いコメント） | `apps.ts:31` |
| `frozen` を読むのは **`visibleApps()` の1か所だけ**（`apps.ts:202`）＋ 画面表示の `SystemInfoPage.tsx:165`（「v4.0.0 では据え置き」札） | grep 実測。他に読み手なし |
| `visibleApps()` の既定は `includeFrozen: false`。上辺バー（`AppTopbar.tsx:112`）と左メニュー（`AppSideMenu`）から凍結が消える | `apps.ts:197,202` |
| **`appNav.ts:26` の `getAccessibleApps()` だけは `includeFrozen: true`** を渡している。旧シェル（`client-qsheet/src/components/layout/Sidebar.tsx:21`）が使っている | `appNav.ts:26` |
| トップページのタイルは `apps.ts` を読むが `visibleApps()` を通していない。`HomePage.tsx:88` の `DAILY_KEYS` と `AppTiles.tsx:61` の `EVENT_KEYS` の**2つの手書き配列**で分けている。`qsheet` は `EVENT_KEYS` 側 | `HomePage.tsx:88` / `AppTiles.tsx:61` |
| ⚠️ `HomePage.tsx:78-82` に「**消してはいけません**。`visibleApps()` は凍結3アプリを既定で外すので、押して開ける場所はトップのタイルだけ」という注記がある | `HomePage.tsx:78` |
| `shared/tests/apps.test.ts:39` が **凍結＝`['awards','liveops','qsheet']` の3つ**を固定。`:48-52` がラベル（`APP_LABELS.qsheet === '制作資料'`）を固定。`:106-108` が `includeFrozen` の挙動を固定 | `apps.test.ts` |

### 2-3. `client/`（案件管理）側の「ミニアプリのレジストリ」に相当する仕組み

**あります。ただし共有できる形ではありません。**

- `client/src/contexts/platform/pages/home/AppTiles.tsx:79`
  `const MINI_APPS: Record<string, Array<{ label; to; icon }>>`
  — **日常業務（`dailyops`）の6項目だけ**を手書きで持つ定数。トップのタイルを開いたときに畳んで出す。
- 行き先の正は別ファイル（`client-daily/src/components/layout/nav.ts`）にあり、
  `AppTiles.tsx:78` のコメントが「**行き先は `client-daily/…/nav.ts` と同じです**」と**人の約束**で揃えている
  （機械の検査は無い）。
- `client-daily` 側の `nav.ts` は `client-daily` のバンドル内にあるので、`client/` からは import できない。

⚠️ **名前が衝突します。** 設計書 01 §3-2 は `shared/src/production/miniapps.ts` に
`export const MINI_APPS` を置くと決めていますが、`AppTiles.tsx:79` に**既に別物の `MINI_APPS` があります**。
別モジュールなのでコンパイルは通りますが、`grep MINI_APPS` が2種類を返すことになります。→ §4-4 で対処。

**結論**: レジストリの前例は「1アプリ分を手書きした定数が1つある」だけで、
**再利用できる仕組みは存在しません**。01 §3 の設計（`shared` に純データ ＋ `server` に意図的複製 ＋
parity 検査）は、既存の `check-collab-parity.mjs` の作法を借りるので**新しい仕組みを増やしません**。
この判断は妥当です。

### 2-4. `qsheet_documents` の現行スキーマ

`server/src/shared/db/migrations/012_qsheet_schema.sql:7-26` が唯一の CREATE。以後この表を触ったのは
`016`（索引）・`102`（共有表）・`113`（Yjs 状態）・`209`（列削除）だけ（`grep -l` で実測）。

```
id TEXT PK / title TEXT NOT NULL DEFAULT '' / data JSONB NOT NULL DEFAULT '{}'
episode_id TEXT → episodes(id) / project_id TEXT → projects(id)
broadcast_date TEXT / episode_code TEXT
status TEXT NOT NULL DEFAULT 'draft' CHECK(draft|rehearsal|on_air|archived)
created_by / updated_by TEXT → users(id)
created_at TIMESTAMP / updated_at TIMESTAMP   ← **tz なし**
deleted_at TEXT                                ← **TEXT なのに NOW() を入れている**
```

- **`doc_no` は存在しません**（`012` にも `016/102/113/209` にも無い。実測）。
- `209_column_level_drift_cleanup.sql:39-41` が
  `audio_share_revoked_at` / `audio_share_revoked_by` を **DROP 済み**
  → 07 §4 の「配った公開URLを取り消せない」は事実。
- 索引は `episode_id` / `project_id` / `episode_code` / `broadcast_date` / `status` / `created_by`
  （`012:42-47`）。**`deleted_at IS NULL` の部分索引は1本もありません。**

### 2-5. migration の実際の最大番号

```
$ ls server/src/shared/db/migrations | sort | tail -5
207_revenue_items_cost_columns_backfill.sql
208_drop_customers_vendors_tables.sql
209_column_level_drift_cleanup.sql
210_simplify_permission_modules.sql
211_drop_techsheet_schema.sql        ← **実際の最大は 211**
```

⚠️ **README §6 の採番表は「現在の最大が 210」の前提で 211〜217 を割り当てていますが、
`211` は既に `211_drop_techsheet_schema.sql` が使っています。** → §5-1 で振り直します。

補足の事実:
- **番号の重複には前例があります**: `206_drop_untracked_drift_tables.sql` と
  `206_weekly_unreviewed_notification.sql` が両方あります。
- `197` と `205` は欠番です（連番である必要はない）。
- `server/src/shared/db/migrate.ts:16` は
  `readdirSync(dir).filter(f => f.endsWith('.sql')).sort()` で**ファイル名の辞書順**に流し、
  `:20` で `_migrations` テーブルの名前一致で実行済みを飛ばします。
  → **番号が重複しても CI は落ちません。黙って想定と違う順で流れます。**
  → **一度 `main` にマージされた migration のファイル名は絶対に変えない**
  （名前が変わると `_migrations` に無い＝未実行と判定され、既存 DB でもう一度流れます）。

### 2-6. `scripts/check-frozen-css.mjs`

- `:46-50` の `APPS` に `{ key: 'qsheet', label: '制作資料 (Qシート)', dir: 'client-qsheet' }` が**先頭**にある。
- `:52-58` `cssOf()` が `<dir>/dist/assets/*.css` を全部つないで md5 を取る → **`npm run build:all` が前提**。
- 基準は `scripts/frozen-css-baseline.json`。`qsheet` は `md5: 8e7f7a8f7b1a67ddea2570dadb2281c5 / 99952 バイト`。
- `:80-84` ビルドされていないアプリがあると **exit 1**。
- `--update "理由"` で基準を動かせる（`:64-68` 理由が無いと exit 1）。`history[]` に理由が残る。

⚠️ **`check:frozen` は CI に入っていません。**（実測）
`.github/workflows/ci.yml` が回すのは `typecheck:all`(:73) / `lint`(:76) / `npm test`(:83) /
`check-collab-parity`(:88) / `check:version`(:93) / `check:ui-tokens`(:99) の6つだけ。
`package.json:51` の `check:frozen` はどのジョブからも呼ばれていません
（スクリプト冒頭 `:25-27` に「lint には入れていません。CI とリリース前に回してください」と明記）。

→ **設計書 01 §0 の「これを忘れると CI が『CSS が変わった』で落ちる」は、現在の CI では成立しません。**
実際に CI を落とすのは別の検査です（§7-2）。

### 2-7. 凍結を機械的に守っている検査の棚卸し（**設計書 §6-3 の表より多い**）

| 検査 | どこで `client-qsheet` を特別扱いしているか | 凍結解除で必要な変更 |
| --- | --- | --- |
| `check-shared-wiring.mjs` | `:207` `V4_APPS = ['client','client-daily','client-equipment']`／`:236-238` **「凍結アプリを共通シェルに載せ替えないこと」で `bad()`**／`:241-252` `NoticeBar`・`ConfirmHost` の期待値が 0／`:254-257` `<Toaster />` の期待値が **`client-qsheet` だけ 1** | `V4_APPS` に追加。帯を置くなら期待値も反転。**トーストを残すなら `wantToaster` の分岐は維持** |
| `check-ui-tokens.mjs` | `:48-49` `V4_DIRS`（`v4Only` の対象外＝色・寸法・角丸の10規則が当たらない）／`:108` `TARGET_DIRS` には入っている（言葉づかい等は当たる）／`:143` `PrompterPage` は `NOT_A_SCREEN`／`:641-` の `BASELINE` に `browser-dialog: 17` / `forbidden-wording: 3` | `V4_DIRS` に `client-qsheet/src` を足すと**新規に大量の違反が出る**（`missing-font-weight` は現在 `client-qsheet` の記録が無い＝0件が正） |
| `check-file-size.mjs` | `:31` `SCAN` に `client-qsheet/src` が無い（400行の上限が当たらない） | 足すと **11ファイルが上限超過**（最大 `CueTable.tsx` 1,073行 / `EditorPage.tsx` 893 / `DashboardPage.tsx` 832） |
| `check-mobile-declared.mjs` | `:24-47` `APPS` に `client-qsheet` が無い（`pcOnlyScreens.ts` が要らない） | 足すなら `client-qsheet/src/pcOnlyScreens.ts` を新設 |
| `check-contrast-tokens.mjs` | `:84` `APPS` に **`client-qsheet` は既に入っている** | 変更不要 |
| `check-frozen-css.mjs` | `:47` | qsheet の行を外す（§7-2） |
| `verify-ui.mjs` | `:106-109` PAGES に qsheet 4本／`:155` `FROZEN_PREFIX = /^\/(qsheet\|live\|awards)\//`／`:444-446` 地の色の期待値が `rgb(250,250,250)`／`:454-457` **書体は `Noto Sans JP` を期待**／`:484` バッジ・金額の桁揃えを**当てない** | §7-3 |
| `check-collab-parity.mjs` | `:20-23` `PAIRS` は collab の2対のみ | レジストリの対を追加（§4-3） |
| `shared/tests/apps.test.ts` | `:39` 凍結3アプリを固定／`:106-108` `includeFrozen` | §7-2 |
| Tailwind | `client-qsheet/tailwind.config.ts:5-10` は `preset` のみ・content に `shared/src/client-v4/**` が**無い**（`client/tailwind.config.ts:7-17` と比較） | v4 の見た目にするなら `v4Preset` と `client-v4` の content を足す |

### 2-8. `tokens.css` / `tokens-v4.css` の実際の関係（設計書の理解より込み入っています）

- `client-qsheet/src/index.css:2` → `@import '@gmo-onair/shared/src/client/tokens.css';`（直読み）
- v4 の3アプリは `client/src/index.css:3` → `@import '.../base.css'` → `base.css:38` → `@import './tokens-v4.css'`
  → `tokens-v4.css:45-46` → `fonts/lineseedjp.css` ＋ `tokens.css`。
- **`tokens-v4.css` は `tokens.css` の置き換えではありません。** 実測:
  - `tokens.css` が定義する CSS 変数 **88 個**、`tokens-v4.css` が定義するのは **27 個**。
  - **`tokens-v4.css` にしか無い変数は 0 個**（新しい名前は増やさない方針・`tokens-v4.css:11-12`）。
  - つまり `tokens-v4.css` は **27 個を上書きするだけ**の薄い層。
- 上書きされる 27 個（`tokens-v4.css:48-113`）:
  `--background` `--card` `--muted` `--secondary` `--accent` `--sidebar-accent` /
  `--foreground` `--card-foreground` `--popover-foreground` `--secondary-foreground` `--sidebar-foreground`
  `--muted-foreground` `--accent-foreground` `--sidebar-accent-foreground` /
  `--primary` `--ring` `--sidebar-primary` / `--border` `--input` `--sidebar-border` /
  `--success` `--warning` `--destructive` `--info` / `--font-sans` `--font-mono-num` / `--radius`
- ⚠️ **`tokens-v4.css` には `.dark` のブロックが1つもありません**（`grep dark` で0件）。
  一方 `tokens.css:196` に `.dark { … }` があり、そこで `--background: 20 22 26` などを定義しています。
  `:root`（0,1,0）と `.dark`（0,1,0）は**特異度が同じ**で、`@import` は先頭にしか書けないため
  **`tokens.css` の `.dark` が先・`tokens-v4.css` の `:root` が後**になります。
  → **同じ特異度なら後勝ちなので、`tokens-v4.css` を読むと `.dark` の 27 個が効かなくなります。**
- **これは今まで表に出ていません。** v4 の3アプリで `.dark` を付ける画面は**0件**（実測）。
  `.dark` を使っているのは **凍結中の qsheet の3画面だけ**:
  `OnAirPage.tsx:312-315` / `PrompterPage.tsx:91-94` / `RundownPage.tsx:161-162,177-181`（既定 `dark`）。
  → §7-1 の最重要事項。

### 2-9. トースト13か所

`client-qsheet/src/lib/notify.ts` の4関数を呼んでいるのは **13 か所**（実測）:
`DashboardPage.tsx` 7 / `EditorPage.tsx` 3 / `OnAirPage.tsx` 3。
**放送中の切断通知は `OnAirPage.tsx:333`**（`notifyError("放送同期が切断されました", …)`）、
再接続は `:328`。マニュアル本文（`manual/content.tsx:269,369`）もこの文言を説明しています。
→ 設計書の「13か所・放送中の切断を含む」は**事実です**。

### 2-10. 採番・権限・API の前提

| 事実 | 出どころ |
| --- | --- |
| `generateSequenceNumber(seqName, prefix)` は `INSERT … ON CONFLICT (seq_name) DO UPDATE … RETURNING counter` でアトミック。返り値は `PREFIX-YYYYMM-NNNN`（4桁ゼロ埋め） | `sequence.service.ts:6-24` |
| **月が変わると counter は 1 に戻る**（`:16` の `CASE WHEN year_month = EXCLUDED.year_month`）。`sequences` 行は `seq_name` ごと。**新しい `seq_name` を足すのに migration は要りません** | 同上 |
| Qシート API は `createQsheetRoutes()`（`contexts/qsheet/index.ts:8-20`）。**公開の音声だけ `documentRoutes` より前**（`:12`） | 同 |
| `documents.routes.ts:12` が `router.use(requireAuth, requirePermission('qsheet'))` を**ルーター全体**に掛ける | 同 |
| 一覧は `SELECT d.*, u.name as creator_name, p.name as project_name, p.gls_number, (SELECT COUNT(*) …)::int as share_count`（`:32-37`）。**`d.*` なので `doc_no` を足せば自動で返ります** | 同 |
| 一覧の絞り込みは `status` / `episode_id` / `project_id` / `search`（title の ILIKE）。**`date` も `scope` も無い**。`ORDER BY d.updated_at DESC LIMIT 200`（`:72`） | 同 |
| 見える範囲は `isQsheetAdmin`（**`system_admin` のみ**）または作成者／共有先。存在秘匿のため 404（`access.ts:13-15,18-30`・`documents.routes.ts:99-102`） | 同 |
| ⚠️ **`canManage` はサーバーが返していません。** `DashboardPage.tsx:643` が `isAdmin \|\| doc.created_by === currentUser.id` を**クライアントで計算**して子部品に渡しています（`:131,138` は子の props） | `DashboardPage.tsx` |
| `POST /documents` は `requirePermission('qsheet','editor')`。INSERT する列は `id,title,data,episode_id,project_id,broadcast_date,episode_code,status,created_by,updated_by` の10列（`:113-127`） | `documents.routes.ts` |
| 認証のみで案件を引ける軽量 API が既にある（`lookup.routes.ts:10-42`。`gls-options` は `companies` と JOIN 済み） | 同 |
| `projects` のタブ条件は `project.service.ts:400-403`（ヨミ＝`gls_number IS NULL AND stage NOT IN ('e_lost')` / 進行中＝`gls_number IS NOT NULL AND stage NOT IN ('s_completed','e_lost')`） | 同 |
| `projects.stage` の CHECK は `neta,d_hold,c_proposal,b_verbal,a_won,s_completed,e_lost`（`001b:109-110`）。`gls_number TEXT UNIQUE`（NULL 可・`:107`） | 同 |
| `episodes` は `recording_date` / `broadcast_date` / `delivery_date` がすべて **TEXT**（`001b:142-144`） | 同 |
| migration 210 で `qsheet` の権限は残ったが、`manager` は実質「フルアクセス型の全員」（`210:7-15`） | 同 |
| `requirePermission(module, minLevel='reader')` は `system_admin` を素通し（`auth.ts:184-194`） | 同 |
| `queryAll/queryOne/execute` は `?` を `$n` に変換する（`connection.ts:13-18`）。`$n` を直接書いてもよい（既存が混在） | 同 |
| **存在しない表**（すべてこの設計群がこれから作るもの）: `qsheet_schedules` / `qsheet_schedule_items` / `qsheet_doc_index` / `production_journey_marks`。grep で0件 | 実測 |
| **存在しないディレクトリ**: `shared/src/production/` / `shared/src/schedule/` / `server/src/shared/production/` | 実測 |

### 2-11. 案件詳細「当日タブ」の現状

`client/src/contexts/sales/pages/projectDetail/DayTab.tsx`（137行）:

- **API 呼び出しは1本だけ**（`:106-109` の `GET /qsheet/documents?project_id=`）。
- ⚠️ **技術資料（`/techsheet/documents`）の呼び出しは既にありません。**
  `:14` に「技術資料アプリは削除済み（制作資料へのマージに向けてアプリごと削除した）」と明記。
  migration `211_drop_techsheet_schema.sql` も存在します。
- 開き方は素の `<a href>`（`:67,92`）で `/qsheet/editor/:id`（`:121`）。
- `:126-134` に「進み具合は**次のバージョンで対応予定**」の案内帯がある。

---

## §3 ルーティングの確定形

### 3-1. 新旧の対応表 — **公開URL5本は1文字も変えない**

「変えない」を**証明**するために、`path` 文字列そのものを並べます。
右2列が**完全一致**であることが、この段の合格条件です。

| # | 用途 | いまの `path`（`App.tsx` の行） | v4 後の `path` | 一致 |
| --- | --- | --- | --- | --- |
| 1 | 進行台本の編集 | `/qsheet/editor/:id` （`:39`） | `/qsheet/editor/:id` | **✔ 同一** |
| 2 | 本番・進行 | `/qsheet/onair/:id` （`:43`） | `/qsheet/onair/:id` | **✔ 同一** |
| 3 | 本番・ランダウン | `/qsheet/rundown/:id` （`:44`） | `/qsheet/rundown/:id` | **✔ 同一** |
| 4 | 本番・プロンプター | `/qsheet/prompter/:id` （`:45`） | `/qsheet/prompter/:id` | **✔ 同一** |
| 5 | 音声サポート（公開） | `/qsheet/audio/:id` （`:48`） | `/qsheet/audio/:id` | **✔ 同一** |

**5本について同時に守ること**（URL 文字列が同じでも、これを崩すと配った URL は死にます）:

| 守ること | 根拠 |
| --- | --- |
| ベースパスを `/qsheet/` から動かさない | `vite.config.ts:7`。動かすと**全アセットの URL が変わる** |
| 1〜4 は `ProtectedRoute` のまま、**5 だけ認証を掛けない** | `App.tsx:43-48`。`client-qsheet/CLAUDE.md:38`「認証を付けないこと」 |
| 2〜5 に `AppShell` を被せない（全画面のまま） | `App.tsx:42-48`。OBS のブラウザソースはヘッダーが出た瞬間に画面が壊れる |
| `serveApp('/qsheet', …)` を触らない | `server/src/app.ts:143` |
| 5 の**大文字小文字・末尾スラッシュ**を変えない | 配布済み QR は文字列一致 |

### 3-2. 追加・移動するルート

| `path` | 中身 | 備考 |
| --- | --- | --- |
| `/qsheet/login` | `LoginPage` | ★既存のまま（`:31`） |
| `/qsheet` | **1行の切り替え点**（§3-3） | いまは `DashboardPage`（`:37`） |
| `/qsheet/home` | `TopPage`（案件を選ぶ） | 新規。**画面はここに作る** |
| `/qsheet/sheets` | `SheetListPage`（旧 `DashboardPage` の一覧部） | 新規 |
| `/qsheet/editor` | → `/qsheet/sheets` へ転送 | いまは `DashboardPage`（`:38`） |
| `/qsheet/schedules` | `ScheduleListPage` | **段4 が作る**。段3では**ルートも足さない**（§10-2） |
| `/qsheet/schedules/:id` | `SchedulePage` | 同上 |
| `/qsheet/projects/:projectId` | `JourneyPage` | 新規 |
| `/qsheet/docs/:docId` | `JourneyPage`（資料単体） | 新規 |
| `/qsheet/settings` | `SettingsPage`（ハブ） | 新規 |
| `/qsheet/settings/schedule-templates` | 段4 | 段3 では足さない |
| `/qsheet/settings/masters` | 段5 | 段3 では足さない |
| `*` | 転送（§3-4） | いまは `RedirectOnce to="/qsheet"`（`:50`） |

### 3-3. 「1行で切り替えられる」の実装の具体形

**要件**（01 §8-1・§9-1・README §5-3）:
確認①（利用者判断）が取れるまでは `/qsheet` を**今の一覧のまま**にし、
取れたら `/qsheet` を**トップ（案件を選ぶ）**に向ける。**どちらでも実装コストは同じ**にする。

**やり方**: `App.tsx` の外に**定数を1つ**置き、`/qsheet` のルートはその定数だけを見る。

```
client-qsheet/src/routeSwitch.ts     ← 新規・**この1ファイルが切り替え点**

  /**
   * `/qsheet` を開いたときに何を出すか。
   *  'list' … 旧トップ（進行台本の一覧）。**既定**。ブックマークの意味が変わらない
   *  'home' … 新しいトップ（案件を選ぶ）
   * 利用者の確認（README §4 の確認13）が取れたら 'home' にする。**この1行だけ**を変える。
   */
  export const QSHEET_ROOT: 'list' | 'home' = 'list';
```

`App.tsx` 側は分岐を**1か所**に閉じ込めます:

- `/qsheet` の `element` を `QSHEET_ROOT === 'home' ? <RedirectOnce to="/qsheet/home" /> : <RedirectOnce to="/qsheet/sheets" />` にする。
- `/qsheet/home` と `/qsheet/sheets` は**常に両方存在する**（どちらに倒しても片方が 404 にならない）。

**なぜ `/qsheet` に画面を直接置かないか**（重要）:

- 画面を `/qsheet` に置くと、切り替えのたびに**2つのルートの `element` を入れ替える**ことになり、
  「1行」で済まなくなる（左メニューの `end` 判定・パンくず・下タブの現在地も一緒にずれる）。
- `/qsheet` を**常に転送だけ**にすれば、URL の正は `/qsheet/home` と `/qsheet/sheets` の2本に固定され、
  レジストリの `listPath`（§4）や左メニューの `to` を**一度も書き換えずに済みます**。

**⚠️ 転送の連鎖に注意（実装で必ず確かめる）**:

`RedirectOnce`（`shared/src/client/RedirectOnce.tsx:53-61`）は
**navigate から 200ms 後に `window.location.pathname.endsWith(to)` を見て、
一致しなければハード遷移（`window.location.replace`）します。**
`/qsheet/zzz` → （`*`）→ `/qsheet` → （切り替え）→ `/qsheet/home` という**2段の転送**にすると、
1段目の `to` は `/qsheet` なので `'/qsheet/home'.endsWith('/qsheet')` は **false** になります。
アンマウント時に `clearTimeout` される（`:63`）ので通常は無害ですが、
**200ms 以内にアンマウントされなければ全ページ再読み込みのループになります。**

→ **決め: 転送は必ず1段にする。** `*` の行き先は `/qsheet` ではなく
`QSHEET_ROOT === 'home' ? '/qsheet/home' : '/qsheet/sheets'`（＝最終地）にします。
`/qsheet/editor` → `/qsheet/sheets` も1段です。

**⚠️ `<Navigate replace>` は使わない。**
01 §1-1 は `/qsheet/editor` を `<Navigate to="/qsheet/sheets" replace>` と書いていますが、
01 §1-3 は「転送は `RedirectOnce` を使う。既存 `App.tsx` と揃える」と書いており、**設計書の中で矛盾しています**。
`RedirectOnce.tsx:4-19` に「`<Navigate>` は Firefox/Safari で `SecurityError` を誘発することがあるので置き換えた」
という経緯が明記されているので、**`RedirectOnce` に統一します**（§11 に記録）。

### 3-4. React Router 上で機械的に守ること

- **静的な区切りを `:param` より先に置く。** `/qsheet/:something` を**足さない**
  （足すと `/qsheet/home` `/qsheet/sheets` `/qsheet/settings` が全部食われる）。
  `client/src/App.tsx` に同じ注意書きの前例があります。
- `/qsheet/docs/:docId` と `/qsheet/editor/:id` は**別セグメント**なので衝突しません。
- `AppShell` を被せる範囲は**今と同じ考え方**（本番4画面と公開音声はシェル無し）。
- **別バンドルへの遷移は `navigate()` では飛べない**（`/sales/...` は `client` 側）。
  `window.location.assign()` を使う。`client-daily/src/App.tsx` に前例あり。
  逆向き（`DayTab.tsx:67,92`）も素の `<a href>` です。

---

## §4 ミニアプリのレジストリ

### 4-1. 置き場所 — **`shared/` に置く。ただし `shared/src/client/` には置かない**

```
shared/src/production/miniapps.ts          ← 唯一の正（純データ・純関数）
shared/src/production/journey.ts           ← JourneyStage / HintTone / Suggestion の型と定数
shared/src/production/docNo.ts             ← 資料番号の書式・表示整形
server/src/shared/production/miniapps.ts   ← **意図的な複製**（冒頭に「複製である」と書く）
server/src/shared/production/journey.ts    ← 同上
client-qsheet/src/miniapps/ui.tsx          ← アイコン・色（React / lucide はここだけ）
shared/tests/miniapps.test.ts              ← 重複禁止の固定
```

**`shared/` に置く理由（＝「触ると全アプリに効く」ことへの答え）**:

「全アプリに効く」のは、正確には **`shared/src/client/**` に置いたとき**です。理由は Tailwind:

- `client-qsheet/tailwind.config.ts:6-10` の `content` は
  `./src/**` と **`../shared/src/client/**`** を走査します（凍結の `client-live` も同じ）。
- `client/tailwind.config.ts:11-16` にコメントで実測が残っています —
  「`shared/src/client/**` に v4 の新しいクラス名を書くと、凍結4アプリの Tailwind も走査するので
  **あちらの CSS が増える**（実測: 部品1つで qsheet に4規則・231バイト）」。
- そのために **`shared/src/client-v4/**` という「v4 の3アプリしか content に入れない場所」**が既にあります。

→ **`shared/src/production/` は、どのアプリの `content` にも入っていません**（実測）。
つまり **CSS には1バイトも影響しません**。純データ・純関数（クラス名を1つも書かない）である限り、
`shared/` に置くことの副作用は**型の共有だけ**です。

**`client-qsheet/` に置かない理由**:

- 資料番号の接頭辞（`SB` / `SD`）と `docNoSeq` は **サーバーが採番に使います**
  （`docNo.service.ts` → `generateSequenceNumber(docNoSeq, docPrefix)`）。
  client にしか無いと、**サーバーが同じ文字列を書き写す**ことになり、必ず片方だけ変わります。
- 05-mcp.md の `app` enum が `MiniAppKey` を import する約束（01 §3-2 の注記）。
  MCP はサーバー側なので、client に置くと成立しません。

**`server/src/` に複製する理由**: サーバーは `server/src/` の外を import できません
（`server/src/shared/collab/yjsDoc.ts` 冒頭の明記と `scripts/check-collab-parity.mjs:2-12` の説明）。
**新しい仕組みは足さず、既存の parity 検査に相乗りします。**

### 4-2. 型（`MiniAppDef`）

01 §3-2 の型をそのまま採ります。**`listLabel` は入れません**（§4-4）。

| フィールド | 型 | 意味 | 不変か |
| --- | --- | --- | --- |
| `key` | `MiniAppKey` (`'sheet' \| 'schedule'`) | URL・API・集計キーに出る安定キー | **あとから変えない** |
| `label` | `string` | **画面と帳票に出す名前。ここ以外に書かない** | 変えてよい |
| `docPrefix` | `string` | 資料番号の接頭辞。**重複禁止** | 変えない（配った番号が意味を失う） |
| `docNoSeq` | `string` | `sequences.seq_name`。**重複禁止** | 変えない（連番が飛ぶ） |
| `table` | `string` | 資料を入れる表（`doc_no` 列を持つこと） | — |
| `listPath` | `string` | 一覧の URL | — |
| `docPath` | `string` | 資料1件の URL のひな形（`:id` を置換） | — |
| `stages` | `JourneyStage[]` | 主に効く段（`day` / `flow` / `script`） | — |
| `enabled` | `boolean` | `false` の間はレジストリ由来の導線に出さない | — |

初期値（**2件で打ち止め。増やすときは1件ずつ**）:

| `key` | `label` | `docPrefix` | `docNoSeq` | `table` | `listPath` | `docPath` | `stages` | `enabled` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sheet` | **進行台本** | `SB` | `prod_doc_sb` | `qsheet_documents` | `/qsheet/sheets` | `/qsheet/editor/:id` | `flow`,`script` | **段3で `true`** |
| `schedule` | **スケジュール表** | `SD` | `prod_doc_sd` | `qsheet_schedules` | `/qsheet/schedules` | `/qsheet/schedules/:id` | `day` | **段3では `false` / 段4で `true`** |

⚠️ **`schedule` の `enabled` は段3では `false` にします。**
01 §3-2 は「`enabled` も `true` にします（`false` のままだと 02 が作った画面が左メニューにも出ない）」
と書いていますが、これは **02 が作り終えた後の話**です。段3の時点では
`qsheet_schedules` も `/qsheet/schedules` も存在しないので、`true` にすると
**左メニューと「＋新しく作る」に、押すと 404 になる項目が出ます**
（`Suggestion.to` が `null` のときは導線を作らない、という 01 §4-4 の方針と同じ理由）。
**段4 の PR で `false` → `true` の1行を変える**のが段の境界です。→ §10-2。

エクスポートする関数（純関数のみ）:
`MINI_APP_BY_KEY` / `docPathOf(key, id)` / `miniAppOfPath(pathname)`（**長い path から先に見る**・
`apps.ts:209-214` の `appOfPath` と同じ作法） / `enabledMiniApps()`。

アイコンは `client-qsheet/src/miniapps/ui.tsx` の
`MINI_APP_UI: Record<MiniAppKey, { icon: LucideIcon; accent: string }>`。
**`Record` なので `MiniAppKey` を1つ足すとコンパイルエラーになります**（付け忘れが型で落ちる）。

### 4-3. 検査

| 検査 | 足すこと |
| --- | --- |
| `scripts/check-collab-parity.mjs:20-23` | `PAIRS` に `['server/src/shared/production/miniapps.ts','shared/src/production/miniapps.ts']` と `journey.ts` の対を追加。**`stripComments` がコメント差を許すので、複製側の「複製である」注記は自由に書けます** |
| `shared/tests/miniapps.test.ts`（新規） | `key` / `docPrefix` / `docNoSeq` / `listPath` / `docPath` の**重複禁止**、`docPath` に `:id` が含まれること、`enabled:false` が `enabledMiniApps()` に出ないこと、`miniAppOfPath` が長い path を優先すること |
| （既存 CI） | `check-collab-parity.mjs` は `ci.yml:88` と `server/package.json:6,8`（predev/prebuild）から走る。**新規の配線は不要** |

### 4-4. 名前について（`label` だけを画面に出す）

- **画面と帳票に出す名前は `label` だけ**: `進行台本` / `スケジュール表`。
- **`Qシート` / `qsheet` は内部識別子としてのみ残す**: URL（`/qsheet/...`）・テーブル名（`qsheet_documents`）・
  MCP ツール名・権限モジュール名。`awards` が「リアルタイムCG」の内部識別子として残っているのと同じ扱い
  （`apps.ts:149` と ルート `CLAUDE.md` の表）。
- **`listLabel` は作りません。** 同じものが `進行台本` / `香盤表` / `Qシート` / `台本` の4通りで
  呼ばれているのが `docs/wording.md` ルール1（1文に1つのことだけ書く／表記を複数作らない）に当たります。
  ⚠️ ただし **`docs/wording.md` には現在 `香盤表` も `Qシート` も `制作資料` も1件も載っていません**（実測）。
  「残す言葉（社内語）」という節も存在しません。→ 残すと決めるなら **節ごと新設**が要ります（§10・§11）。
- ⚠️ **`MINI_APPS` という名前は `client/src/contexts/platform/pages/home/AppTiles.tsx:79` に既にあります。**
  別物（日常業務のタイル内リンク）なので、レジストリ側は
  **`PRODUCTION_MINI_APPS` にするか、`AppTiles.tsx` 側を `DAILY_TILE_LINKS` に改名する**かのどちらかで
  衝突を消します。**既定は後者**（レジストリの名前は 01 §3-2 と 05-mcp.md が参照するため動かさない）。
  `AppTiles.tsx` の改名は**この段の PR に含めない**（`client/` を巻き込むため。別の小さい PR）。
  それまでは `grep` が2件返すことを承知しておく。

### 4-5. `shared/src/client/apps.ts` とは**別物**

`apps.ts` は「ONAiR にどんなブロックアプリがあるか」、`miniapps.ts` は「制作資料の中にどんな道具があるか」。
**混ぜると凍結の印（`frozen`）と権限モジュールの意味が壊れます。**
`shared/tests/miniapps.test.ts` と `shared/tests/apps.test.ts` は別ファイルのまま置きます。

---

## §5 DDL

### 5-1. migration 番号の振り直し（**README §6 の表は 1 つずれています**）

実際の最大は **211**（`211_drop_techsheet_schema.sql`）。したがって:

| README §6 の番号 | ファイル | **正しい番号** | 中身 | 依存 |
| --- | --- | --- | --- | --- |
| 211 | `qsheet_doc_no` | **212** | `qsheet_documents.doc_no` ＋部分 UNIQUE | — |
| 212 | `production_journey_marks` | **213** | ジャーニーの人のピン | — |
| 213 | `qsheet_schedule` | **214** | スケジュール表5本＋共有1本（`doc_no` 込み） | — |
| 214 | `qsheet_ai` | **215** | 提案・壁打ち・索引・ナレッジ・実尺 | **214 の後**（`qsheet_schedules` に FK） |
| 215 | `qsheet_import_batches` | **216** | Excel 取込の履歴 | — |
| 216 | `qsheet_mcp` | **217** | MCP 3列 ＋ `idempotency_key` | **215 の後** |
| 217 | `qsheet_audio_share` | **218** | 公開音声のトークンと失効 | — |

**この段（段3）が出すのは `212` と `213` の2本だけ**です。

⚠️ **番号を取り合わないための決めごと**（`migrate.ts:16` がファイル名順に流すだけなので、
CI では絶対に気づけません）:

1. **枝を切った時刻ではなく、マージされる直前に番号を確かめる。**
   PR を出す前に `ls server/src/shared/db/migrations | sort | tail -3` をもう一度見て、
   **他の PR が先に入っていたら自分の番号を上げてリネームする**。
2. **一度 `main` に入った migration のファイル名は絶対に変えない。**
   `_migrations` テーブルは**ファイル名で**実行済みを持つ（`migrate.ts:20,33`）ので、
   リネームすると既存 DB で**もう一度流れます**。`ADD COLUMN IF NOT EXISTS` などで冪等にしてあっても、
   `_migrations` に2行入って履歴が読めなくなります。
3. 番号が重複しても動きます（`206` が2本ある前例）が、**依存のある組（214→215→217）だけは絶対に順を守る**。

### 5-2. `212_qsheet_doc_no.sql`

```sql
-- 212_qsheet_doc_no.sql
-- 資料単体（案件に紐づかない資料）に配る番号。書式は SB-202608-0001。
-- 既存行への一括後付けはしない（→ 本文 §5-4）。
ALTER TABLE qsheet_documents
  ADD COLUMN IF NOT EXISTS doc_no TEXT;

-- NULL 同士は衝突しないので部分 UNIQUE で足りる。
CREATE UNIQUE INDEX IF NOT EXISTS idx_qsheet_documents_doc_no
  ON qsheet_documents (doc_no) WHERE doc_no IS NOT NULL;
```

**なぜ部分 UNIQUE か**: 素の `UNIQUE` でも PostgreSQL は NULL 同士を衝突させませんが、
**索引に NULL 行が全部載る**（現行の資料はほぼ全部 NULL）ため、索引が無駄に太ります。
`WHERE doc_no IS NOT NULL` にすると**採番済みの行だけ**が載ります。

**型を `TEXT` にする理由**: 既存の `episode_code` `broadcast_date` と揃える。
番号は「人が口頭で言う宛名」なので、**書式（`SB-` 接頭辞・月・4桁）ごと1つの文字列**で持つのが正。

⚠️ **`deleted_at` との組み合わせ**: 現行の削除は `SET deleted_at = NOW()`（論理削除・列は `TEXT`）。
部分 UNIQUE は `deleted_at` を見ないので、**削除した資料の番号は再利用できません**。
これは**意図した挙動**です（配った番号を別の資料に付け直すと現場が混乱する）。

### 5-3. `213_production_journey_marks.sql`

01 §4-3 の DDL をそのまま採ります。**型の方針だけ明記**します。

- `TIMESTAMPTZ` にする（`qsheet_documents` の `TIMESTAMP` / `deleted_at TEXT` を**踏襲しない**）。
  既存の不整合を新しい表に増やさないため。
- 行は**消さず** `cleared_at` を立てる（「決まった」と言ったあとに戻したこと自体がジャーニーの情報）。
- 生きているピンの一意制約:
  `UNIQUE (scope_type, scope_id, COALESCE(target_date,''), stage, kind, COALESCE(hint_key,'')) WHERE cleared_at IS NULL`
- 引き用: `INDEX (scope_type, scope_id) WHERE cleared_at IS NULL`
- `created_by TEXT NOT NULL REFERENCES users(id)`
- `scope_type` は `CHECK (IN ('project','document'))`、`stage` は `CHECK (IN ('day','flow','script'))`、
  `kind` は `CHECK (IN ('settled','watch','dismissed'))`。

⚠️ **`scope_id` に FK を張りません。** `scope_type` によって参照先が
`projects(id)` と `qsheet_documents(id)` に分かれる（多態）ため、
SQL の FK では表現できません。**参照が外れた行は API 側で落とす**（JOIN が外れたら返さない）。
これは 02 §3-3 の `linkBroken` と同じ考え方です。

### 5-4. 既存行への採番（バックフィル）

**結論: この段ではバックフィルを行いません。** 理由と、それでも要るときの手順を両方書きます。

**やらない理由**:

1. **番号は「配ったもの」**です。誰にも配っていない番号を後から生やすと、
   「口頭で言われた番号が資料に付いていない」という逆の混乱が起きます（01 §8-5）。
2. `generateSequenceNumber()` は **その月の連番**を返します（`sequence.service.ts:8,16`）。
   2024年に作った資料に `SB-202608-0031` を振ると、**番号の月と資料の月が食い違います**。
   月ごとに正しく振るには**採番関数を書き足す**ことになり、
   「既存のアトミックな採番を自作し直さない」という 01 §8-4 の判断に反します。

**それでも一括採番すると決めた場合の手順**（利用者判断・README §4 の確認4）:

| 順 | やること | 冪等性 |
| --- | --- | --- |
| 1 | 対象を決める: `project_id IS NULL AND deleted_at IS NULL AND doc_no IS NULL` | `doc_no IS NULL` を条件に入れるので**何度流しても増えない** |
| 2 | 並びを固定する: `ORDER BY created_at ASC, id ASC`（`created_at` は同値があり得るので `id` を第2キーに） | 同じ順を毎回再現できる |
| 3 | 月ごとに束ね、`to_char(created_at,'YYYYMM')` を書式の月に使う | — |
| 4 | 各月の連番は **`sequences` を経由せず** `ROW_NUMBER()` で振る | `sequences` を汚さない（未来の採番と混ざらない） |
| 5 | 振り終わったら、各月の `sequences.counter` を **その月の最大値以上**に押し上げる | ここを飛ばすと、**次の新規採番が既存の番号とぶつかって部分 UNIQUE 違反**になります |
| 6 | 5 は `INSERT … ON CONFLICT (seq_name) DO UPDATE SET counter = GREATEST(sequences.counter, EXCLUDED.counter)` | **`GREATEST` なので何度流しても下がらない** |

⚠️ **手順5を書き忘れると本番で必ず落ちます。** 現在 `sequences` に `prod_doc_sb` の行は無く、
最初の新規採番は `counter = 1` から始まります。バックフィルで `SB-202608-0001` を既に使っていると、
**次の新規作成が UNIQUE 違反で 500 になります。**

**新規採番の側（この段で作るもの）**:

- `server/src/contexts/qsheet/services/docNo.service.ts` に `issueDocNo(app: MiniAppKey)` を1本置く。
  中身は `generateSequenceNumber(MINI_APP_BY_KEY[app].docNoSeq, MINI_APP_BY_KEY[app].docPrefix)` だけ。
- 呼ぶのは `POST /qsheet/documents` の **`project_id` が無いときだけ**（01 §2-2）。
- **`sequences` に行を作る migration は要りません**（`ON CONFLICT` で最初の1回に作られる・`sequence.service.ts:13-19`）。
- **後から案件に紐づけても `doc_no` は消しません**（表示は「GLS を主・資料番号を副」）。

⚠️ **`POST /qsheet/documents` は現在 `data` を INSERT しています**（`documents.routes.ts:124-127`）。
`doc_no` を足すのは**同じ INSERT に列を1つ増やすだけ**です。
`data` をサーバーが書くのは**新規 INSERT のときだけ許される例外**（README §3-3）なので、
この変更は例外の範囲内です。**`UPDATE … SET data = …` は絶対に増やしません。**

---

## §6 ジャーニー API

### 6-1. `JourneyDay` の型（01 §4-5 を採る）

```ts
interface JourneyDay {
  date: string | null;   // 'YYYY-MM-DD'。null = 日が決まっていない資料
  label: string | null;  // その日の見出し（エピソードコード・回数・会場）。無ければ null
  stages: StageHint[];   // 常に day / flow / script の3件（順序固定）
  docs: { app: MiniAppKey; id: string; title: string; docNo: string | null; updatedAt: string }[];
  frames: JourneyFrame[];
  suggestions: Suggestion[];
}
```

`stages` は**必ず3件・必ずこの順**（`day` → `flow` → `script`）で返します。
「その段の資料が無い日は要素を落とす」ようにすると、**画面が段の欠落と 0 件を区別できなくなります**。

`StageHint.tone` は `'blank' | 'touched' | 'recent'` の3値のみ。
`facts[]` は `{ key, label, count?, at? }` で、**形容詞を持ちません**
（✗「まだ足りない」／○「3件・4日前に更新」）。

⚠️ **`recent` の7日は「最近動いた」の意味だけに使い、「止まっている」判定には使いません。**
ONAiR の案件は数か月更新され続けるので、`blank` は「まだ何も無い」であって「遅れている」ではありません。

### 6-2. `frames[]` — 枠と台本の対

```ts
interface JourneyFrame {
  scheduleId: string;
  itemId: string;
  columnLabel: string;
  title: string;
  kind: string;                  // 02 §3-3 の ItemKind
  startMin: number;              // その日の 00:00 JST からの分
  endMin: number;
  documentId: string | null;     // 02 §6-1「枠→流れの唯一の橋」。null = まだ台本が無い
  linkBroken: boolean;           // id はあるが JOIN が外れた＝台本が消されている
  durationGapMin: number | null; // 枠の長さ − 台本の合計尺（分）。**両方あるときだけ**
}
```

引き方: `qsheet_schedule_items` を
`LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL`。
`documentId` が非 NULL なのに JOIN 側が NULL なら `linkBroken: true`。

⚠️ **段3の時点では `qsheet_schedule_items` が存在しません。**
→ **決め: 段3 では `frames` を「常に空配列」で返す。**
型は今のうちに確定させ（`05-mcp.md` と `client` が参照するため）、
**中身は段4 の PR で埋めます**。空配列を返すのは「まだ無い」であって「壊れている」ではないので、
画面は `frames.length === 0` のときに何も描かないだけです。
`JourneyDay` から `frames` を**省略可能にしない**でください（`frames?:` にすると
段4 で必須化するときに全呼び出し側を直すことになります）。

`durationGapMin` は **`qsheet_doc_index.total_sec`（04 §2-3）**と突き合わせて出します。
`data` JSONB は**開きません**。尺の合計は必ず `shared/src/schedule/time.ts` の `docTotalSec()` を通す
（00 §3。素朴に `sections[].duration` を足すと**ロール尺が空の台本で 0 分**になり、
枠がまるごと空いているように見えます）。
⚠️ **`qsheet_doc_index` も `shared/src/schedule/time.ts` も、段3 の時点では存在しません**（実測）。
→ 段3 では `durationGapMin` を**常に `null`**（＝「両方あるときだけ出す」の規則どおり）。

### 6-3. `jsonb_array_length` のガード（**壊れた行1件で一覧が丸ごと 500 にならないように**）

`sheet_no_rows` の手がかりと `DocumentListRow.section_count` は「`data.sections` の件数」を要ります。
`data` 全体は台本まるごとで重いので、**SQL 側で件数だけ**取ります。

```sql
CASE WHEN jsonb_typeof(d.data->'sections') = 'array'
     THEN jsonb_array_length(d.data->'sections')
     ELSE 0 END AS section_count
```

**なぜ必ず要るのか**（実装で確認した事実にもとづく）:

- `qsheet_documents.data` の既定値は `'{}'`（`012:10`）。`'{}'->'sections'` は SQL NULL になり、
  `jsonb_array_length(NULL)` は NULL を返すだけで**無害**です。
- 危ないのは **`sections` が配列でない**行です。`data` は Yjs が書くので、
  サーバーはスキーマを検証していません（`documents.routes.ts:121` は
  `data && typeof data === 'object'` を見るだけで、中の形は見ません）。
  `sections` にオブジェクトや文字列が入った行が**1件でもあると**
  `jsonb_array_length` が `cannot get array length of a non-array` を投げ、
  **その1件のために全員の一覧が 500 で落ちます**。
- `jsonb_typeof(...) = 'array'` のガードを付ければ、壊れた行は `0` として数えられ、
  **他の人の一覧は生きたまま**です（数の正直さの作法にも合う: 数えられないものは数えない）。

**同じガードを掛ける場所**（1か所でも漏らすと同じ落ち方をします）:

| 場所 | 段 |
| --- | --- |
| `GET /qsheet/documents`（`section_count`） | 段3 |
| ジャーニーの `stages` の事実（`flow` / `script`） | 段3 |
| `sheet_no_rows` の手がかり | 段3 |
| `05-mcp.md §4-1 list_production_docs` | 段10 |

### 6-4. 「進み具合」に画一的な判定式を作らない

- サーバーは**数えた事実だけ**返します（件数・最終更新・有無）。**割合も閾値も返しません。**
- **「決まった」と言えるのは人がピンを押したときだけ**（`production_journey_marks`）。
- 02 §6-4 が持っていた `SCRIPT_THRESHOLD`（0.8）と `BreakdownStage` は
  **02 §11-3 で削除済み**です。復活させないこと。
- モックの「3本のバー」は**塗りの割合をやめ、3値の濃さ**にします
  （割合にすると「分母は何か」を決めることになり、それが判定式そのものです）。

### 6-5. 「次に決めること」（`Suggestion`）— 段3 で出すのは 3 件

| key | 条件 | 出どころ | 段3 で出すか |
| --- | --- | --- | --- |
| `no_schedule` | その日にスケジュール表が0件 | `qsheet_schedules` の件数 | **出さない**（表が無い・段4） |
| `no_sheet` | その日に進行台本が0件 | `qsheet_documents` の件数 | **出す** |
| `sheet_no_rows` | 台本はあるが `sections` が0 | `jsonb_array_length`（ガード付き） | **出す** |
| `duration_gap` | 枠と台本の尺が**両方ある**ときだけ差を出す | `qsheet_doc_index.total_sec` | **出さない**（索引が無い・段7） |
| `mic_unassigned` | `audio_mic` 列があるのに `assignments` が空の行 | `qsheet_doc_index.mic_unassigned_rows` | **出さない**（同上） |

- キーは `shared/src/production/journey.ts` の **`SUGGESTION_KEYS` に定数で置く**。
  05-mcp.md はそこを参照します（文字列を書き写すと 01 と 05 で件数が食い違う。
  検査で実際に4件と5件に割れていた）。
  **5件すべてを `SUGGESTION_KEYS` に定義し、段3 では出す関数を3件ぶんだけ登録する**
  （キーは `dismissed` の鍵なので、あとから足すと過去の「無視した」記録が拾えなくなる）。
- **索引に無い資料では `duration_gap` / `mic_unassigned` を出さない。**
  「出せない」と画面に書かない（無いものは黙って出さない）。
- **1件ずつ「無視する」ができ、無視したことも記録する**
  （`POST /journey/marks` の `kind:'dismissed'` ＋ `hint_key`）。
  これは将来 AI に「次に決めること」を書かせるときの**教師データの置き場所**です。
  ⚠️ **現状これは AI ではありません**（決め打ちの計数）。
  **AI にした瞬間に会社方針の5条件が掛かります** — そのときは
  `ai_outputs(kind='journey_next_action')` に全文を残し、`ai_corrections` に人の直しを取り、
  `production_journey_marks` の `dismissed` を成果指標側に紐づけること
  （`.claude/skills/ai-feedback-loop/`）。**今は経路だけ空けておきます。**
- `Suggestion.to` は**作れないときは `null`**（黙って何も起きない導線を作らない）。

### 6-6. API 一覧と権限

| メソッド | パス | 権限 | 返すもの |
| --- | --- | --- | --- |
| GET | `/api/v1/internal/qsheet/scopes` | `qsheet`（reader） | `ScopeCard[]`（4束） |
| GET | `/api/v1/internal/qsheet/scopes/project/:projectId/journey` | `qsheet` | `JourneyResponse` |
| GET | `/api/v1/internal/qsheet/scopes/document/:docId/journey` | `qsheet` ＋ `canAccessDoc` | 同上 |
| POST | `/api/v1/internal/qsheet/journey/marks` | `qsheet` **editor** | `Mark` |
| DELETE | `/api/v1/internal/qsheet/journey/marks/:id` | `qsheet` **editor** | `{ success: true }` |

- 置き場所は `server/src/contexts/qsheet/routes/scopes.routes.ts` と `journey-marks.routes.ts`。
  `contexts/qsheet/index.ts` に `router.use('/qsheet', scopesRoutes)` を足す。
  ⚠️ **`publicAudioRoutes` より後ろに置く**（`index.ts:12` の並びを崩さない）。
- **`documents.routes.ts:12` の `router.use(requireAuth, requirePermission('qsheet'))` は
  そのルーターだけに掛かります。** 新しいルーターには**自分で書く**必要があります
  （書き忘れると認証なしで案件名と顧客名が出ます）。
- **`sales` 権限は要求しません**（`lookup.routes.ts:8-10` に前例）。ただし顧客名を返すので
  `requirePermission('qsheet')` は掛けます。**金額・確度は返しません。**
- `docCounts` は**アクセス権で絞ってから数える**（`access.ts` の見える範囲）。
  数の正直さの作法（`shared/tests/countHonesty.test.ts`）に合わせ、
  **見えないものは数に入れない・その代わり数の横に説明を出す**。
- 表示語（「ネタ（検討中）」など）は**サーバーに置きません**。
  `SCOPE_GROUP_LABEL: Record<ScopeGroup, string>` を client に置くのが正
  （`apps.ts` の教訓＝名前を2か所に書かない）。
  ⚠️ 01 §2-3 は「将来 MCP 用の保険」として `label` をレスポンスに入れていますが、
  **これは名前を2か所に持つことなので、既定では落とします**（01 §8-10 も「落としてよい」と書いています）。→ §10。

### 6-7. N+1 を作らない

- `days` は「その案件の `episodes` の `broadcast_date` / `recording_date`」と
  「その案件の資料の `broadcast_date`」の**和集合**で作る。
- 資料は `project_id = $1` で**1回だけ**引き、JS 側で日ごとに束ねる（1案件の資料は多くて数十件）。
- **`data` JSONB は一覧では読まない**（台本全体で重い）。要るのは `sections` の件数だけなので §6-3 の SQL で取る。
- ピンは `production_journey_marks` を `scope_type/scope_id` で**1回だけ**引いて JS 側で配る。

---

## §7 凍結解除の手順と影響範囲

### 7-1. ⚠️ 最重要 — **`tokens-v4.css` を読むと、本番3画面の暗い地の色が消えます**

**設計書 01 §0-1 と 07 §2 が想定していない事故です。**

| 事実 | 出どころ |
| --- | --- |
| `OnAirPage` `PrompterPage` `RundownPage` は `<html>` に **`.dark` クラスを付ける** | `OnAirPage.tsx:312-315` / `PrompterPage.tsx:91-94` / `RundownPage.tsx:161-162,177-181`（ランダウンは既定 `dark`） |
| 暗い色は `tokens.css:196` の `.dark { --background: 20 22 26; … }` が持っている | `tokens.css` |
| `tokens-v4.css` に **`.dark` のブロックが無い**（`grep dark` で0件） | `tokens-v4.css` |
| `tokens-v4.css:45-46` は `@import './tokens.css'` を**先頭**に置き、その後 `:48` から `:root { … }` を書く | 同 |
| `:root` と `.dark` は**特異度が同じ**（どちらも 0,1,0）→ **後に書かれたほうが勝つ** | CSS の仕様 |

→ `client-qsheet/src/index.css:2` を `tokens.css` から `base.css`（＝`tokens-v4.css` 経由）に替えると、
**`tokens-v4.css` の `:root` が `.dark` を上書きし、
`/qsheet/onair/:id` の地の色が `#1a1d24` から `#f7f8fa`（ほぼ白）になります。**
放送中の進行卓が真っ白になる、という壊れ方です。

⚠️ **今まで表に出ていない理由**: v4 の3アプリで `.dark` を付ける画面は **0 件**（実測）。
`.dark` を使っているのは凍結中の qsheet の3画面だけなので、
**この不具合は「qsheet を v4 に載せた瞬間に初めて現れます」。**

**対処（どちらの判断でも必要）**:

| 判断 | やること |
| --- | --- |
| (a) 本番画面も v4 の見た目にしてよい | **`tokens-v4.css` に `.dark` のブロックを足す**（27個のうち面・文字・罫の色を暗側の値で書く）。**`shared/` を触るので全アプリに効く**（ただし `.dark` を使うアプリが他に無いので実害は qsheet だけ） |
| (b) 本番画面だけ旧トークンで固定（§0-1 の既定） | `.qs-legacy-shell` のスコープに **`.dark` 側の値も含める**（下の §7-4）。`tokens-v4.css` は触らない |

**どちらにしても、`verify:ui` の `dark: true` の2ページ（`verify-ui.mjs:108-109`）で
地の色が `rgb(20, 22, 26)` のままであることを実測してから PR を出します。**

### 7-2. 凍結の印を外す作業（**CI を落とすのは `check:frozen` ではありません**）

| # | ファイル | 変更 | これを忘れると |
| --- | --- | --- | --- |
| 1 | `scripts/check-frozen-css.mjs:47` | `qsheet` の行を `APPS` から外す | ⚠️ **CI は落ちません**（`check:frozen` は CI に無い・§2-6）。落ちるのは**手元で `npm run check:frozen` を回したときだけ** |
| 2 | `scripts/frozen-css-baseline.json` | `apps.qsheet` を消す。**`history[]` は消さない**（過去の理由は資産） | 1 を外せば読まれないが、残すと「見ていないのに基準がある」状態になる |
| 3 | `shared/src/client/apps.ts:147` | `frozen: true` を落とす | 一覧・アプリ切替に出ない（`visibleApps()`・`apps.ts:202`） |
| 4 | `shared/tests/apps.test.ts:39` | 凍結を `['awards','liveops']` の2つに直す | **`npm test` が落ちる**（CI `ci.yml:83`） |
| 5 | `shared/tests/apps.test.ts:106-108` | `includeFrozen` のテストから `qsheet` を外す | 同上 |
| 6 | `client/src/contexts/platform/pages/HomePage.tsx:88` ／ `home/AppTiles.tsx:61` | `qsheet` を `EVENT_KEYS` から `DAILY_KEYS` へ移すか、両方に残さないか決める | ⚠️ `AppTiles.tsx:56-60` に「**両方直さないとタイルが二重に出るか、どこにも出なくなる**」と明記。`HomePage.tsx:78-82` の「消してはいけません」の注記も**根拠が変わる**（凍結が外れれば上辺バーからも開ける）ので、注記を書き替える |
| 7 | `scripts/check-shared-wiring.mjs:207` | `V4_APPS` に `client-qsheet` を足す | ⚠️ **`npm run lint` が落ちます**（`:236-238`「凍結アプリを共通シェルに載せ替えないこと」）。**共通シェルを使う PR で必ず踏みます** |
| 8 | `scripts/check-shared-wiring.mjs:241-257` | `NoticeBar` / `ConfirmHost` の期待値を 1 に。**`wantToaster` の `client-qsheet === 1` は残す**（トーストは残す・§7-5） | 帯を置いた瞬間に「期待 0 個」で落ちる |
| 9 | `client-qsheet/CLAUDE.md:1,5-29` | 「v4.0.0 のスコープ外（凍結）」の節と「やってはいけないこと」を、**v4.1 で解いた後のルール**に書き替える | 次に触る人が古い禁止事項に従う |
| 10 | ルート `CLAUDE.md` のブロックアプリ表 | `client-qsheet/` の「v4.0.0」列を「凍結」から「対象」に | 同上 |
| 11 | `docs/v4-native-ui-plan.md:12,48,341` | 「凍結4アプリ … 対象外のまま」の記述を更新 | 同上 |

**段階的にやってよいもの／必ず同じ PR のもの**:

- **7 と 8 は「共通シェルに載せ替える PR」と同じ PR**でなければ `npm run lint` が落ちます。
- **3・4・5 は同じ PR**（`apps.ts` を直してテストを直さないと `npm test` が落ちます）。
- **6 は 3 と同じ PR**（`frozen` を落とすと上辺バーに出るので、タイルの二重表示になる）。
- **1・2 は最後でよい**（CI に無いので他を止めません）。ただし**忘れると
  `npm run check:frozen` が永久に赤**になり、`live`/`awards` の検査ごと信用されなくなります。

### 7-3. 本番4画面の見た目に波及する範囲（**具体的なセレクタ/変数名**）

`client-qsheet/src/index.css:2` を `tokens.css` → `base.css` に替えたときに、
`/qsheet/onair/:id` `/qsheet/rundown/:id` `/qsheet/prompter/:id` `/qsheet/audio/:id` で
**実際に描画が変わるもの**を全部並べます。

#### (A) 色（`tokens-v4.css:48-113` の `:root` が上書きする 27 変数）

| 変数 | いま（`tokens.css`） | v4 後 | 4画面で目に見える形 |
| --- | --- | --- | --- |
| `--background` | `250 250 250` `#fafafa` | `247 248 250` `#f7f8fa` | 公開音声の地の色。**`.dark` の3画面は §7-1 の事故** |
| `--foreground` | `24 27 32` `#181b20` | `26 29 36` `#1a1d24` | 本文の黒 |
| `--primary` | `0 90 173` `#005aad` | `0 91 172` `#005bac` | 進行の強調・ボタン・`--ring` |
| `--destructive` | `#c81919`（純赤） | `199 36 58` `#c7243a`（赤紫寄り） | **ON AIR の赤・押し表示・警告バッジの色相が変わる** |
| `--success` | `#148550` | `25 122 75` `#197a4b` | 予定どおりの表示 |
| `--warning` | `#eb8d00`（山吹） | `194 65 14` `#c2410e`（濃い橙） | **押し／巻きの表示が大きく変わる** |
| `--info` | `#007bbd`（青） | `67 56 202` `#4338ca`（青紫） | **色相が変わる** |
| `--border` `--input` `--sidebar-border` | `220 223 228` `#dcdfe4` | `230 233 237` `#e6e9ed` | **罫線が薄くなる**（ランダウンの行の区切り・キューの枠） |
| `--muted` `--secondary` | `243 244 246` | `242 244 247` | 面の灰 |
| `--muted-foreground` | `92 99 112` `#5c6370` | `93 100 112` `#5d6470` | 補助文字 |
| `--accent` `--sidebar-accent` | （`tokens.css` の値） | `234 244 251` `#eaf4fb` | hover の面 |
| `--accent-foreground` / `--sidebar-accent-foreground` | 同上 | `0 91 172` | 淡い青の面の文字 |
| `--card` `--card-foreground` `--popover-foreground` `--secondary-foreground` `--sidebar-foreground` `--sidebar-primary` `--ring` | — | — | 上と同系 |

#### (B) 書体（**いちばん大きく見た目が変わるところ**）

| 変数 / 仕組み | いま | v4 後 | 4画面で目に見える形 |
| --- | --- | --- | --- |
| `--font-sans` | `'Noto Sans JP', …`（`tokens.css:255`） | `'LINE Seed JP', 'Noto Sans JP', …`（`tokens-v4.css:92`） | **全文字の字面が変わる** |
| `--font-mono-num` | `'Roboto Condensed', …`（`tokens.css:258`） | `var(--font-sans)`（`tokens-v4.css:98`） | ⚠️ **`.font-oswald`（`index.css:52-54`）が `--font-mono-num` を読んでいます。** 進行のタイマー・残り時間の**数字が別書体に変わり、字幅も変わります**（桁が揃わなくなる可能性）。要実測 |
| `@font-face`（LINE Seed JP） | 読まない | `tokens-v4.css:45` → `fonts/lineseedjp.css` | `client-qsheet/CLAUDE.md:18`「LINE Seed JP を追加しない」に正面からぶつかる |
| ウェイト | `font-medium`(500) / `font-semibold`(600) がそのまま | LINE Seed JP は **400/700/800 しか無い**（`tokens-v4.css:88-91`）。`client/tailwind.config.ts` は `v4Preset` で 500→400 / 600→700 に潰しているが、**`client-qsheet/tailwind.config.ts:5` は `v4Preset` を継承していない** | **合成太字（偽ボールド）**になり、字面が濁る。→ `v4Preset` の継承も同時に要る |
| 字詰め | 掛けていない | `base.css` が `palt`/`kern` を掛ける | ⚠️ `tokens-v4.css:119-127` の `.font-number` は打ち消しだが、**進行の数字が `.font-number` を使っていない**（`.font-oswald` を使っている）。要実測 |

#### (C) 角丸

| 変数 | いま | v4 後 | 目に見える形 |
| --- | --- | --- | --- |
| `--radius` | `0.5rem` = **8px**（`tokens.css:106`） | **12px**（`tokens-v4.css:112`） | shadcn の `rounded-md` = `calc(var(--radius) - 2px)` なので、**ボタン・入力欄・選択欄の角が 6px → 10px**。4画面の全ボタンに効く |
| `:root .rounded-card` ほか | 定義なし | `tokens-v4.css:185-206` が `.rounded-card` `.rounded-note` `.rounded-badge` `.rounded-control` などを上書き | 4画面が**その名前のクラスを使っていれば**効く（要 grep） |

#### (D) `base.css` を読むと足で入るもの（色以外）

| 仕組み | 影響 |
| --- | --- |
| `html, body, #root { height: 100% }` | ⚠️ **いま `client-qsheet/src/index.css:8-13` は `height` を1つも指定していません**（`overflow-x: hidden` と `max-width: 100vw` だけ）。`base.css` を読むと高さの持ち方が変わり、**全画面の4画面のレイアウトが動く可能性**がある。要実測 |
| `@media print` の解除 | PDF/印刷の挙動が変わる可能性（Qシートはサーバー側 pdfkit なので影響は小さい見込み・**未確認**） |
| `@layer base` の重複 | `client-qsheet/src/index.css:7-49` の `@layer base` と `base.css` の `@layer base` が両方効く。**同じプロパティを二重指定している箇所は後勝ち**になる |
| `tokens-v4.css:232-` `@media (max-width: 1023px)` ほかの v4 専用規則 | 4画面のスマホ表示が動く可能性。要実測 |
| `.v4-*` アニメーション（`tokens-v4.css:438-` 以下） | クラス名を使っていなければ**描画は変わらない**が、**CSS のバイト数は増える**（`check:frozen` を外していれば止まらない） |

#### (E) 共通シェルに載せ替えたときだけ効くもの

- `AppShell` は `<NoticeBar />` と `<ConfirmHost />` を**自分で持ちます**（`AppShell.tsx:22-26`）。
  → §7-2 の 8。
- `AppShell` の根は **`h-full`** 前提（`AppShell.tsx:14-19` に「`h-screen`(100vh) にすると iOS で下端が切れる」）。
  → (D) の `height: 100%` が**前提条件**。**片方だけ入れると崩れます。**
- **本番4画面には `AppShell` を被せません**（`App.tsx:42-48` のまま・07 §2）。

### 7-4. 「本番画面だけ旧トークンでスコープ固定」案の実装形（§0-1 の既定）

```
client-qsheet/src/styles/legacy-onair.css   ← 新規
```

**中身の形**:

1. `tokens.css` の `:root { … }`（88変数）を **`.qs-legacy-shell { … }` として複製**する。
   ⚠️ **27個だけではなく 88個すべてを複製します。**
   27個だけだと、`tokens-v4.css` が触っていない `--primary-surface` `--warning-border` などは
   `:root`（＝v4 の値ではなく `tokens.css` の値）を継ぐので一見よさそうに見えますが、
   **`--primary` だけ v4 の値・`--primary-border` だけ旧の値**という**組み合わせが崩れた状態**になります。
   面と枠と文字は組で設計されているので、**組ごと固定する**のが正です。
2. **`.dark` 側も複製する**（§7-1）:
   `.qs-legacy-shell.qs-dark { … }` に `tokens.css:196-` の `.dark` の値を写し、
   `OnAirPage` / `PrompterPage` / `RundownPage` は `<html>` の `.dark` に加えて
   **自分のルート要素に `qs-dark` も付ける**。
   （`<html>` に付けたままだと `tokens-v4.css` の `:root` に負けるため、**スコープの中に持ち込む**）
3. 書体を戻す: `.qs-legacy-shell { --font-sans: 'Noto Sans JP', …; --font-mono-num: 'Roboto Condensed', …; }`。
   ⚠️ ただし **`@font-face` の読み込み元は `index.html`**（`client-qsheet/index.html:12-14` が
   Google Fonts の Noto Sans JP と Roboto Condensed を読んでいる）。
   **この `<link>` を消さない**こと。消すと代替書体になります。
   → **`npm run check:fonts` / `check-fonts-vendored.mjs` は
     「v4 の3アプリが LINE Seed JP を同梱しているか」しか見ないので、ここは機械が守りません。**
4. 角丸を戻す: `.qs-legacy-shell { --radius: 0.5rem; }`。
   ⚠️ `tokens-v4.css:185-206` の `.rounded-card` などは **`:root .rounded-card`** という形なので、
   `.qs-legacy-shell` の中でも効きます（特異度 0,2,0 対 0,1,0）。
   戻すには `.qs-legacy-shell .rounded-card { … }` を**同じ数だけ**書く必要があります（10前後）。
5. 付ける先: `OnAirPage` / `RundownPage` / `PrompterPage` / `AudioSupportPage` の**ルート要素**。
   4ファイルに1クラスずつ。
6. 字詰めの打ち消し: `.qs-legacy-shell { font-feature-settings: normal; }`
   （`base.css` の `palt`/`kern` を戻す）。

**この案の弱いところ（正直に書く）**:

- **`:root` を前提に書かれた共通部品**（`shared/src/client/ui/` の shadcn 部品）は
  `.qs-legacy-shell` の中にあれば変数を継ぐので効きますが、
  **ポータル（`Dialog` / `Popover` / `Toast` / `Tooltip`）は `<body>` 直下に描かれる**ので
  **スコープの外に出ます**。4画面が出すダイアログ・トーストだけ v4 の色になります。
  → ⚠️ **`OnAirPage.tsx:333` の切断トーストは `<Toaster />` 経由で `<body>` 直下**です。
    **放送中の切断通知だけ色が変わる**、という一番避けたい形になり得ます。**要実測**。
  → 逃げ道: `.qs-legacy-shell` を**ルート要素ではなく `<html>` か `<body>`**に付ける
    （`document.documentElement.classList.add('qs-legacy-shell')` を4画面の `useEffect` で）。
    `OnAirPage.tsx:312-315` が既に `.dark` で同じことをしているので、作法は揃います。**こちらを既定にします。**
- 88変数 ＋ `.dark` ＋ 角丸10前後 を**手で複製する**ので、
  `tokens.css` を将来直したときに**片方だけ変わります**。
  → **機械で守る**: `scripts/check-collab-parity.mjs` の `PAIRS` には入れられない（CSS で形が違う）ので、
    **`shared/tests/` に「`tokens.css` の `:root` の変数名の集合 ⊆ `legacy-onair.css` の `.qs-legacy-shell` の集合」
    を確かめるテストを1本足す**（名前の抜けだけは機械が止められる。値の食い違いは止められない）。

### 7-5. トーストは残す（`NoticeBar` に寄せない）

- `notify.ts` の **13 か所は触りません**（§2-9）。`NoticeBar` は**新画面だけ**。
- 理由: `OnAirPage.tsx:333` の「放送同期が切断されました」を含むため。
  **放送中に出るものの見え方を、画面の作り直しのついでに変えない。**
- `check-shared-wiring.mjs:254` の `wantToaster = (app === 'client-qsheet') ? 1 : 0` は**そのまま残します**。
- ただし §7-2 の 8 で `NoticeBar`/`ConfirmHost` の期待値を 1 にすると、
  **同じアプリにトーストと帯が両方いる**状態になります。これは**意図した過渡状態**なので、
  `check-shared-wiring.mjs` のコメントに**なぜ両方いるのかを1行書き足します**
  （書かないと、次に読む人が片方を消します）。

### 7-6. `verify:ui` の期待値の反転

`scripts/verify-ui.mjs` で `/qsheet/` を `FROZEN_PREFIX`（`:155`）から外すと、期待値がこう変わります:

| 検査 | 凍結中（いま） | 解除後 |
| --- | --- | --- |
| 地の色（明） | `rgb(250, 250, 250)`（`:445`） | `rgb(247, 248, 250)`（`:446`） |
| 地の色（暗・`dark:true` の2本） | `rgb(20, 22, 26)`（`:440`） | **同じ**（§7-1 を守れていれば） |
| 書体 | `Noto Sans JP` を含む（`:457`） | `LINE Seed JP` を含む（`:461`） |
| 書体が実際に描かれたか | 見ない | **見る**（`:472`） |
| 字詰め `palt` | 見ない | **見る**（`:474`） |
| バッジの列がそろう / 金額の右端 ±0.5px | 見ない（`:484`） | **見る**（`:485-486`） |

⚠️ **`FROZEN_PREFIX` は正規表現1本で `/qsheet` `/live` `/awards` を同時に見ています。**
`qsheet` だけ外すには正規表現を `/^\/(live|awards)\//` にします。
**(b) 本番画面だけ旧トークン、を採る場合は、逆に「`/qsheet/onair` `/qsheet/rundown` `/qsheet/prompter`
`/qsheet/audio` だけを旧の期待値で見る」形が要ります**（`FROZEN_PREFIX` を
`/^\/(live|awards)\/|^\/qsheet\/(onair|rundown|prompter|audio)\//` にする）。
また `PAGES`（`:106-109`）には**プロンプターと公開音声が入っていません**。
凍結解除で見た目が動く4画面のうち2画面が測られていないので、**2本足します**。

---

## §8 PR の切り方

**目安は 1 PR = 1画面**（`docs/branching.md`）。この段は**7本**に割ります。
番号は入れる順です。**A と B は入れ替え不可**（A が無いと B の lint が落ちる）。

| # | 種類とタイトル | 触る場所 | 依存 | 検証 |
| --- | --- | --- | --- | --- |
| A | `chore(qsheet): 制作資料の凍結を解いた` | `apps.ts` / `apps.test.ts` / `HomePage.tsx` / `AppTiles.tsx` / `check-shared-wiring.mjs` / `check-frozen-css.mjs` / `frozen-css-baseline.json` / `client-qsheet/CLAUDE.md` / ルート `CLAUDE.md` / `docs/v4-native-ui-plan.md` | — | `lint` / `test` / `check:frozen`（**`live`/`awards` だけになったことを確認**） |
| B | `feat(qsheet): ミニアプリのレジストリを足した` | `shared/src/production/*` / `server/src/shared/production/*` / `client-qsheet/src/miniapps/ui.tsx` / `check-collab-parity.mjs` / `shared/tests/miniapps.test.ts` | A | `typecheck:all` / `test` / `node scripts/check-collab-parity.mjs` |
| C | `feat(qsheet): 資料番号（doc_no）を採れるようにした` | migration `212` / `docNo.service.ts` / `documents.routes.ts`（POST に列1つ） | B | `verify:up` → `db:migrate` → 新規作成で `SB-YYYYMM-0001` が返ること |
| D | `feat(qsheet): ジャーニーのピンを足した` | migration `213` / `journey-marks.routes.ts` | B | `verify:up` → `db:migrate` → POST/DELETE と `cleared_at` |
| E | `feat(qsheet): トップ（案件を選ぶ）を作った` | `scopes.routes.ts` / `TopPage.tsx` / `routeSwitch.ts` / `App.tsx`（`/qsheet/home`・`/qsheet` の転送） | B,C | `verify:ui`（新画面）／375px |
| F | `feat(qsheet): 制作のジャーニーを作った` | `journey.service.ts` / `scopes.routes.ts` / `JourneyPage.tsx` / `App.tsx`（`/qsheet/projects/:id`・`/qsheet/docs/:id`） | D,E | 同上 ＋ **壊れた `data.sections` を1件仕込んで一覧が 500 にならないこと** |
| G | `refactor(qsheet): 進行台本の一覧を /qsheet/sheets に移した` | `SheetListPage.tsx`（`DashboardPage` 解体）／ `App.tsx`（`/qsheet/sheets`・`/qsheet/editor` 転送）／`documents.routes.ts`（`date` / `scope` / `section_count` / `canManage`） | E | `verify:ui` ／ **旧 `/qsheet/editor` から転送されること** |

**`docs/changelog.d/` の1文案**（枝の名前でファイルを作る。この枝なら
`docs/changelog.d/claude-qsheet-v4-coding-guide-udbo1u.md`）:

| PR | 1文 |
| --- | --- |
| A | 制作資料（Qシート）の凍結を解いた。アプリ一覧とアプリ切替に出るようになり、v4 の検査（共通シェル・CSS の据え置き）の対象から外した。**本番4画面（進行・ランダウン・プロンプター・公開音声）の URL と見た目は変えていない。** |
| B | 制作資料の中の道具（進行台本・スケジュール表）を1か所に登録する仕組みを足した。名前・資料番号の接頭辞・URL をここだけに書けば、一覧・件数・作成メニューの全部に出る。 |
| C | 案件に紐づかない資料に、口頭で言える番号（`SB-202608-0001`）が付くようにした。既存の資料には後から付けない。 |
| D | 制作のジャーニーで「ここは決まった」「ここは要注意」を人が押せるようにした。**押した記録も、外した記録も残る。** |
| E | 制作資料のトップを「案件を選ぶ」画面にした。進行中の案件・案件化前・ネタ・案件に紐づかない資料の4つに分けて出す。**`/qsheet` の行き先は1行で切り替えられる。** |
| F | 案件ごとに「当日の枠 → 番組の流れ → 台本の中身」の3段で今の状態を見られるようにした。**進み具合の判定はしない** — 資料の件数と最後に触った日だけを出し、「決まった」と言えるのは人が押したときだけ。 |
| G | 進行台本の一覧を `/qsheet/sheets` に移した。日付・自分が作った／共有された、で絞り込めるようにした。旧 `/qsheet/editor` は転送する。 |

**PR を出したら、確認を待たずにその場で `.claude/skills/pr-watch` を使って見張る（マスト）。**
**マージしたら `npm run reviews:debt` でレビュー指摘を棚卸しに移す。**

---

## §9 検証手順

### 9-1. 手元の門（**全 PR 共通・この順で**）

```
npm run verify:up          # 検証用 Postgres（約4秒・ポート5433・本番とは完全分離）
npm run db:migrate         # 新しい migration が流れること
npm run typecheck:all      # ⚠️ 既定の typecheck は3アプリだけ。qsheet を触るので :all
npm run lint               # check-shared-wiring / check-ui-tokens / check-file-size ほか
npm run test               # shared の Vitest（apps.test / miniapps.test）
```

⚠️ **`npm run typecheck`（既定）では `client-qsheet` を見ません**（`package.json:23`）。
この段は必ず **`typecheck:all`**（`:24`）を使ってください。

### 9-2. 凍結解除の PR（A）だけ追加で回すもの

```
npm run build:all          # 約2分。dist の CSS が要る
npm run check:frozen       # → 「live / awards の2本だけ」になっていることを目で確認
```

⚠️ `check:frozen` は **CI に入っていません**（§2-6）。**手元で必ず回してください。**
回さないと、`qsheet` を外し忘れたことに**誰も気づけません**（外し忘れると、
次に `shared/src/client/` を触った人が「qsheet の CSS が変わった」で止まります）。

### 9-3. 見た目を触る PR（A・E・F・G）

```
npm run verify:ui                    # 全ページ
npm run verify:ui qsheet             # qsheet のページだけ
```

**必ず目で確かめること**（機械が見ていないもの）:

| 見るもの | 期待 | 根拠 |
| --- | --- | --- |
| `/qsheet/onair/<id>` の地の色 | **暗いまま**（`rgb(20,22,26)`） | §7-1 |
| `/qsheet/rundown/<id>` の地の色 | 暗いまま | 同上 |
| `/qsheet/prompter/<id>` の地の色 | 暗いまま | 同上（**`verify-ui.mjs` の PAGES に無い**。手で開く） |
| `/qsheet/audio/<id>` | 明るいまま・書体が変わっていない | 同上（PAGES に無い） |
| 進行のタイマーの数字 | 桁が揃っている（`--font-mono-num` を変えていない） | §7-3 (B) |
| 切断トーストの色 | 変わっていない | §7-4 の弱いところ |
| 新画面 375px | 横スクロールが出ない・タップ 44px 以上 | ルート `CLAUDE.md` UI/UX ポリシー |

### 9-4. 壊れたデータでの確認（F・G）

**検証 DB に手で1件仕込んで、壊れないことを確かめます**（§6-3）:

1. `qsheet_documents` の1件に `data = '{"sections": {}}'`（配列でない）を入れる。
2. `GET /qsheet/documents` が **200 で返り**、その資料の `section_count` が `0` になること。
3. ジャーニーの一覧も 200 で返ること。
4. 済んだら**その行を消す**（検証データが残ると次の人が原因を追うことになる）。

### 9-5. 編集画面の IME（この段では**触らないので回さない**）

`npm run verify:ime` は**編集画面を叩く前提**で書かれています（`verify-ime.mjs:21,58`）。
**この段では `/qsheet/editor/:id` を触らない**ので回す必要はありませんが、
**段5（`06-editor.md`）で編集画面を作り直すときは同じ PR で直します**（01 §0-1 の 3）。

---

## §10 未決・要確認

### 10-1. 確認①（本番4画面の見た目）が決まるまで**着手できない**もの

**確認①**＝ README §4 の #1／01 §9-12:
「本番4画面の見た目を v4 に変えてよいか。(a) 変えてよい ／ (b) 本番画面だけ旧トークンで固定（既定）」

| 止まるもの | なぜ |
| --- | --- |
| `client-qsheet/src/index.css:2` の import を替える | (a) か (b) かで**やることが根本的に違う**（§7-1・§7-4） |
| `client-qsheet/src/styles/legacy-onair.css` の新設 | (b) のときだけ要る。88変数＋`.dark`＋角丸の複製 |
| `client-qsheet/tailwind.config.ts` に `v4Preset` と `client-v4` の content を足す | 見た目を v4 にすると決めてから |
| `verify-ui.mjs` の `FROZEN_PREFIX` の書き替え | (a) なら qsheet を丸ごと外す／(b) なら本番4画面だけ残す（§7-6） |
| `check-frozen-css.mjs` から qsheet を外す | (b) でも CSS は変わるので外すが、**外す前に (b) の実装が入っている**必要がある |
| **新画面を v4 の見た目にすること全部**（E・F・G の見た目） | tokens が決まらないと色も書体も角丸も決められない |

### 10-2. 確認①が決まらなくても**先に進められる**もの

| 進められるもの | なぜ |
| --- | --- |
| **PR B（レジストリ）** | 純データ・純関数。CSS を1バイトも増やさない（§4-1）。`shared/src/production/` はどの Tailwind の `content` にも入っていない |
| **PR C（`doc_no`）** | migration ＋ サーバー。画面に出さなければ見た目に影響しない |
| **PR D（ピンの表）** | 同上 |
| **サーバー側の `scopes` / `journey` API**（E・F の**サーバー部分だけ**） | 返す JSON は見た目と無関係。画面を後から被せられる |
| **`documents.routes.ts` の `section_count` / `date` / `scope`**（G のサーバー部分） | 同上 |
| **`shared/tests/miniapps.test.ts`** | 純関数のテスト |
| **PR A の一部**（`apps.ts` の `frozen` を落とす・タイルの整理） | ⚠️ **見た目は変わらないが、アプリ切替に出るようになる**。凍結解除の意思表示なので、**確認①と同時に出すのが素直** |

→ **決め: 確認①が取れるまで B → C → D →（E・F・G のサーバー部分）を進め、
A と 画面の見た目は確認①の後**にします。

### 10-3. その他の未決（利用者判断・README §4 と 01 §9 から、この段に関わるものだけ）

| # | 確認すること | 既定（決まらないときの動き） |
| --- | --- | --- |
| 13 | **`/qsheet` を「案件を選ぶ」に変えてよいか** | `routeSwitch.ts` の `QSHEET_ROOT = 'list'` のまま（**今の一覧**）。取れたら1行を `'home'` に |
| 01 §9-2 | 資料番号の書式（`SB-202608-0001` か短い `SB-2608-003` か） | **`SB-202608-0001`**（既存の採番関数をそのまま使う。短くするなら採番関数を1本書き足す） |
| 01 §9-3 | 接頭辞（`SB` / `SD`） | そのまま |
| 01 §9-4 | 既存資料に番号を後付けするか | **しない**（§5-4） |
| 01 §9-8 | ピンを押せる人の範囲 | `requirePermission('qsheet','editor')`。⚠️ **案件の資料が1件も見えない人でも押せてしまう**（01 §8-11） |
| 01 §9-10 / 02 §12 | スケジュール表の呼び名 | 「スケジュール表」・URL `/qsheet/schedules`・表 `qsheet_schedules`（02 が正） |
| 01 §9-15 | **「香盤表」を現場の言葉として残すか** | 残さない（`listLabel` を作らない）。⚠️ 残すなら `docs/wording.md` に**「残す言葉（社内語）」の節ごと新設**が要る（§2-3・§11） |
| 01 §9-16 | 台本の作成経路を2本にしてよいか（トップの「＋新しく作る」と 02 §6-2「枠から作る」） | 2本作る。**初期値のサービス関数は1本**（`POST /qsheet/documents`）にして、2か所から呼ぶ |
| 01 §8-10 | `ScopesResponse` の `label` | **落とす**（名前を2か所に持たない）。MCP が要るときに足す |

### 10-4. 実装時に手を動かして確かめるもの（利用者判断ではない）

| # | 確かめること | どう確かめるか |
| --- | --- | --- |
| 1 | **`.font-oswald` の数字が `--font-mono-num` の変更で幅が変わるか** | 進行のタイマーを `verify:ui` で実測。桁がずれるなら `.qs-legacy-shell` で戻す（§7-3 B） |
| 2 | **`base.css` の `height: 100%` が本番4画面のレイアウトを壊さないか** | 4画面を実ブラウザで開く（§7-3 D） |
| 3 | **ポータル（Dialog / Toast）がスコープの外に出るか** | `.qs-legacy-shell` を `<html>` に付ける案で回避できるか実測（§7-4） |
| 4 | **`tokens-v4.css` の `.rounded-*` が `.qs-legacy-shell` の中でも効くか** | 特異度の実測（`:root .rounded-card` は 0,2,0） |
| 5 | **`check-ui-tokens` の `V4_DIRS` に `client-qsheet/src` を足したときの違反件数** | `node scripts/check-ui-tokens.mjs --update` で実測してから、足すか判断する |
| 6 | **`check-file-size` の `SCAN` に足したときの超過件数** | 実測済み: **11ファイル**（最大 1,073行）。**段3 では足さない**（段5 の編集画面の解体と同時） |
| 7 | 壊れた `data.sections` の実件数 | 検証 DB で `SELECT count(*) FROM qsheet_documents WHERE jsonb_typeof(data->'sections') NOT IN ('array') AND data ? 'sections'` |

---

## §11 設計書との食い違い

**設計書（README / 01 / 02 / 07）と実装がずれていた点を全部並べます。**
「重大」＝そのまま実装すると壊れるか、判断が変わるもの。

| # | 重大度 | 設計書の記述 | 実装の事実 | この文書での扱い |
| --- | --- | --- | --- | --- |
| 1 | **重大** | 01 §0-1「tokens を `tokens-v4.css` に差し替えると、本番4画面の**見た目も同時に変わる**」（＝色が変わるだけの話として書かれている） | `tokens-v4.css` に **`.dark` のブロックが1つも無い**。`:root`（後）が `tokens.css` の `.dark`（先）を同特異度で上書きするため、**`.dark` を付ける本番3画面（OnAir / プロンプター / ランダウン）の地の色が暗色から白に変わる**。v4 の3アプリで `.dark` を使う画面は0件なので、**この不具合は qsheet を載せた瞬間に初めて現れる** | §7-1 に独立節。(a)(b) どちらの判断でも**追加作業が要る**ことを明記 |
| 2 | **重大** | README §6「現在の最大は 210」／01 §7-1 も同じ | **実際の最大は 211**（`211_drop_techsheet_schema.sql`）。README の割り当ては 211 から始まっており、**1つずれている** | §5-1 で 212〜218 に振り直し |
| 3 | **重大** | 01 §0「凍結 CSS の検査を外し忘れると **CI が『CSS が変わった』で落ちる**」 | **`check:frozen` は CI に入っていません**（`ci.yml` は typecheck:all / lint / test / collab-parity / check:version / check:ui-tokens の6つだけ）。**外し忘れても CI は緑のまま** | §2-6・§7-2・§9-2。実際に CI を落とすのは `check-shared-wiring.mjs:236-238` と `apps.test.ts:39` |
| 4 | **重大** | 01 §6-3「検査に足すもの」＝ `check-collab-parity` / `miniapps.test` / `apps.test` / `check-frozen-css` の**4つ** | 実際は最低 **7スクリプト**が `client-qsheet` を特別扱いしている。特に **`check-shared-wiring.mjs:236-238` は「凍結アプリを共通シェルに載せ替えないこと」で `npm run lint` を落とす** — 01 §1-4 が「共通シェルに載せ替える」と決めているので**必ず踏む** | §2-7 に全部の表。§7-2 に手順 |
| 5 | 高 | 01 §0 / §5-2「DayTab は `GET /qsheet/documents` と **`/techsheet/documents`** の**2本**を叩く」「技術資料側の `DocList` は触らない・`client-techsheet` は凍結のまま」 | **技術資料アプリは削除済み**（`DayTab.tsx:14` に明記・`211_drop_techsheet_schema.sql` も存在）。DayTab の API 呼び出しは **1本だけ**（`:106-109`） | §2-11。**「触らないファイル」の表から技術資料の行を落とす** |
| 6 | 高 | 01 §7-2「現行の一覧画面は `share_count` と **`canManage`** を読んでいる（`DashboardPage.tsx:202,212`）」＝**どちらもサーバーが返している**前提の書き方 | `share_count` は**サーバーが返す**（`documents.routes.ts:36`）が、**`canManage` はクライアント計算**（`DashboardPage.tsx:643` の `isAdmin \|\| doc.created_by === currentUser.id`）。`:202,212` は**子部品の props** | §2-10。`canManage` をサーバーに移すのは**機能追加**であって「今あるものを保つ」ではない、と PR G に明記 |
| 7 | 高 | 01 §3-2「`schedule` の `enabled` も **`true` にします**（`false` のままだと 02 が作った画面が左メニューにも出ない）」 | 段3 の時点では `qsheet_schedules` も `/qsheet/schedules` も**存在しない**。`true` にすると**押すと 404 になる項目**が左メニューと「＋新しく作る」に出る | §4-2。**段3 は `false`・段4 の PR で 1 行を `true`** に |
| 8 | 中 | 01 §1-1 は `/qsheet/editor` を **`<Navigate to="/qsheet/sheets" replace>`**、`/qsheet/*` を `RedirectOnce` と書き分けている | 01 §1-3 は「転送は **`RedirectOnce`** を使う。既存 `App.tsx` と揃える」。`RedirectOnce.tsx:4-19` に「`<Navigate>` は Firefox/Safari で `SecurityError` を誘発するので置き換えた」と経緯がある。**設計書の中で矛盾** | §3-3。**`RedirectOnce` に統一** |
| 9 | 中 | 01 §1-1 の表に `/qsheet/*` → `<RedirectOnce to="/qsheet">` ★既存のまま | 実装は `path="*"`（`App.tsx:50`）で `/qsheet/*` ではない（Vite の base があるので実害は同じ）。**加えて、`/qsheet` を転送にすると2段の転送になり、`RedirectOnce.tsx:53-61` のハード遷移フォールバックに触れる** | §3-3 に「転送は必ず1段」を明記 |
| 10 | 中 | 01 §1-4「スマホ下タブは3つ（`docs/design/v4/_rules.md`）: **案件 / 資料 / メニュー（`action:'menu'`）**」 | `_rules.md:151` は「下タブは **ホーム / やること / 探す** の3つ（Phase 6 で『メニュー』から差し替えた）／メニューは上辺バーの ☰ から開ける」。v4 の3アプリも実際にそう（例: `client-equipment/.../nav.ts:81-85`） | 型としては `action:'menu'` は今も存在する（`shell/types.ts:57`）が、**v4 の作法とずれている**。下タブの中身は**画面ができてから決める**（この段では決めない） |
| 11 | 中 | 01 §3-2 が `export const MINI_APPS` を新設 | `client/src/contexts/platform/pages/home/AppTiles.tsx:79` に**別物の `MINI_APPS` が既にある**（日常業務のタイル内リンク） | §4-4。**`AppTiles.tsx` 側を `DAILY_TILE_LINKS` に改名**（別 PR）。それまでは grep が2件返す |
| 12 | 中 | 01 §3-2「`香盤表` を現場の言葉として残すなら、`docs/wording.md`「**残す言葉（社内語）**」に説明つきで足してから」 | **`docs/wording.md` にその節はありません**（155行・「5つのルール」＋「言い換え表」のみ）。`香盤表` `Qシート` `制作資料` はいずれも1件も載っていない | §4-4・§10-3。残すなら**節ごと新設** |
| 13 | 中 | 01 §0「アプリ登録の唯一の正は `apps.ts`」（`qsheet` の呼び名は未確定という含み） | **`apps.ts:147` の `label` は既に `'制作資料'`**。`apps.test.ts:48-52` が固定済み。⚠️ ただし **`apps.ts:25-33` のヘッダーコメントは「いまは『Qシート』」のまま**で、自分の 147 行と食い違っている | §2-2。**PR A でコメントも直す** |
| 14 | 低 | 01 §0「`scripts/check-frozen-css.mjs:46`」 | 実際は **`:47`**（`:46` は `const APPS = [`） | §2-6 |
| 15 | 低 | 01 §0「ヨミ＝`gls_number IS NULL AND stage <> 'e_lost'`（`project.service.ts:400-406`）」 | 実際は **`:400-403`**、条件は `stage NOT IN ('e_lost')`（意味は同じ） | §2-10 |
| 16 | 低 | `check-frozen-css.mjs:3,131` のメッセージが「**凍結4アプリ**」 | `APPS` は **3つ**（技術資料は v4.1.8 で削除・`:8` に明記） | qsheet を外すと**2つ**になる。PR A でメッセージも直す |
| 17 | 低 | 01 §4-4 が `duration_gap` / `mic_unassigned` を初期5件に含める | `qsheet_doc_index` は **04 が作る表**で、段3 の時点では存在しない | §6-5。**段3 では 3 件だけ出す**（キーは5件とも `SUGGESTION_KEYS` に定義する） |
| 18 | 低 | 01 §4-5 が `frames[]` を `JourneyDay` の必須フィールドにする | `qsheet_schedule_items` は **02（段4）が作る表**で、段3 では存在しない | §6-2。**型は必須のまま・段3 は常に空配列**（`frames?:` にしない） |
| 19 | 低 | 01 §4-5 が `docTotalSec()` を `shared/src/schedule/time.ts` から使う | **`shared/src/schedule/` は存在しない**（00 と 02 が作る） | §6-2。段3 では `durationGapMin` は常に `null` |
| 20 | 低 | 01 §2-2 の DDL コメント「番号は着手時の最大＋1に振り直す。**現在の最大は 210**」 | #2 と同じ | §5-1 |

