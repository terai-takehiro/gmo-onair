# 段4 — スケジュール表（`02-schedule.md`）実装設計

> 対象の設計書: [`../02-schedule.md`](../02-schedule.md)
> 索引: [`../README.md`](../README.md) §3（5・6・7）／§4（確認 9・10・12・22・23）／§5-2（#11・#12・#13・#27・#29・#30）／§6／§7
> 依存: [`../00-datamodel-fixes.md`](../00-datamodel-fixes.md)（`docTotalSec`）・[`../01-app-structure.md`](../01-app-structure.md)（レジストリ・`doc_no`・ジャーニー）
>
> **この文書はコードを含みません。実装の手順と、着手前に確かめた事実を置く場所です。**
> 設計書と実装が食い違っていたところは §12 に全部書きました。

---

## 1. この段でやること

「当日の枠を置く」画面（ジャーニー段階2）を作る。

| # | 作るもの | どこ |
| --- | --- | --- |
| 1 | 専用テーブル **5本＋共有1本** の migration | §3 |
| 2 | 時刻・型・区分の共有モジュール（`shared/` ＋ **サーバー側の複製**） | §3-7 |
| 3 | 一覧／詳細／列／項目の CRUD API（項目単位の楽観ロック） | §4 |
| 4 | ひな形の下見（`preview`）と適用（`apply-template`） | §4-4 |
| 5 | 「枠 → 台本」の橋（新規作成・既存に結ぶ・外す） | §4-5 |
| 6 | ブレイクダウン（数だけ返す。判定式を作らない） | §4-6 |
| 7 | 逆引き（`documents/:docId/schedule-items`）＋ `canAccessSchedule` | §6 |
| 8 | Excel 書き出し（ExcelJS・3シート） | §7 |
| 9 | 一覧・グリッド・ひな形適用ダイアログ・モバイルの縦積み | §5 |
| 10 | ジャーニーの `frames[]` を繋ぐ | §8 |

**やらないこと**（設計書どおり・ここで確定させる）

- `qsheet_documents.data` への相乗り（§2-1 の理由。**構造上の要請**であって好みではない）
- Yjs の載せ替え（項目単位の 409 ＋ ポーリング）
- **重なりの DB 禁止**（`btree_gist` は入れない。画面で可視化する）
- **進み具合の画一的な判定式**（`BreakdownStage` / `SCRIPT_THRESHOLD` は復活させない）
- 尺の自動書き戻し（枠の分と台本の秒は別々に持ち、差を見せるだけ）
- 公開URL（ログイン不要）
- 表 → ひな形の逆流
- PDF

---

## 2. 実装前の事実確認

**すべて実際にファイルを読んで確かめたものです。** 確かめていないものは「未確認」と書きました。

### 2-1. migration

| 確かめたこと | 事実 | 出どころ |
| --- | --- | --- |
| **実在する最大番号** | **`211`** | `server/src/shared/db/migrations/211_drop_techsheet_schema.sql` |
| 総ファイル数 | 195 本（`171`〜`211` が直近） | `server/src/shared/db/migrations/` |
| **番号の重複が既に1件ある** | `206_drop_untracked_drift_tables.sql` と `206_weekly_unreviewed_notification.sql` の**2本が同じ 206** | 同ディレクトリ |
| 欠番 | `197` / `205` は存在しない | 同上 |
| 実行順 | **ファイル名の文字列ソートのみ**。番号が重複しても CI は落ちない | `server/src/shared/db/migrate.ts:16`（`readdirSync(...).filter(...).sort()`） |
| 1本 = 1トランザクション | `BEGIN` → SQL 全文 → `INSERT _migrations` → `COMMIT`。失敗で `ROLLBACK` | `server/src/shared/db/migrate.ts:29-40` |

⚠️ README §5-2 #31 が「移行番号が3重に衝突しても CI は落ちない」と書いていたのは正しく、
**`206` で実際に起きています**（設計書は「起こりうる」と書いたが、既に起きている）。

### 2-2. 既存テーブルの慣習

| 確かめたこと | 事実 | 出どころ |
| --- | --- | --- |
| `qsheet_documents.deleted_at` の型 | **`TEXT`**（`NOW()` を入れている） | `012_qsheet_schema.sql:25` ／ `documents.routes.ts:223` |
| `qsheet_documents` の時刻型 | `created_at` / `updated_at` は **`TIMESTAMP`（tz なし）** | `012_qsheet_schema.sql:23-24` |
| 新しめの表は `TIMESTAMPTZ` | `project_flow_templates` は `TIMESTAMPTZ` ＋ `deleted_at TIMESTAMPTZ` | `178_project_flow_templates.sql:33-36` |
| 共有テーブルの形 | `(doc_id, user_id)` の複合 PK ＋ `created_at` / `created_by`。**`deleted_at` は無い（総入れ替え）** | `102_qsheet_document_shares.sql:4-13` |
| `episodes.broadcast_date` | **`TEXT`（日付のみ。時刻を持たない）** → 02 §5-4 の「`episodes` は使えない」は正しい | `001b_postgresql_schema.sql:137-150` |
| `studio_locations` / `studio_rooms` | どちらも `id TEXT PRIMARY KEY` ＋ `name` ＋ `sort_order` ＋ `deleted_at`。`studio_rooms.location_id` は `NOT NULL` | `001b_postgresql_schema.sql:334-351` |
| 既存カレンダー系の時刻の持ち方 | **`TEXT`（ISO 文字列）**。`studio_bookings` の流儀にわざと合わせている | `122_partner_personal_calendar.sql:13-14` |
| ひな形の `anchor` / `offset` / `is_required` の前例 | `project_flow_tasks(anchor CHECK IN ('intake','event'), offset_days INTEGER, is_required BOOLEAN)` | `178_project_flow_templates.sql:46-62` |

→ **02 §3 の「新しい表は `TIMESTAMPTZ` に揃える」は既存の新しめの表と一致しています**（`178` と同じ）。
既存カレンダーの `TEXT` 流儀とは違いますが、**グリッドの時刻は `INTEGER` 分オフセットなので
そもそも同じ土俵に乗りません**（§3-1 の注記）。

### 2-3. 権限とアクセス制御

| 確かめたこと | 事実 | 出どころ |
| --- | --- | --- |
| **`canAccessSchedule` は無い** | `access.ts` にあるのは `isQsheetAdmin`（`role === 'system_admin'` のみ）と `canAccessDoc` の2本だけ | `server/src/contexts/qsheet/access.ts:13` / `:18` |
| 行権限の作法 | 管理者 → 作成者本人 → `qsheet_document_shares` の順。**無ければ 404**（403 ではない） | `access.ts:23-30` ／ `documents.routes.ts:154-157` |
| 削除だけ 403 | 「削除できるのは作成者本人または管理者」は **403** を返している（存在秘匿していない） | `documents.routes.ts:216-219` |
| 権限レベルの実効 | `LEVEL_ORDER = { reader:1, exporter:1, editor:2, manager:3, owner:3 }` → **`exporter` は `reader` と同値** | `server/src/shared/middleware/auth.ts:124-126` |
| `export-xlsx` の前例 | `requirePermission(module, 'exporter')` | `server/src/shared/utils/excel-resource.ts:82` |
| ルーターの権限は router 単位 | `documents.routes.ts` は先頭で `router.use(requireAuth, requirePermission('qsheet'))`。**別ファイルの router には効かない** | `documents.routes.ts:11` |

### 2-4. `expected_updated_at` と `BufferedInput`

| 確かめたこと | 事実 | 出どころ |
| --- | --- | --- |
| **楽観ロックを使う既存 API は1本だけ** | `PUT /qsheet/documents/:id`。他に `expected_updated_at` を読む場所は無い | 全文検索で 2 ファイルのみヒット（`documents.routes.ts:162` / `EditorPage.tsx:296`） |
| 409 のレスポンス形 | `{ code:'CONFLICT', message, current_updated_at, updated_by_name }`。`updated_by === req.user.id` なら「別のタブ/端末で更新」の文面に分岐 | `documents.routes.ts:159-180` |
| 判定は**ミリ秒の等値** | `new Date(...).getTime()` 同士の `!==`。`Number.isFinite` で両方守っている。**未送信なら素通し** | `documents.routes.ts:163-168` |
| PUT の戻り | `SELECT *` した行をそのまま返す（**`updated_at` が入っている**） | `documents.routes.ts:198-199` |
| クライアントの受け方 | `onSuccess` で `setDoc(prev => ({...prev, updated_at: saved.updated_at}))`。**編集中の `data` は触らない** | `EditorPage.tsx:302-308` |
| **`BufferedInput` の commit 契機** | `COMMIT_DELAY = 500`（打鍵が止まって 500ms）／ blur ／ IME 確定／**アンマウント** | `client-qsheet/src/lib/useBufferedValue.ts:25` `:62` `:66` `:79` `:90-96` |
| 自動保存の debounce | 台本側は **2 秒**。しかも **`conflictMsg` が立つと自動保存ごと止まる** | `EditorPage.tsx:428-438` |

⚠️ **アンマウント時の flush（`:62`）が重要です。**
行を消したり、ボトムシートを閉じたり、ポーリングで行が入れ替わっただけでも `onCommit` が飛びます。
**送信のキューを行コンポーネントの中に置くと、キューごと消えます**（§4-2 の実装方針の根拠）。

### 2-5. Excel ライブラリの現状

| 確かめたこと | 事実 |
| --- | --- |
| **`exceljs` はどこにも入っていない** | `server/package.json` / `shared/package.json` / ルート `package.json` のいずれにも無い。`.ts`/`.tsx`/`.json` 全文検索でも**ヒット0件**（`node_modules` を除く） |
| 入っているのは SheetJS | `"xlsx": "^0.18.5"`（`server/package.json:42`） |
| 実際に使っている3か所 | `server/src/shared/utils/excel.ts:3` ／ `contexts/platform/services/kessan-import.service.ts:19` ／ `contexts/awards/services/excel-import.service.ts:1` |
| 共通の出力ユーティリティ | `buildExcelWorkbook(sheets)`（`excel.ts:18`）と `excelResponse(res, filename, buf)`（`excel.ts:45`。`filename*=UTF-8''` で日本語ファイル名を通す） |
| SheetJS CE の制約 | `buildExcelWorkbook` は `!cols`（列幅）しか設定していない。**塗り・結合・見出し2段の経路が無い** |

→ **02 §10-2 の「03 の `exceljs` 生成器に相乗りする」は、相乗り先がまだ存在しません。**
03 §2-1 も「足す」という**決定**であって実装ではありません。§7 と §11 で扱います。

### 2-6. サーバーは `shared/` を import できない

| 確かめたこと | 事実 | 出どころ |
| --- | --- | --- |
| `server` の TS ルート | `"rootDir": "./src"` ／ `"include": ["src/**/*"]` | `server/tsconfig.json:7` `:19` |
| 実際の import 件数 | `server/src` から `@gmo-onair/shared` / `../../../../shared` を参照している行は **0件** | 全文検索 |
| 既にある回避策 | Yjs の変換層を **意図的に複製**し、`scripts/check-collab-parity.mjs` の `PAIRS` で一致を強制 | `server/src/shared/collab/yjsDoc.ts:1-3` ／ `scripts/check-collab-parity.mjs:20-23` |

→ **02 §7-4 と 00 §3-2 の「サーバーも `shared/src/schedule/time.ts` を呼ぶ」は、そのままでは実装できません。**
（§3-7 と §12-2 で対処）

### 2-7. その他（枠→台本の橋に効くもの）

| 確かめたこと | 事実 | 出どころ |
| --- | --- | --- |
| 新規作成の既定 `data` | `blocks` は **`scenario` / `video` / `audio` の3つで id は固定文字列**、`masters: { persons: [], video: [], audio: [], telop: [] }` を必ず入れている | `client-qsheet/src/pages/DashboardPage.tsx:503-509` |
| **新規作成はクライアントが `data` を組んでいる**（サービス関数は無い） | `POST /qsheet/documents` は `req.body.data` をそのまま入れるだけ | `documents.routes.ts:113` |
| collab の persist | `new YjsRoomManager(dbPersistence, 3000, 'qsheet-collab')` ＝ **3 秒 debounce で `data` を丸ごと上書き** | `server/src/contexts/qsheet/collab.ts:77` |
| 合計尺の実装（フォールバック有り） | `acc + (parseDur(s.duration) \|\| s.rows.reduce((a,r)=>a+parseDur(r.duration),0))` | `client-qsheet/src/pages/EditorPage.tsx:515-518` |
| `fmtAbs` の**実際の出力** | **`HH:MM:SS` のゼロ詰め**（`25:00:00`）。`25:30` ではない | `client-qsheet/src/lib/time.ts:34-40` |
| `parseDur` が読む形 | `HH:MM:SS`（区切りは `°:` と `':"`）／ `MM:SS`（`':."`）／ 整数秒 | `client-qsheet/src/lib/time.ts:9-23` |
| 採番関数 | `generateSequenceNumber(seqName, prefix)` → `PREFIX-YYYYMM-NNNN`。`INSERT … ON CONFLICT … RETURNING` でアトミック | `server/src/shared/services/sequence.service.ts:6-24` |
| API のベースパス | `app.use('/api/v1/internal', createRoutes())` | `server/src/app.ts:89` |
| qsheet の router 束ね | `router.use('/qsheet', publicAudioRoutes)` を**先に**、次に `documentRoutes` ほか | `server/src/contexts/qsheet/index.ts:8-19` |
| トランザクション補助 | `withTransaction(fn)`（`TxClient` は `?` プレースホルダを受ける） | `server/src/shared/db/connection.ts:106-124` |
| 現在のルート | `/qsheet`・`/qsheet/editor`・`/qsheet/editor/:id`・`/qsheet/onair/:id`・`/qsheet/rundown/:id`・`/qsheet/prompter/:id`・`/qsheet/audio/:id` | `client-qsheet/src/App.tsx:37-50` |

### 2-8. 検査スクリプトの守備範囲（**穴がある**）

| スクリプト | `client-qsheet` を見ているか | 出どころ |
| --- | --- | --- |
| `check-mobile-declared.mjs`（スマホ対応の宣言漏れ） | **見ていない**（`client` / `client-daily` / `client-equipment` の3つだけ） | `scripts/check-mobile-declared.mjs:24-47` |
| `check-file-size.mjs`（400行上限） | **見ていない**（`client/src` `client-daily/src` `client-equipment/src` `shared/src` のみ。**`server/src` も対象外**） | `scripts/check-file-size.mjs:27` `:30` |
| `check-ui-tokens.mjs` の v4 規則 | **`V4_DIRS` に入っていない**（別の緩い規則の対象にはなっている） | `scripts/check-ui-tokens.mjs:48` `:107-108` |
| `check-frozen-css.mjs` | **見ている**（`{ key:'qsheet', dir:'client-qsheet' }`） | `scripts/check-frozen-css.mjs:47` |
| `shared/src/client/apps.ts` | `frozen: true` のまま | `shared/src/client/apps.ts:147` |

→ **凍結を解くと同時に、上の3つに `client-qsheet` を足さないと、新画面が全部「無検査」で入ります。**
（段3 = 01 の凍結解除 PR に含めるのが自然。段4 の着手前提として §9 に検査項目を置きました）

### 2-9. `client/`（案件管理・カレンダー）側の予定の持ち方

- **スケジュール表と直接繋がるテーブルは無い。** 案件側の「当日」は
  `studio_bookings`（`start_time TEXT` / `end_time TEXT` の ISO 文字列・`studio_booking_rooms` で部屋を持つ）と
  `episodes.recording_date` / `broadcast_date`（**どちらも `TEXT` の日付のみ**）。
- 個人・パートナーの予定（`personal_events` / `partner_schedules`）は
  `TEXT` の ISO 文字列で、**権限区画が別**（`partner_schedule`）。
- **案件詳細の「当日タブ」は実在します**: `client/src/contexts/sales/pages/projectDetail/DayTab.tsx`。
  01 §5 の対象です（段4 では触りません）。
- ⚠️ **スケジュール表とスタジオ予約（`studio_bookings`）は別物です。**
  「会場を押さえた」のが予約、「その日どう動くか」が表。
  02 は `qsheet_schedule_columns.room_id → studio_rooms(id)` の1本しか繋いでおらず、
  **予約との突き合わせ（この部屋は本当に押さえてあるか）は設計に無い**。段4 では作りません（§11）。

---

## 3. DDL

### 3-0. 番号

**着手時点の実在最大は `211`。** README §6 の採番表は「最大 210」の前提で書かれているので、
**表ごと +1 して振り直します**（README §6 の指示どおり）。

**README §6 の順ではなく、README §7 の「実装の順序」で振ります**
（番号は「設計を書いた順」ではなく **`main` にマージされた順**で決まるため）:

| 予定番号 | ファイル | 段 | 出どころ | 依存 |
| --- | --- | --- | --- | --- |
| 212 | `212_qsheet_cue_actuals.sql` | 段1（07 §3・04 §5-3a） | 実尺 | — |
| 213 | `213_qsheet_audio_share.sql` | 段2（07 §4-1） | 公開音声のトークン | — |
| 214 | `214_qsheet_doc_no.sql` | 段3（01 §7-1） | `doc_no` ＋部分 UNIQUE | — |
| 215 | `215_production_journey_marks.sql` | 段3（01 §4-3） | 人のピン | — |
| **216** | **`216_qsheet_schedule.sql`** | **段4（この文書）** | 02 §3 | — |
| 217 | `217_qsheet_ai.sql` | 段7-8（04 §9） | 提案・壁打ち・索引 | **216 の後**（`qsheet_schedules` に FK） |
| 218 | `218_qsheet_import_batches.sql` | 段6（03 §10） | Excel 取込 | — |
| 219 | `219_qsheet_mcp.sql` | 段10（05 §8） | MCP 3列 | 217 の後 |

⚠️ **この表も「予定」です。枝を切った時点で必ず**

```bash
ls server/src/shared/db/migrations/ | sort | tail -3
```

**を実行し、そのときの最大＋1 を取ってください。**

⚠️ **実際に取り合いが起きています。** 同じ日に書かれた
[`01-cue-actuals-impl.md`](01-cue-actuals-impl.md) と
[`02-audio-share-token-impl.md`](02-audio-share-token-impl.md) は、
**どちらも「実測の最大 211 ＋1 = `212`」**と書いています。
どちらも単体では正しく、**先にマージされたほうが 212 で、あとは 213 に直す**しかありません。
**設計書に書いた番号を根拠にしないこと。**

**番号だけ合わせて中身を変えないこと** — `_migrations` は**ファイル名**で実行済みを判定するので、
一度検証環境に流したファイルの名前を変えると**もう一度流れます**（`migrate.ts:20-24`）。
**まだ流していないファイルの番号を変えるのは安全です。**

### 3-1. 本体 — `qsheet_schedules`

02 §3-1 の DDL を**そのまま採用**します（列の追加・削除はありません）。確定形:

```sql
CREATE TABLE IF NOT EXISTS qsheet_schedules (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL DEFAULT '',
  doc_no         TEXT,                                   -- SD-202608-0001（01 §2-2）
  service_date   DATE NOT NULL,
  location_id    TEXT REFERENCES studio_locations(id),
  project_id     TEXT REFERENCES projects(id),
  episode_id     TEXT REFERENCES episodes(id),
  view_start_min INTEGER NOT NULL DEFAULT 480,           -- 08:00
  view_end_min   INTEGER NOT NULL DEFAULT 1320,          -- 22:00
  slot_min       INTEGER NOT NULL DEFAULT 5 CHECK (slot_min IN (5, 10, 15, 30)),
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'fixed', 'archived')),
  notes          TEXT,
  created_by     TEXT REFERENCES users(id),
  updated_by     TEXT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,
  CHECK (view_end_min > view_start_min),
  CHECK (view_start_min >= 0 AND view_end_min <= 2880)
);
```

索引は 02 §3-1 の5本（`service_date` / `project_id` / `location_id` / `created_by` の部分索引と
`doc_no` の部分 UNIQUE）をそのまま。

**時刻の型について（確認済みの根拠）**

- `view_start_min` / `view_end_min` / `start_min` / `end_min` は **`INTEGER`（その日の 00:00 JST からの分）**。
  日跨ぎは `25:30 = 1530`、上限 `2880`（48時間）。
- 既存カレンダー系が `TEXT` の ISO 文字列なのは事実ですが（`122_partner_personal_calendar.sql:13-14`）、
  あちらは**絶対時刻**を持つ表で、こちらは**その日の中の相対位置**を持つグリッドです。
  `TIMESTAMPTZ` にすると全読み出しに `AT TIME ZONE 'Asia/Tokyo'` が要り、
  1箇所忘れると 9 時間ずれます（`flow-template.service.ts:112-135` に**実際に踏んだ**コメントが残っています）。
- `service_date` は `DATE`。**取り出しは必ず SQL 側で `to_char(service_date, 'YYYY-MM-DD')`**。
  `pg` は `DATE` を JS の `Date` で返すので、`toISOString()` すると UTC に寄って**1日ずれます**
  （同じく `flow-template.service.ts:131-134` の `ymd()` が回避している罠）。

### 3-2. 列 — `qsheet_schedule_columns`

02 §3-2 のまま。要点だけ再掲:

- `col_group TEXT NOT NULL CHECK (col_group IN ('venue','prep','ops'))`
- `room_id TEXT REFERENCES studio_rooms(id)` ＋ `CHECK (col_group = 'venue' OR room_id IS NULL)`
- `width_px INTEGER NOT NULL DEFAULT 160 CHECK (width_px BETWEEN 80 AND 640)`
- **`source_template_id` / `source_template_col_id` は `TEXT`。FK を張らない**（§3-6）
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` … 列単位の楽観ロックに使う
- 索引: `(schedule_id, col_group, sort_order) WHERE deleted_at IS NULL`

### 3-3. 項目 — `qsheet_schedule_items`

02 §3-3 のまま。要点:

- `kind` は9値（`setup` / `rehearsal` / `onair` / `recording` / `meal` / `standby` / `teardown` / `move` / `other`）
- `start_min` / `end_min` は `INTEGER`。`CHECK (end_min > start_min)` ＋ `CHECK (start_min >= 0 AND end_min <= 2880)`
- **`assignee` は `TEXT`。`users` を指さない**（社外の出演者が入るため。→ 確認23）
- `qsheet_document_id TEXT REFERENCES qsheet_documents(id) ON DELETE SET NULL`
- **`source_template_id` / `source_template_item_id` は `TEXT`。FK を張らない**（§3-6）
- 索引3本（`(column_id, start_min)` / `schedule_id` / `qsheet_document_id`）

⚠️ **`ON DELETE SET NULL` はまず発火しません。**
`qsheet_documents` はソフトデリート（`012_qsheet_schema.sql:25` の `deleted_at TEXT` に
`NOW()` を入れる。`documents.routes.ts:223`）なので、**行は物理的に残ります**。
したがって読み出しは必ず:

```sql
LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
```

とし、**`i.qsheet_document_id IS NOT NULL AND d.id IS NULL` を `link_broken: true` として画面に出す**。
黙って未リンク扱いにすると、作った人が台本を二重に作ります。

**重なりは DB で禁止しません。** `btree_gist` は入れません（README §5-3 の判断を維持）。
画面で重なりを可視化します（§5-3）。

### 3-4. ひな形3本 — `qsheet_schedule_templates` / `_template_columns` / `_template_items`

02 §3-4 のまま。`anchor`（`day` / `onair`）・`offset_min`（符号つき）・`duration_min`・`is_required` は
`project_flow_tasks`（`178_project_flow_templates.sql:46-62`）と**意図的に同じ形**です。

⚠️ **ひな形の列・項目テーブルには `deleted_at` も `updated_at` もありません**（設計どおり）。
ひな形の編集は「設定ページで作り直す」前提で、履歴を持ちません。
**したがって §11 の確認9（誰が直せるか）が (b)「監査ログと復元で守る」に倒れた場合、
その監査ログの置き場所がこの DDL には無い**ことを明記しておきます（→ §11-1）。

### 3-5. 共有 — `qsheet_schedule_shares`

`qsheet_document_shares`（`102_qsheet_document_shares.sql:4-13`）と**同じ形**にします
（複合 PK ／ `created_at` ／ `created_by` ／ `deleted_at` 無し ／ `user_id` の索引）。
違いは `created_at` を **`TIMESTAMPTZ`** にする点だけ（新しい表を古い不整合に合わせない）。

### 3-6. **`source_template_*` に FK を張らないことが仕様**

これは「うっかり省いた」ではなく、**構造で保証したい約束**です。

| もし FK を張ったら | 何が起きるか |
| --- | --- |
| `ON DELETE CASCADE` | ひな形を1つ消した瞬間に、**本番当日の表から項目が消える** |
| `ON DELETE RESTRICT` | **一度使ったひな形が永久に消せない** |
| （FK 無しでも）`JOIN` を1本書いたら | 「ひな形の名前を変えたら表の列名も追随してほしい」が通ってしまい、**適用済みの表が後から動く** |

**守り方（レビューで機械的に確認する3点）**

1. migration の `qsheet_schedule_columns` / `qsheet_schedule_items` に
   `REFERENCES qsheet_schedule_template*` の文字列が**1つも無い**こと。
2. `schedule.service.ts` / ルート層に、`source_template_id` を**キーにひな形側を読む SQL が無い**こと。
   読んでよいのは `schedule-template.service.ts` の `preview()` が
   「同じ `source_template_item_id` が既にあるか」を**この表の中だけで**数えるときだけ。
3. ひな形の行が消えても、この3列は**孤児のまま残す**。孤児であることが正常。

### 3-7. 共有モジュールの置き場所（**設計書のままでは実装できない箇所**）

02 §7-4 と 00 §3-2 は `shared/src/schedule/time.ts` を
「サーバー・クライアント・Excel・AI が全部呼ぶ」と書いていますが、
**サーバーは `shared/` を import できません**（§2-6 で確認）。

**採る形**（01 §3-1 のミニアプリ・レジストリと**同じやり方**。新しい仕組みは足さない）:

```
shared/src/schedule/time.ts            ← 唯一の正（純関数のみ。React も pg も import しない）
shared/src/schedule/types.ts           ← 02 §8-1 の型（クライアント用）
shared/src/schedule/kinds.ts           ← ItemKind ↔ 日本語名・色（画面と Excel の凡例が同じ物を読む）

server/src/shared/schedule/time.ts     ← 意図的な複製。冒頭に「複製である」と書く
server/src/shared/schedule/kinds.ts    ← 同上（Excel の凡例に要る）

scripts/check-collab-parity.mjs        ← PAIRS に上の2対を足す（コメント差は許容・実装差で exit 1）
shared/tests/scheduleTime.test.ts      ← 00 §3-2 の「ロール尺が空でも行の合計が返る」を固定
```

- `types.ts` は**複製しません**（サーバー側は Express の `req.body` を自前で検証するので、
  型を共有しても検査が増えません。03 §13 が「クライアントが必要としないものを複製しない」と
  書いたのと同じ理由の裏返しで、**サーバーが必要としない型は複製しない**）。
- `time.ts` と `kinds.ts` は**両側が実際に使う**ので複製が成立します
  （`yjsDoc.ts` の複製が成立している条件と同じ）。

**`shared/src/schedule/time.ts` に置く関数**（00 §3-2 ＋ 02 §7-4 の合併）:

| 関数 | 中身 | 注意 |
| --- | --- | --- |
| `fmtHm(min)` | 分オフセット → `"9:30"` / `"25:30"` | 24時で折り返さない |
| `fmtHmPad(min)` | 分オフセット → `"09:30"` / `"25:30"` | Excel・印刷用 |
| `parseHm(v)` | `"9:30"` / `"25:30"` / `"0930"` → 分。読めなければ `null` | **`null` を 0 に丸めない** |
| `fmtSpan(min)` | 所要 → `"1時間30分"` / `"45分"` | |
| `secToMinCeil(sec)` | 尺（秒）→ 分に切り上げ | 枠との突き合わせ用 |
| `parseDur(v)` | 尺文字列 → 秒（**現行実装をそのまま移す**） | `client-qsheet/src/lib/time.ts:9-23` |
| `fmtDur(sec)` | 秒 → `"1:30"` | |
| `fmtAbs(sec)` | 秒 → **`"25:00:00"`（`HH:MM:SS` ゼロ詰め）** | ⚠️ **現行の出力形を変えないこと**。§12-4 |
| `docTotalSec(sections)` | **ロール尺が空なら行の合計に落ちる** | `EditorPage.tsx:515-518` と同じ挙動 |

`client-qsheet/src/lib/time.ts` は**再輸出だけ**にする（`normalizeDur` / `fmtMinSec` / `fmtMmSs` は
Qシート専用なのでそのまま残してよい）。

---

## 4. API

すべて `/api/v1/internal/qsheet` の下（`server/src/app.ts:89` ＋ `contexts/qsheet/index.ts`）。
封筒は既存と同じ `{ success, data }` / `{ success, error: { code, message } }`。

**新しい router は2本**（`contexts/qsheet/index.ts` に `router.use('/qsheet', …)` で足す）:

```
routes/schedules.routes.ts           先頭に router.use(requireAuth, requirePermission('qsheet'))
routes/schedule-templates.routes.ts  同上
```

⚠️ **`requirePermission` は router 単位です**（`documents.routes.ts:11`）。
新しいファイルに書き忘れると**認証だけで素通り**します。

### 4-1. エンドポイント一覧

**A. スケジュール表**

| メソッド | パス | 権限 | リクエスト | レスポンス |
| --- | --- | --- | --- | --- |
| GET | `/schedules` | `qsheet` reader ＋ SQL に行条件 | query: `date_from` `date_to` `project_id` `location_id` `status` `search` | `Schedule[]`（`ORDER BY service_date DESC LIMIT 200`） |
| POST | `/schedules` | editor | `{ title, service_date, location_id?, project_id?, episode_id?, template_id?, onair_start_min? }` | 201 `Schedule` |
| GET | `/schedules/:id` | reader ＋ `canAccessSchedule` | — | `ScheduleDetail`（列・項目込み） |
| PUT | `/schedules/:id` | editor ＋ 行権限 | メタ ＋ `expected_updated_at` | `Schedule`（**新しい `updated_at` 込み**） |
| DELETE | `/schedules/:id` | editor ＋ **作成者本人 or `system_admin`** | — | `{ id }`（`deleted_at = NOW()`） |
| PUT | `/schedules/:id/shares` | editor ＋ 作成者 or admin | `{ user_ids: string[] }` | `{ share_count }`（総入れ替え） |

**B. 列と項目**

| メソッド | パス | リクエスト | レスポンス |
| --- | --- | --- | --- |
| POST | `/schedules/:id/columns` | `{ col_group, label, room_id?, color?, sort_order? }` | 201 `ScheduleColumn` |
| PUT | `/schedules/:id/columns/:columnId` | 部分更新 ＋ `expected_updated_at` | `ScheduleColumn` |
| DELETE | `/schedules/:id/columns/:columnId` | — | `{ id, deleted_items: number }`（**中の項目も同時にソフトデリート**） |
| PUT | `/schedules/:id/columns/reorder` | `{ order: { id, col_group, sort_order }[] }` | `ScheduleColumn[]`（**`expected_updated_at` を取らない**。理由 §4-3） |
| POST | `/schedules/:id/items` | `{ column_id, title, kind, start_min, end_min, assignee?, note? }` | 201 `ScheduleItem` |
| PUT | `/schedules/:id/items/:itemId` | 部分更新 ＋ `expected_updated_at` | `ScheduleItem`（**新しい `updated_at` 込み**） |
| DELETE | `/schedules/:id/items/:itemId` | — | `{ id }` |
| PUT | `/schedules/:id/items/bulk` | `{ items: { id, column_id?, start_min?, end_min?, expected_updated_at }[] }` | `{ items: ScheduleItem[] }` / 409 `{ conflicts: string[] }` |

**C. ひな形**（権限は §11-1 の確認9 が決まるまで **`system_admin`** で出す。理由は §11-1）

| メソッド | パス | 権限 | 中身 |
| --- | --- | --- | --- |
| GET | `/schedule-templates` | reader | 列・項目を入れ子で全部。query `location_id`（**指定拠点 ＋ `location_id IS NULL` を、具体的なほうを先に**。`templatesFor()` と同じ作法） |
| POST | `/schedule-templates/:tplId/preview` | reader | **保存しない下見。** `{ schedule_id, onair_start_min? }` → `ApplyPreview` |
| POST | `/schedules/:id/apply-template` | **editor** ＋ 行権限 | `{ template_id, column_ids, item_ids, onair_start_min? }` → `{ created_columns, created_items, skipped }` |
| POST / PUT / DELETE | `/schedule-templates[/:tplId]` ほか | ひな形編集の権限 | 作成・複製・更新・削除（`is_system` は削除不可・中身は直せる） |

**D. Qシートとの接続**

| メソッド | パス | 権限 | 中身 |
| --- | --- | --- | --- |
| POST | `/schedules/:id/items/:itemId/qsheet` | editor ＋ 行権限 | 文書を新規作成して結ぶ。201 `{ item, document }` |
| PUT | `/schedules/:id/items/:itemId/qsheet` | editor ＋ 行権限 ＋ **`canAccessDoc`** | `{ qsheet_document_id: string \| null }` |
| GET | `/schedules/:id/breakdown` | reader ＋ 行権限 | `ItemBreakdown[]`（§4-6） |
| GET | `/documents/:docId/schedule-items` | reader ＋ **`canAccessDoc` ＋ `canAccessSchedule`** | `ScheduleItemRef[]`（§6） |

**E. Excel**

| メソッド | パス | 権限 |
| --- | --- | --- |
| GET | `/schedules/:id/export-xlsx` | `qsheet` **exporter** ＋ 行権限 |

`exporter` は実効 `reader` と同値（`auth.ts:124-126`）ですが、
**後で「持ち出しだけ止めたい」と言われたときに1文字で変えられる**ので書き分けます
（`excel-resource.ts:82` の前例に合わせる）。

### 4-2. ⚠️ `expected_updated_at` × `BufferedInput` の 500ms 自動 commit（**README §5-2 #29**）

**何が起きるか（事実から）**

1. 項目名の欄は `BufferedInput`（IME を壊さないために必須）。
2. `useBufferedValue` は **打鍵が止まって 500ms で `onCommit`**（`useBufferedValue.ts:25` `:66`）。
   blur を待ちません。
3. `onCommit` を素直に `PUT /items/:itemId` に繋ぐと、長い題名を打つ間に**何度も PUT が飛ぶ**。
4. サーバーは毎回 `updated_at = NOW()` を進める。
5. 手元の `expected_updated_at` を更新しないと、**2回目の PUT が自分の1回目と 409** する。
   しかも `documents.routes.ts:170` の分岐で `updated_by === 自分` なので、
   **「別のタブ/端末で更新されています」という嘘のメッセージが出ます。**

**具体策（4つ。全部やる）**

**(a) PUT のレスポンスに必ず新しい `updated_at` を入れ、クライアントはそれで差し替える。**
既存の `PUT /documents/:id` が `SELECT *` した行を返し（`documents.routes.ts:198-199`）、
`EditorPage.tsx:302-308` が `updated_at` だけ差し替えている形を**そのまま写します**。
**編集中のローカル値（題名の途中）は上書きしない** — 差し替えるのは `updated_at` だけ。

**(b) 同じ項目への PUT を直列化する（in-flight は 1 本・後続は最新1件だけキュー）。**

- キーは `itemId`。**同じ項目に対しては同時に1本しか飛ばさない。**
- 飛んでいる間に来た commit は**上書き保存**（キューは長さ1。中間の打鍵を送る必要は無い）。
- in-flight が返ったら、返ってきた `updated_at` を使ってキューの1件を送る。
- ⚠️ **このキューは項目コンポーネントの中に置かない。**
  `useBufferedValue` は**アンマウント時にも commit を flush します**（`useBufferedValue.ts:62`）。
  行が消えた・シートを閉じた・ポーリングで差し替わった直後に commit が飛ぶので、
  キューが行と一緒に消えると**その1打鍵が永久に失われます**。
  → **ページ単位（`SchedulePage` の `useRef<Map<string, …>>`）に置く。**

**(c) `expected_updated_at` は「画面が最後に**サーバーから受け取った**値」。**
15 秒ポーリング（`GET /schedules/:id`）で見た値を使わない。
ポーリングは**表示の更新**であって、楽観ロックの基準ではありません。

**(d) ポーリングの取り込みは「in-flight / キューのある項目を除いて」行う。**
除かないと、自分が打っている最中の題名がサーバーの古い値で上書きされます
（`useBufferedValue` はフォーカス中の外部値を取り込まない作りですが、**行ごと差し替わると別物**です）。

**409 になったときの見せ方**（台本側と**変える**。02 §4 の判断）

- 台本は 409 で**自動保存ごと止まります**（`EditorPage.tsx:432`）。
- 進行表で同じことをすると、**当日の朝に全員が固まります。**
- → **409 になった項目だけを赤くし、その項目の編集を止める。他の項目は触れたまま。**
  赤い項目には「最新を読み込む」ボタンを出し、押したらその項目だけ再取得して差し替える。

**`PUT /items/bulk`（ドラッグ確定）は別扱い**

- **1件でも 409 なら全部やめて 409**（`withTransaction` で1トランザクション。`connection.ts:106`）。
  半分だけ動いた表を残さない。
- レスポンスに**競合した id の配列**を入れ、画面はその項目だけ元位置へ戻して赤くする。
- ドラッグは `BufferedInput` を通らないので、500ms 問題とは無関係。

### 4-3. `reorder` に `expected_updated_at` を取らない理由

並べ替えは「全体の順番」を送る操作で、**1件ごとの世代を比べる意味がありません**
（他人が1列足しただけで全体がやり直しになる）。
競合しても実害は「並びが相手の意図と違う」だけで、見れば分かり、押し直せば直ります。
**代わりに、`reorder` はレスポンスで全列を返し、画面はそれで差し替えます。**

### 4-4. ひな形の適用

**`preview` は保存しない。** `flow-template.service.ts:151-168` の `preview()` と同じ作法で:

- **時刻が解決できない項目も落とさずに `start_min: null` で返す。**
  落とすと「入るはずの項目が入っていない」ことに誰も気づけません。
  画面では赤く出し、チェックを外した状態にする。
- `already_applied`（同じ `source_template_item_id` が既にある）と
  `already_present`（同じ `col_group` × `label` の列が既にある）を付ける。
- `checked_by_default`: `is_required === true` かつ `already_applied === false` のときだけ `true`。

**`apply` は「足すだけ」。** 既存の列・項目を書き換えも削除もしない（02 §5-3）。
`flow-template.service.ts:185-187` の「2回目は `ALREADY_EXISTS` で 400」は**採りません**
（列グループごとに別のひな形を当てたい／当日までに会場が1つ増える、が普通にあるため）。

**`onair_start_min` の扱い（400 で断る条件）**

`anchor='onair'` の項目が1件でも選ばれているのに `onair_start_min` が無ければ **400**。
勝手に 0 時起点で置くと、当日の項目が全部深夜に並んで**気づかれないまま配布されます**。

既定値の出し方（**画面側**で出す。サーバーは推測しない）:

1. その表に既に `kind='onair'` の項目があれば、その最も早い `start_min`
2. 紐づくQシート文書があれば `data.meta.broadcastStartTime`
3. どちらも無ければ**利用者に入力させる**（既定を出さない）

⚠️ `episodes` は使えません。**`broadcast_date` は `TEXT` の日付で時刻を持ちません**
（`001b_postgresql_schema.sql:143`）。

⚠️ `POST /schedules` で `template_id` を渡す場合も同じ検査を通します。
**このときは上の①②が両方使えません**（表がまだ空・文書もまだ無い）ので、
`anchor='onair'` を含むひな形なら `onair_start_min` は**必須**です。

### 4-5. 枠 → 台本の橋（**README §5-2 #11**）

`POST /schedules/:id/items/:itemId/qsheet` の手順（1トランザクション）:

1. 項目の `kind` が `onair` / `rehearsal` / `recording` のいずれか（違えば **400**）。
2. 既に `qsheet_document_id` があれば **409 `ALREADY_LINKED`**。
3. `qsheet_documents` を **INSERT**。
4. `qsheet_schedule_items.qsheet_document_id` を UPDATE。
5. 201 で `{ item, document }`。画面はそのまま編集画面へ。

⚠️ **`data` を独自に組み立てないこと。**
実装を読んで確認した事実として、**新規作成の初期値はクライアント（`DashboardPage.tsx:495-510`）が
組んでおり、サーバー側に「唯一の正」となる関数はありません**
（`POST /qsheet/documents` は `req.body.data` をそのまま入れるだけ。`documents.routes.ts:113`）。

→ **段4 の作業に「新規作成の初期値をサーバーへ1本にまとめる」を含めます**:

```
server/src/contexts/qsheet/services/document-create.service.ts
  createDocument({ title, project_id, episode_id, broadcast_date, episode_code,
                   startTime, blocks?, createdBy }) → QsheetDocument
```

- `POST /qsheet/documents` と `POST /schedules/:id/items/:itemId/qsheet` の**両方がこれを呼ぶ**。
- **`masters: { persons: [], video: [], audio: [], telop: [] }` を必ず入れる**
  （抜けると話者・素材の参照が落ちます。`DashboardPage.tsx:509` は入れている）。
- `blocks` の既定は**現行と同じ3つ**（`scenario` / `video` / `audio`）。→ 確認12・02 §12-6。
- `sections: []`。
- `data.meta.startTime` / `data.meta.broadcastStartTime` は
  項目の `start_min` を **`fmtHmPad`** で `"HH:MM"` にしたもの。
  ⚠️ `start_min >= 1440`（日跨ぎ）のときは `"25:30"` になります。
  **`data.meta` は `"HH:MM"` を期待する既存の欄なので、`25:30` を入れてよいかは未確認**
  （現行の入力欄が何を受けるかを段4 の着手時に `EditorPage` / `PreviewModal` で確かめる）。
  分からないうちは **`min % 1440`** に丸めず、**そのまま `25:30` を入れて表示を確認する**
  （丸めると本番開始が前日の 1:30 になり、静かに間違います）。

⚠️ **04 §12「サーバーは `data` を書かない」との関係**:
あちらの禁止は「**既存文書の `data` を UPDATE しない**」という意味です。
**新規 INSERT は Yjs のルームがまだ無いので安全**（`collab.ts:77` の persist は
ルームが立ってから 3 秒 debounce で動きます）。

`PUT …/qsheet`（既存に結ぶ／外す）は、**繋ぐ側のユーザーがその文書にアクセスできるか
`canAccessDoc` で必ず検査**（`access.ts:18`）。
できないなら**存在秘匿のため 404**。検査しないと
**進行表を経由して他人の非共有台本を開ける裏口**になります。

### 4-6. ブレイクダウン（**判定式を作らない**）

`GET /schedules/:id/breakdown` は `kind IN ('onair','rehearsal','recording')` の項目について
**数えた事実だけ**を返します（02 §6-4 の `ItemBreakdown`）。

```
item_id / column_id / title / qsheet_document_id / link_broken
section_count      … _break / _pageBreak / _vtr を除く実ロール数
row_count
rows_with_duration … duration が 0 でない行
rows_with_scenario … scenario セルの entries[0].html が非空の行
frame_min          … end_min - start_min
doc_total_sec      … docTotalSec(sections)   ★素朴に足さない
gap_min            … frame_min - ceil(doc_total_sec / 60)（正 = 枠が余る）
```

- **`stage` は返しません。`SCRIPT_THRESHOLD` も持ちません。** README §5-2 #13 のとおり削除済みです。
  **復活させないこと。** ラベルが要るときは 01 §4-2 の `HintTone`（`blank` / `touched` / `recent`）を
  `shared/src/production/journey.ts` から import します。
- モックの「3本バー」は**塗りの割合ではなく3値の濃さ**。割合にすると分母＝判定式を決めることになります。
- **`doc_total_sec` は必ず `docTotalSec()` を通す。**
  素朴に `sections[].duration` を足すと、**ロール尺が空で行にだけ尺がある台本で 0 になり**、
  「枠 90 分／台本 0 分（90分の余り）」と表示され、AI にもそう伝わります
  （`EditorPage.tsx:515-518` にフォールバックが実在します）。
- 集計は **Node 側**で回す。SQL に `jsonb_array_elements` を書くと
  `jsonb_typeof` のガードと `_break`/`_vtr` の除外条件が SQL に埋まって読めなくなります。
- ⚠️ **`sections` が配列でない壊れた行が1件でもあると `jsonb_array_length` が例外を投げ、
  その1件のために全員の一覧が 500 で落ちます**（01 §4-5 / README §5-2 #28）。
  SQL 側で件数を数える箇所には必ず:

  ```sql
  CASE WHEN jsonb_typeof(d.data->'sections') = 'array'
       THEN jsonb_array_length(d.data->'sections') ELSE 0 END
  ```

- `data` は collab 編集中でも**最大3秒古いだけ**（`collab.ts:77` の debounce）。
  ブレイクダウンは目安なのでこの鮮度で足ります。**Y の状態を直接読みに行かない。**

---

## 5. 画面

### 5-1. ルート

```
/qsheet/schedules             ScheduleListPage.tsx
/qsheet/schedules/:id         SchedulePage.tsx
/qsheet/settings/schedule-templates   ScheduleTemplateSettingsPage.tsx（PC 専用）
```

`client-qsheet/src/App.tsx:36-40` の `<Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>` の
中に足す（本番4画面はシェルの外に置かれているので、そこは触らない）。

⚠️ **`client-qsheet` は `check-mobile-declared.mjs` の対象外です**（§2-8）。
**`client-qsheet/src/pcOnlyScreens.ts` を新設し、スクリプトの `APPS` に足すのは段3（01）の仕事**ですが、
足されていなければ**段4 の PR でやります**（やらないと「PC 専用」の宣言がどこにも残りません）。

### 5-2. 一覧（`ScheduleListPage`）

- 既定の絞り込みは「今日以降」。`date_from` / `date_to` / `project_id` / `location_id` / `status` / `search`。
- カード1枚 = 1日1枚の表。出す事実は
  **日付・曜日・拠点・題・案件（GLS）・項目数・共有人数・最終更新**。
  **「進んでいる／遅れている」という形容詞は出しません**（01 §4-2）。
- `+ 新しく作る` はミニアプリのレジストリ（`MINI_APPS`）から出す。

**375px**: 1カラムの縦積みカード。日付を大きく、拠点と題を2行目に。
`overflow-x-auto` は不要（表を作らない）。

### 5-3. 詳細（`SchedulePage`）— PC はグリッド

- 縦軸 = 時刻（`view_start_min` 〜 `view_end_min` を `slot_min` 刻み）。
- 横軸 = 列（`venue` → `prep` → `ops`、各グループ内は `sort_order`）。
- **列グループの見出しは sticky**。時刻の列も sticky（横スクロールしても残る）。
- ドラッグで移動・端をつかんでリサイズ。**スナップは `slot_min`（画面だけの話）**。
  API は 1 分単位を受けるので、**サーバーでスナップし直さない**
  （キーボードで打った `10:03` が黙って `10:05` になります）。
- **重なりは黙って弾かず、黙って重ねもしない**（§3-3）:
  重なったブロックを**横に割って両方見せ**、枠線を警告色にし、
  その列の見出しに「重なり 2件」と**数だけ**出す。
- 選択した項目はサイドパネル（PC）／ボトムシート（モバイル）で編集。
- 15 秒ポーリング。**ドラッグ中・入力中は投げない**（§4-2 (d)）。

**⚠️ グリッド全体を横スクロールさせる**（`overflow-x-auto` のコンテナ1枚に入れる）。
`CLAUDE.md` の UI/UX ポリシーどおり、**body が横スクロールしないこと**。

### 5-4. 375px でどう畳むか

**表を作りません**（`docs/design/v4/mockups/DESIGN_POLICY.md:8`「表・多列レイアウトは使わない」）。

| 要素 | 375px での形 |
| --- | --- |
| グリッド | **時系列の縦積みカード**（`MobileTimeline.tsx`）。開始時刻を左に大きく、題・区分バッジ・列名・所要を右に |
| 列（会場／支度／運営） | 画面上部の**横スクロールするチップ**で絞り込む（`overflow-x-auto`・チップは高さ 44px） |
| 項目の編集 | **ボトムシート**（`shared/src/client-v4/sheet.tsx` の `Sheet` を使う。`max-h-[90vh] overflow-y-auto`） |
| 時刻の入力 | `HH:MM` の文字列 → **`BufferedInput` 必須**（素の `<input>` は日本語変換が壊れる）。数値・`<select>` はそのまま |
| 主要アクション（保存・台本を作る） | シート下部に固定した大きなボタン。`safe-area-inset-bottom` を見る |
| ひな形の適用 | 全画面のダイアログ（チェックリスト）。チェックボックスの当たり判定は行全体（44px 以上） |
| 設定（ひな形の編集） | **PC 専用**。`shared/src/client-v4/pcOnly.tsx` の `PcOnlyGate` / `PcOnlyPanel` で「PC で開いてください」を出す |
| ブレイクダウン | カードの2行目に「ロール 5 ／ 行 42 ／ 枠 90分・台本 72分」と**数だけ**。バーは出さない |

**タップ領域は最低 44px**。ガントのブロックは細くなるので、
**モバイル側のカード一覧で担保します**（02 付録の注意どおり）。

### 5-5. ひな形適用ダイアログ（`ApplyTemplateDialog`）

- `preview` の結果を**列 → 項目**の入れ子チェックリストで見せる。
- `already_applied` は**チェックを外した状態**＋注記「すでに入っています」。
  **あえてチェックを入れれば2つ入る**（勝手に消さない）。
- `is_required === false` も**チェックを外した状態**。
- `start_min === null`（解決できない）は**赤字＋チェック外し**。落とさない。
- `anchor='onair'` を含むのに `onair_start_min` が無ければ、
  **適用ボタンを押させる前に**入力欄を出す（400 を返す前に画面で止める）。

---

## 6. 進行表（逆引き）— **README §5-2 #27**

```
GET /api/v1/internal/qsheet/documents/:docId/schedule-items
```

台本の編集画面に「この台本は 8/6 の WORLD STUDIO 14:00 の枠です」と出すためのものです。

### 6-1. 二重の権限ゲート

**この1本だけは「台本は見えるが進行表は共有されていない人」が叩けてしまいます。**

1. まず **`canAccessDoc(user, docId, createdBy)`**（`access.ts:18`）。通らなければ **404**。
2. 次に、引いた項目の**表ごとに `canAccessSchedule`**。
   **通らない表の項目は返さない。件数にも入れない。**（「N 件ありますが見せられません」も出さない）

`canAccessSchedule` は **`server/src/contexts/qsheet/access.ts` に追記**します
（新しいファイルを作らない — 作法が割れます）:

```ts
/** schedule に対して user がアクセス可能か（作成者 / 共有先 / 管理者） */
export async function canAccessSchedule(
  user: AccessUser, scheduleId: string, createdBy: string | null,
): Promise<boolean>;
```

- 全件見えるのは **`isQsheetAdmin(user)`（＝`role === 'system_admin'`）だけ**。
  **`qsheet` の manager でも他人の非共有表は見えません**（`access.ts:13` と同じ）。
- それ以外は「作成者本人」または `qsheet_schedule_shares` に行がある人。
- **N+1 を作らない**: 1件ずつ `canAccessSchedule` を呼ばず、
  **逆引きの SQL に行条件を直接埋める**:

  ```sql
  AND (s.created_by = $2 OR EXISTS (
        SELECT 1 FROM qsheet_schedule_shares sh
         WHERE sh.schedule_id = s.id AND sh.user_id = $2))
  ```

  （`isQsheetAdmin` のときだけこの条件を外す。一覧 `GET /schedules` も同じ形）

### 6-2. 返す型を必要最小限に狭める

**進行表には社長・副社長の分単位の所在が載ります**（02 §9-4 が自分で書いている）。
`ScheduleItem` をそのまま返してはいけません。**専用の狭い型**にします:

```ts
interface ScheduleItemRef {
  scheduleId: string;
  itemId: string;
  serviceDate: string;   // "YYYY-MM-DD"（SQL 側で to_char 済み）
  columnLabel: string;
  startMin: number;
  endMin: number;
  title: string;
  // ⚠️ assignee / note / kind / source_template_* は持たない
}
```

**守り方（型で止める）**

- この型を `shared/src/schedule/types.ts` に置き、**`ScheduleItem` を継承させない**
  （`extends` にすると後で親に列が増えたとき黙って漏れます）。
- **SQL の `SELECT` に `i.assignee` / `i.note` を書かない。**
  `SELECT i.*` を書かない（`*` は将来足した列を自動で漏らします）。
- `shared/tests/scheduleItemRef.test.ts` に
  **「`ScheduleItemRef` のキー集合が想定どおりであること」**を1本固定する
  （`Object.keys` の比較でよい。増えたら落ちる）。

---

## 7. Excel 書き出し

### 7-1. ⚠️ 前提: `exceljs` はまだ入っていない

§2-5 で確認したとおり、**`exceljs` はリポジトリのどこにも入っていません**。
02 §10-2 の「03 §2-1 の生成器に相乗りする」は、**相乗り先が未実装**です。

したがって段4 の Excel は次のどちらかになります:

| 案 | 中身 | 判断 |
| --- | --- | --- |
| **A（既定）** | **`exceljs` を足す PR を先に1本出す**（依存追加のみ＋`npm audit` の結果を PR 本文に貼る）。段4 の Excel はその後 | README §8 の実装時判断 #2 が「`npm audit` を見て判断」としているので、**依存追加だけを独立の PR にすると判断がしやすい** |
| B | 段4 では Excel を出さず、**表の共有は画面と PDF なし印刷（ブラウザ印刷 CSS）だけ**で1リリース回す | Excel が「配る現物」なので、**実務上ほぼ選べない**と考えています |

**A を既定にします。** 依存追加の判断が下りないうちは、§9 の検証まで（画面と API）は進められます（§11-4）。

### 7-2. サーバーの1か所に寄せる

```
server/src/contexts/qsheet/excel/
  schedule-workbook.ts   ← buildScheduleWorkbook(detail, opts) → ExcelJS.Workbook
```

- **03 と同じ木**（`contexts/qsheet/excel/`）に置く。ただし
  **03 の台本用モジュールとは互いに import しない**
  （README §2 の決定「Excel は台本用と機器設定用で全く別のもの。共通化しない」の趣旨に合わせ、
  **スケジュール表も独立させます**。共通レイヤーを作らない）。
- **`shared/utils/excel.ts`（SheetJS）は1文字も触りません。**
  finance / sales / equipment の既存呼び出しに影響を出さないため。
- レスポンスは既存の **`excelResponse(res, filename, buf)`**（`shared/utils/excel.ts:45`）を使う。
  `filename*=UTF-8''` で日本語ファイル名が通ることは実装で確認済み。
- 列の定義・区分の日本語名・色は **`server/src/shared/schedule/kinds.ts`（`shared/` の複製）から読む**。
  画面と凡例が**同じ物**を読むようにする（§3-7）。

### 7-3. 3シート

**シート①「スケジュール表」** — 配る現物。

- A 列 = 時刻（`slot_min` 刻み・`fmtHmPad` でゼロ詰め・`25:30` を含む）
- B 列以降 = 列（`venue` → `prep` → `ops`）
- 1 行目 = 列グループ名を各グループの幅ぶん**結合**
- 2 行目 = 列名（会場列は `studio_rooms.name`、無ければ `label`）
- 3 行目以降 = 時刻の段。**項目は開始スロットのセルにだけ題名を書き、終了までのセルを結合**
- 区分は**背景色**（ExcelJS の `cell.fill`）。凡例はシート③
- `worksheet.views` でウィンドウ枠を固定（1〜2行目と A 列）

**シート②「項目一覧」** — 平たい表。列は 02 §10-1 のとおり。ただし:

⚠️ **`stage_label`（「枠だけ / 流れまで / 台本まで」）の列は出しません。**
これは §4-6 で削除した `BreakdownStage` そのものです。
02 §10-1 の表に**消し忘れて残っています**（→ §12-5）。

代わりに、この位置に**数の列を3本**置きます（事実だけ）:

| 列 | key | 中身 |
| --- | --- | --- |
| ロール数 | `section_count` | 数値 |
| 行数 | `row_count` | 数値 |
| 台本の尺(分) | `doc_min` | `ceil(doc_total_sec / 60)`。台本が無ければ空欄 |

**シート③「凡例」** — 区分 / 色 / 説明の3列。`kinds.ts` から生成。

### 7-4. ファイル名

```
スケジュール表_2026-08-06_GMOサムライスタジオ用賀.xlsx
```

`service_date`（`to_char` した文字列）＋ 拠点名（無ければ表の題）。`/` などは `_` に置換。

---

## 8. ジャーニーとの接続（`frames[]`）— **README §5-2 #12**

01 §4-5 の `JourneyDay.frames[]` が「本番ブロック → 台本」の橋です。
**02 が「唯一の橋」と決めたのに 01 の初版が返していなかった**ので追加されました。

段4 でやること:

1. **`qsheet_schedule_items` を引く SQL をジャーニー側に足す**（01 のジャーニー service が呼ぶ）。
   `LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL`。
2. 返す形（01 §4-5 のまま）:
   `scheduleId` / `itemId` / `columnLabel` / `title` / `kind` / `startMin` / `endMin` /
   `documentId` / `linkBroken` / `durationGapMin`。
3. **`durationGapMin` は「枠と台本の尺が両方あるときだけ」**。無ければ `null`。
   多い／少ないは言うが、**良し悪しは言わない**（01 §4-2）。
4. ⚠️ **`durationGapMin` は `qsheet_doc_index.total_sec`（04 §2-3）から出す**。
   一覧で `data` JSONB を全部展開しない（1案件に数十件の資料があると開くたびに全展開になる）。
   **索引がまだ無い段階（04 より前）では `durationGapMin` を `null` で返す。**
   「出せない」と画面に書かない — 無いものは黙って出さない（数の正直さの作法）。
5. `frames[]` は **`canAccessSchedule` を通した表のものだけ**（§6-1 と同じ条件を SQL に埋める）。
   ⚠️ **`assignee` / `note` は `frames[]` にも入れません**（同じ理由）。

**ジャーニー側の手がかり `no_schedule`**（01 §4-4）は `qsheet_schedules` の件数で出ます。
段4 でこの表ができるまでは、その手がかりは常に `blank` になります。

---

## 9. 検証手順

### 9-0. 前提（段4 の着手条件）

- [ ] 段3（01）の凍結解除が済み、`shared/src/client/apps.ts:147` の `frozen: true` が落ちている
- [ ] `scripts/check-frozen-css.mjs:47` から `qsheet` が外れている
- [ ] `scripts/check-mobile-declared.mjs` の `APPS` に `client-qsheet` が入り、
      `client-qsheet/src/pcOnlyScreens.ts` がある（**無ければ段4 でやる**）
- [ ] `scripts/check-file-size.mjs` の `SCAN` に `client-qsheet/src` が入っている（**無ければ段4 でやる**）
- [ ] `scripts/check-collab-parity.mjs` の `PAIRS` に `schedule/time.ts` と `schedule/kinds.ts` の対がある

### 9-1. 手元で回すもの（PR を出す前に必ず全部）

```bash
npm run verify:up          # 検証用 Postgres（ポート5433・本番と完全分離）
npm run db:migrate         # 21x_qsheet_schedule.sql が流れることを確認（番号は §3-0）
npm run typecheck:all      # client-qsheet を含むので :all を使う
npm run lint
npm run test               # shared の Vitest
npm run check:version
npm run build:changed
npm run check:frozen       # build:all のあと（凍結2アプリの CSS が動いていないこと）
```

### 9-2. migration

| # | 確かめること | どう確かめるか |
| --- | --- | --- |
| 1 | 番号が実在最大＋1 | `ls server/src/shared/db/migrations/ \| sort \| tail -3` |
| 2 | **`206` のような重複を作っていない** | `ls … \| cut -c1-3 \| uniq -d` が空 |
| 3 | 2回流しても壊れない | `npm run db:migrate` を2回。2回目は `_migrations` で skip される |
| 4 | **`source_template_*` に FK が無い** | `\d qsheet_schedule_items` に `qsheet_schedule_template` を含む FK が出ない |
| 5 | `btree_gist` を入れていない | `SELECT * FROM pg_extension` に無い |
| 6 | 日跨ぎが入る | `INSERT … start_min=1380, end_min=1530`（23:00〜25:30）が通る |
| 7 | `end_min <= 2880` を超えると落ちる | `end_min=2881` が CHECK 違反 |
| 8 | 会場以外は `room_id` を持てない | `col_group='prep'` ＋ `room_id` が CHECK 違反 |

### 9-3. API

| # | 確かめること |
| --- | --- |
| 1 | 権限なしのユーザーで `GET /schedules/:id` → **404**（403 ではない） |
| 2 | 共有した相手には見える。共有を外すと 404 に戻る |
| 3 | **`expected_updated_at` が古いと 409**、`{ code:'CONFLICT', current_updated_at, updated_by_name }` が返る |
| 4 | **自分が連続で PUT しても 409 しない**（レスポンスの `updated_at` で差し替える経路が効いている） |
| 5 | `PUT /items/bulk` で1件だけ古い `expected_updated_at` を混ぜる → **1件も動かない**＋競合 id が返る |
| 6 | `anchor='onair'` を含む適用で `onair_start_min` 省略 → **400** |
| 7 | `preview` を2回叩いても**行が増えない**（保存しない） |
| 8 | 同じひな形を2回適用 → 2回目の `already_applied` が `true`、既定でチェックが外れている |
| 9 | `kind='meal'` の項目に台本を繋ごうとする → **400** |
| 10 | 自分に見えない文書 id を `PUT …/qsheet` に渡す → **404** |
| 11 | 台本をソフトデリートした後 `GET /schedules/:id` → その項目が `link_broken: true` |
| 12 | **`GET /documents/:docId/schedule-items` が、共有されていない表の項目を返さない・件数にも入れない** |
| 13 | 同じレスポンスに **`assignee` / `note` のキーが存在しない**（`Object.keys` で確認） |
| 14 | `data.sections` が配列でない文書を1件作って `breakdown` を叩く → **500 にならない** |
| 15 | ロール尺が空で行にだけ尺がある台本の `doc_total_sec` が **0 にならない** |

### 9-4. 画面（実ブラウザ）

```bash
npm run verify:ui     # 書体・桁揃い・横はみ出しの実測
npm run verify:ime    # IME（BufferedInput を素の input にしていないか）
```

| # | 確かめること |
| --- | --- |
| 1 | **375px で body が横スクロールしない**（グリッドは自分のコンテナの中だけでスクロール） |
| 2 | 375px でボトムシートが `max-h-[90vh]` に収まり、下のボタンが safe-area にかからない |
| 3 | タップ領域が 44px 以上（チップ・チェックボックス行・項目カード） |
| 4 | **「さくら」と打って「ささくさくらさくら」にならない**（項目名・備考・担当・時刻の全欄） |
| 5 | 打鍵の途中で 500ms 止まっても**エラーバナーが出ない**（§4-2） |
| 6 | 2つのタブで同じ項目を動かす → **その項目だけ赤くなり、他の項目は触れる** |
| 7 | 重なった項目が**横に割れて両方見える**・枠線が警告色 |
| 8 | ひな形適用ダイアログで、時刻が解決できない項目が**赤字＋チェック外し**で出る（消えていない） |
| 9 | ブレイクダウンが**％バーではなく3値の濃さ**で出ている |
| 10 | `/qsheet/settings/schedule-templates` を 375px で開くと `PcOnlyPanel` が出る |

### 9-5. Excel（依存追加が済んだ後）

| # | 確かめること |
| --- | --- |
| 1 | 3シートある（スケジュール表／項目一覧／凡例） |
| 2 | グリッドで項目のセルが結合されており、題名が繰り返されない |
| 3 | **色が出ている**（ExcelJS に寄せた効果） |
| 4 | `25:30` が壊れずに出る |
| 5 | **シート②に `stage_label` の列が無い**（§7-3） |
| 6 | 日本語ファイル名でダウンロードできる |
| 7 | `所要` が**数値**として入っている（Excel で SUM できる） |

---

## 10. PR の切り方

**1本にまとめない。** 依存の向きどおりに5〜6本に割ります（`check-file-size.mjs` の 400 行上限は
現状 `client-qsheet` を見ていませんが、**見ている前提で書きます**）。

| # | PR | 中身 | 前提 |
| --- | --- | --- | --- |
| **S1** | `feat(qsheet): スケジュール表のテーブルと共有モジュールを足した` | migration 1本＋`shared/src/schedule/{time,types,kinds}.ts`＋サーバー側複製＋parity 検査＋`shared/tests/scheduleTime.test.ts` | 段3 |
| **S2** | `feat(qsheet): スケジュール表の一覧と編集の API を足した` | `canAccessSchedule`＋`schedules.routes.ts`＋`schedule.service.ts`（CRUD・楽観ロック・bulk） | S1 |
| **S3** | `feat(qsheet): スケジュール表のひな形を足した` | `schedule-templates.routes.ts`＋`schedule-template.service.ts`（preview / apply / duplicate） | S1 |
| **S4** | `feat(qsheet): スケジュール表の画面を足した` | 一覧・グリッド・ボトムシート・モバイル縦積み・適用ダイアログ・`pcOnlyScreens.ts` | S2・S3 |
| **S5** | `feat(qsheet): 枠から台本を作れるようにした` | `document-create.service.ts`（新規作成の初期値を1本に）＋橋の3本＋breakdown＋逆引き＋ジャーニーの `frames[]` | S2 |
| **S6a** | `chore(server): Excel 生成に exceljs を足した` | **依存追加だけ**（`npm audit` の結果を PR 本文に貼る） | — |
| **S6b** | `feat(qsheet): スケジュール表を Excel で書き出せるようにした` | `excel/schedule-workbook.ts`＋`GET /schedules/:id/export-xlsx` | S6a・S2 |

**PR を出したら、確認を待たずにその場で `.claude/skills/pr-watch` で見張る**（`CLAUDE.md` 必須）。
**マージしたら `npm run reviews:debt` でレビュー指摘を棚卸しへ移す**（マージすると画面から消えます）。

### `docs/changelog.d/` の1文案

**作業 PR では版の3か所を触らない。** 枝の名前でファイルを作り、1文だけ置きます。

`docs/changelog.d/claude-qsheet-v4-schedule.md`:

```
**制作資料に「スケジュール表」（当日の枠）を足した。** 会場×時間軸で当日の動きを1日1枚に置き、
拠点ごとのひな形から流し込めるようにした。本番の枠から進行台本をその場で作って結べる
（枠の長さと台本の合計尺は別々に持ち、差は並べて見せるだけで自動調整しない）。
Excel（3シート・色つき）で配れる。同時編集は項目単位の楽観ロックで、
競合した項目だけが赤くなり他の項目の編集は止まらない。
```

（PR ごとに1文。S1〜S6 でファイル名の末尾を変える。**新しいファイルなので衝突しません**）

---

## 11. 未決・要確認

### 11-1. 確認9 — ひな形（スケジュール表）を直せるのは誰か

**状況（実装から確認した事実）**: `210_simplify_permission_modules.sql` の「フルアクセス」型は
**全7区画を manager** にしています。したがって
**「ひな形は manager／適用は editor」という区別は実質ゼロ**です。

| 選択肢 | 中身 |
| --- | --- |
| (a) | ひな形の編集を **`system_admin` に絞る**（拠点・部屋のマスターと同じ扱い） |
| (b) | 権限では割らず、**「監査ログと復元で守る」と正直に書く** |

**判断待ちでも進められる**: ひな形の DDL（S1）・`preview` / `apply`（S3）・適用ダイアログ（S4）は
**権限の値に依存しません**。適用側は確定で `editor` です。

**止まるのは1点だけ**: `POST/PUT/DELETE /schedule-templates*` に付ける `requirePermission` の引数。
→ **既定を `system_admin`（= (a)）で出します。**
理由: **後から緩めるのは1行、締めるのは「今まで直せた人が直せなくなる」ので苦情が出る**。
(b) に倒す場合は、**その前に監査ログの置き場所を決める必要があります** —
§3-4 のとおり**ひな形の3テーブルには `updated_at` も履歴も無い**ので、
(b) を選ぶなら「誰がいつ何を変えたか」を残す表が**別途要ります**（この設計には含まれていません）。

### 11-2. 確認10 — 「台本まで降りた」の判定基準

**設計から閾値は削除済み**（`BreakdownStage` / `SCRIPT_THRESHOLD`）。**復活させません。**

**判断待ちでも全部進められます。** `breakdown` は数だけ返し、画面は 01 の `HintTone` を使うので、
基準が無くても動きます。

基準が**言葉で**決まった場合の入れ方（決まってから・別 PR）:
01 の手がかり（`Suggestion`）を**1件足すだけ**。`SUGGESTION_KEYS` に定数を置き、
「サーバーは数える／画面が文にする」の形を崩さない。
**サーバーに判定式を持たせない。**

### 11-3. 確認22 — 表の単位は「1日1枚」でよいか

**判断待ちでも進められます。** DDL は `service_date DATE` の1日1枚で、
**3日連続でも3行作れば動きます**（データモデルは変わりません）。

**止まるのは導線だけ**: 「連日の表をまとめて作る（初日を複製して日付をずらす）」を出すかどうか。
→ **第1版では出しません。** 出す場合は
`POST /schedules/:id/duplicate { service_date }`（列と項目をコピーし、
`qsheet_document_id` は**引き継がない**）の1本で足ります。
⚠️ **`qsheet_document_id` を引き継ぐと、3日分の枠が同じ台本を指し、
どれか1つで台本を消したときに3日分が同時に `link_broken` になります。**

### 11-4. 確認23 — 担当欄に社内ユーザーを選ばせるか

**設計は自由入力の `TEXT`**（列の例に「MC」「社長」「出演者受賞者」「オンライン参加者」があり、
社内ユーザーでない人が多数含まれるため）。

**判断待ちでも進められます。** 将来やるなら
**`assignee_user_id TEXT REFERENCES users(id)` を「追加」して両方持つ**形
（`assignee TEXT` は表示名として残す）。**後から足せる**ので、いま決めなくても手戻りしません。

⚠️ ただし「この人の当日の動きを横断で出す」を作るときは、
**§6 と同じ漏れの問題が正面から出ます**（社長・副社長の分単位の所在）。
その機能を作るときに**改めて権限設計が要る**ことを、いま書き残しておきます。

### 11-5. 確認12 — 台本の作成経路を2本にしてよいか

(a) トップの「＋新しく作る」 と (b) 「本番の枠から台本を作る」。

**判断待ちでも進められます。** (b) は 02 の中核（§4-5）で、
これが無いとジャーニーの背骨（`frames[]`）が繋がりません。
**(a) を残すかどうかが未決**ですが、どちらでも `document-create.service.ts` に
1本化する作業は必要で、**むしろ2本あるからこそ1本化が要ります**。

### 11-6. `exceljs` を足してよいか（README §8 の実装時判断 #2）

**止まるのは S6a / S6b だけ。** S1〜S5 は進められます。
判断材料は `npm audit` の結果（着手時に実行して PR 本文に貼る）。

### 11-7. その他、この段では決めなかったこと

| # | 未決 | いま分かっていること |
| --- | --- | --- |
| 1 | `data.meta.broadcastStartTime` が `"25:30"` を受けるか | **未確認。** 着手時に `EditorPage` / `PreviewModal` の入力欄を読んで確かめる（§4-5） |
| 2 | スタジオ予約（`studio_bookings`）との突き合わせ | 設計に無い。**作らない**（§2-9） |
| 3 | ひな形の分類（拠点 × 案件の種類） | 02 §12-3。`location_id` だけで足りるかは未確認 |
| 4 | 同時に何人で編集するか | 02 §12-15。5人以上が当日の朝に同時に動かすなら方式（Yjs）を見直す |
| 5 | 案件のメンバーに自動で見せるか | 02 §12-13。既存の作法（共有した人だけ）を崩さない判断をした |
| 6 | PDF | 第1版では作らない。ブラウザの印刷 CSS（横向き A3）で足りるかを見てから |

---

## 12. 設計書との食い違い

**実装を読んで見つけたものを全部書きます。**
①〜③は**そのまま実装すると必ず詰まります**。

### 12-1. ⚠️ `exceljs` はまだ入っていない（**02 §10-2 の前提が無い**）

- 02 §10-2 は「03 §2-1 の `exceljs` 生成器に**相乗り**する」と書いていますが、
  **`exceljs` は `server/package.json` にも、リポジトリのどこにも入っていません**（§2-5）。
  03 §2-1 も「足す」という**決定**であって実装ではありません。
- README §8 の実装時判断 #2（「`exceljs` を足してよいか」）は**まだ未決**です。
- → **段4 の Excel は「依存を足す PR」に依存します**（§7-1 の案 A・§10 の S6a）。
  02 §11-5 が「解決しました（第1版から色が出ます）」と書いているのは、
  **依存追加が済んだ後の話**であって、いまは未解決です。

### 12-2. ⚠️ サーバーは `shared/` を import できない（**02 §7-4・00 §3-2 が実装不能**）

- 02 §7-4「Excel はサーバーが作り、画面はクライアントが描くので、**同じ整形関数を両方が呼びます**」
  00 §3-2「**呼ぶのは全員**: サーバー（02 のブレイクダウン・04 の索引）／クライアント／Excel／AI／MCP」
- **できません。** `server/tsconfig.json:7` は `"rootDir": "./src"`、
  `"include": ["src/**/*"]` で、**`server/src` から `shared/` を参照している行は0件**です（§2-6）。
- 01 §3-1 は同じ問題に**複製＋`check-collab-parity.mjs`** で答えていますが、
  **02 と 00 はその対処を書いていません**。
  02 付録のファイル配置にも `server/src/shared/schedule/` がありません。
- → §3-7 で複製の形を確定させました。**02 付録のファイル配置に2行足す必要があります。**

### 12-3. ⚠️ migration の実在最大は **211**（README は 210 前提）＋ **206 が既に重複している**

- README §6 は「下は『現在の最大が 210』の前提です」と書いていますが、**実在の最大は 211**
  （`211_drop_techsheet_schema.sql`）。**表ごと +1 が要ります**（§3-0）。
- さらに **`206` が2本あります**（`206_drop_untracked_drift_tables.sql` /
  `206_weekly_unreviewed_notification.sql`）。`197` と `205` は欠番。
- README §5-2 #31 は「番号が衝突しても CI は落ちず黙って想定と違う順で流れる」と
  **危険性として**書いていますが、**既に起きています**（`migrate.ts:16` はファイル名を `.sort()` するだけ）。
- ⚠️ **同じ取り合いが実装設計の側でも起きています。**
  [`01-cue-actuals-impl.md`](01-cue-actuals-impl.md)（段1）と
  [`02-audio-share-token-impl.md`](02-audio-share-token-impl.md)（段2）は、
  **どちらも「実測の最大 211 ＋1 = `212`」**と書いています。
  各文書は単体では正しく、**設計の段階では解けません**（番号はマージ順で決まるため）。
  → §3-0 に「予定番号」と「枝を切った時点で取り直す」を明記しました。
- → 検証手順（§9-2 #2）に「重複を作っていないこと」を機械的な確認として入れました。
- **本来の直しどころ**: `scripts/` に「migration 番号の重複を検出する検査」を1本足せば、
  `206` のような事故も設計どうしの取り合いも **CI で止まります**（この設計群のどこにもありません）。

### 12-4. `fmtAbs` の出力形が 00 と実装で違う

- 00 §3-2 は `fmtAbs(sec): string` を **「秒 → `"25:30"`」**と書いています。
- **実装は `HH:MM:SS` のゼロ詰め**（`25:00:00`）です（`client-qsheet/src/lib/time.ts:34-40`）。
- 02 §7-2 のほう（「`22:00 + 3h` を `25:00:00` と出す」）が**正しい**。
- ⚠️ **`shared/` へ移すときに出力形を `"25:30"` に変えると、
  `CueTable.tsx`（本番の進行表示）と `PreviewModal.tsx`（印刷）の表示が同時に変わります。**
  凍結の約束（本番の見え方を作り直しのついでに変えない）に触るので、
  **形は現行のまま移します**（§3-7）。分オフセット用の `fmtHm` / `fmtHmPad` とは**別の関数**です。

### 12-5. ⚠️ 02 §10-1 の Excel シート② に `stage_label` が残っている（**削除した判定式の生き残り**）

- 02 §6-4 は `BreakdownStage`（`枠だけ` / `流れまで` / `台本まで`）と `SCRIPT_THRESHOLD` を
  **削除した**と明記しています（README §5-2 #13）。
- ところが §10-1 のシート②の列に **「進み具合 / `stage_label` / 枠だけ・流れまで・台本まで」**が
  **消し忘れて残っています**。
- **そのまま実装すると、Excel の1列としてサーバーの判定式が復活します。**
  しかも Excel は配る現物なので、**画面より強く「決まった」ように見えます。**
- → §7-3 で**削除し、数の列3本に置き換えました**。

### 12-6. 02 §9-2 の権限表がマークダウンとして壊れている

- `02-schedule.md:891-910`：表の途中（`| ひな形を**適用**する | …` の次）に
  ⚠️ の注記が**表の外の段落として**挟まり、そのあとに
  `| 表を消す・共有先を変える | editor ＋… |` の行が**表の外に取り残されています**。
- 読む人には最後の1行が見えません（レンダリング結果では素のテキストになる）。
- → 実装上の中身は §4-1 に写しました（`DELETE /schedules/:id` は
  **editor ＋ 作成者本人 or `system_admin`**）。**02 の本文の修正が要ります。**

### 12-7. 02 §1 が参照している `mockups/DESIGN_POLICY.md` が実在しない

- 02 §1 は「`mockups/DESIGN_POLICY.md` の『表・多列レイアウトは使わない』に従い」と書いています。
- `docs/design/v4/qsheet-v4-coding/mockups/` には `live/` と `tech-settings/` しかなく、
  **`DESIGN_POLICY.md` はありません**。
- 実体は **`docs/design/v4/mockups/DESIGN_POLICY.md`**（該当は `:8`「表・多列レイアウトは使わない」、
  `:9`「タップ対象は最低44px」）。
- マークダウンリンクではないので `check-links.mjs` は拾いません。**02 の相対パスの修正が要ります。**

### 12-8. 新規作成の「唯一の正」となるサービス関数が**存在しない**

- 02 §6-2 は「既存の `POST /qsheet/documents` の**サービス関数**（新規作成の初期値の唯一の正）を
  呼ぶ形にする」と書いています。
- **そのような関数はありません。** 初期値は**クライアント**（`DashboardPage.tsx:495-510`）が組み、
  `POST /qsheet/documents`（`documents.routes.ts:113`）は `req.body.data` を入れるだけです。
- → **段4 で作ります**（`document-create.service.ts`。§4-5）。
  02 の「呼ぶだけ」という前提は**作業量の見積もりを下げすぎています**。

### 12-9. 検査スクリプトが `client-qsheet` を見ていない（**新画面が無検査で入る**）

- `check-mobile-declared.mjs:24-47` の `APPS` に **`client-qsheet` が無い**
  → スマホ対応の宣言漏れが検出されません。
- `check-file-size.mjs:30` の `SCAN` に **`client-qsheet/src` も `server/src` も無い**
  → 400 行を超える新画面・新ルートが**そのまま入ります**。
- `check-ui-tokens.mjs:48` の `V4_DIRS` に **`client-qsheet/src` が無い**
  → v4 のトークン規則が効きません。
- どの設計書もこれに触れていません。→ §9-0 の着手条件に入れました。

### 12-10. 02 §8-5 の逆引きパスは既存 router と同居する

- `GET /documents/:docId/schedule-items` は、既存の `documents.routes.ts`（`/qsheet` にマウント）と
  **同じプレフィックスの別 router**に置くことになります。パスが違うので衝突はしません。
- ⚠️ ただし **`requirePermission` は router 単位**（`documents.routes.ts:11`）なので、
  新しい router に**同じ行を書かないと認証だけで素通り**します。02 に注記がありません。

### 12-11. `generateSequenceNumber` は UTC の月で採番する（`doc_no` に効く）

- `sequence.service.ts:7-8` は `new Date()` の `getFullYear()` / `getMonth()` を使います。
  **コンテナは UTC** なので、**JST の月初 00:00〜09:00 に作った資料は前月の番号**になります
  （例: 9/1 の朝 8 時に作ると `SD-202608-…`）。
- これは既存の全採番（`OPP` など）が同じ癖を持つので、**02 単独で直しません**が、
  `doc_no` も同じ癖を継ぐことを記録しておきます。01 §2-2 に注記がありません。

### 12-12. 食い違いではないが、確認して**正しかった**もの（記録）

- `qsheet_documents.deleted_at` が **`TEXT`** で `NOW()` を入れている（02 §3 の指摘は正しい）
- `episodes.broadcast_date` が **`TEXT` の日付のみ**で時刻を持たない（02 §5-4 の判断は正しい）
- collab の persist が **3000ms debounce** で `data` を丸ごと上書きする（02 §2-1 の根拠は正しい）
- `qsheet_stage_templates` が**クライアントから1度も呼ばれていない**（02 §2-5 の実例は正しい）
- `LEVEL_ORDER` で **`exporter` は `reader` と同値**（02 §8-6 の注記は正しい）
- `useBufferedValue` の **`COMMIT_DELAY = 500`**（02 §4 の警告は正しい）。
  さらに**アンマウント時にも flush する**という、02 が書いていない事実を §2-4 に足しました
