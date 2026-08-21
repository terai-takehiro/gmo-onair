# スケジュール表 — 実装設計

> **2026-08-21: 4観点の敵対的検査の指摘を反映済み。** 反映内容と判断待ちの項目は
> [`README.md`](README.md) を先に読んでください。
> ⚠️ **画面・帳票に出す名前は「スケジュール表」に統一しました**（`MINI_APPS[].label` が唯一の正・
> 01 §3-2）。初版の表題「当日進行表」、Excel のシート名「進行表」、ファイル名 `進行表_….xlsx` は
> すべて「スケジュール表」に読み替えてください（検査 整合#16）。
>
> 対象: 「制作資料」アプリ（`client-qsheet/`）の新機能。モック ②③
> （[`../production-v4-native-mockups.md`](../production-v4-native-mockups.md) の一覧）に対応。
> ジャーニー ⑧ の **段階2「当日の枠を置く」** がこの画面です。
>
> 前提の調査結果（Qシートのデータモデル）は同じフォルダの `01-*.md` を参照。
> この文書は**設計だけ**でコードは含みません。

---

## 決めたこと

- **`qsheet_documents` には相乗りしない。専用テーブル5本＋共有1本を新設する。**
  `data` JSONB は Yjs の `persist` が3秒ごとに**丸ごと上書き**する領域で、他の書き手を必ず負かすため（§2）。
- **時刻は `INTEGER`（その日の 00:00 JST からの分）で持つ。** `TIMESTAMPTZ` も `"HH:MM"` 文字列も使わない。
  日跨ぎは `25:30 = 1530` と自然に表現でき、UTC コンテナ由来の1日ずれ事故を構造的に起こせない（§7）。
- **ひな形の適用は「その場でコピーする」。適用後にひな形を直しても既存の表は1ミリも動かない。**
  これを**約束ではなく構造**で保証するため、`source_template_*` は FK を張らない**ただの記録用 TEXT** にし、
  ひな形へ戻る読み出し経路をコードに1本も作らない（§5）。
- **適用は「足すだけ」。既存の列・項目を書き換えも削除もしない。** 何度でも適用でき、
  2回目以降は重複候補をチェックの外して見せる（案件の工程ひな形が採った「2回目は 400 で止める」方式は採らない。理由 §5-3）。
- **Qシートとの接続点は `qsheet_schedule_items.qsheet_document_id` の1本だけ。** 区分が `onair`（本番）の
  項目からQシート文書を**その場で作って結ぶ**導線を持ち、ここが「枠→流れ」の唯一の橋になる（§6）。
- **尺は決して自動で書き戻さない。** 枠の長さ（分）とQシートの合計尺（秒）は別々に持ち、
  差分を「あと N 分足りません」と**見せるだけ**にする（§6-3）。
- **Excel は3シート**（進行表グリッド／項目一覧／凡例）。グリッドは `shared/utils/excel.ts` に
  **セル結合と見出し2段**を後方互換で足して作る（§8）。
- **権限は既存の `qsheet` 区画をそのまま使う。新しい区画を作らない。**
  行単位は `access.ts` の作法（作成者／共有先／`system_admin`、権限なしは **404**）をそのまま写す（§9）。
- **共同編集（Yjs）は載せない。** 項目単位の楽観ロック（409）＋ポーリングにする（§4）。
- **この表は 01 のミニアプリレジストリに `key:'schedule'` で載る。** URL は
  `/qsheet/schedules` / `/qsheet/schedules/:id`、`doc_no TEXT`（接頭辞 `SD`）＋部分 UNIQUE を持つ。
  01 が仮に置いた `production_dayplans` / `dayplan` は**この文書の名前に統一**した（検査 整合#1）。
- **Excel は `exceljs` で出す**（03 §2-1 に相乗り）。SheetJS CE の拡張は**やめた**（検査 整合#10）。
- **進み具合の3値ラベル（`BreakdownStage`）と `SCRIPT_THRESHOLD` は削除した。**
  01 §4-2「完成度の判定式は作らない」に反していたため（検査 整合#3）。数だけ返す。

---

## 1. この画面が扱うもの

会場×時間軸のガントチャート。**1日 = 1枚**。

列は3グループで、左からこの順に並ぶ:

| グループ | `col_group` | 中身の例 |
| --- | --- | --- |
| 会場 | `venue` | LOUNGE / SKY / WORLD STUDIO（`studio_rooms` を指せる） |
| 支度 | `prep` | 演出進行 / 全場テクニカル / MC / 社長 / 副社長ホスト / 出演者受賞者 / オンライン参加者 |
| 運営 | `ops` | 運営 / 受付 / 誘導 など |

項目（＝ガントのブロック）は **拠点ごとのひな形から流し込んだもの** ＋ **案件独自の手入力** の2種類。
ひな形は上位の設定ページで編集する。

⚠️ **スマホは表を作らない。** `mockups/DESIGN_POLICY.md` の「表・多列レイアウトは使わない」に従い、
時系列の縦積みカード一覧にする（モック ② のスマホ面と同じ）。編集はボトムシート。

---

## 2. なぜ `qsheet_documents` に相乗りしないのか

**結論: 別テーブル。** 相乗りは技術的に壊れます。根拠を実装から順に:

### 2-1. `data` JSONB は Yjs が所有していて、他の書き手は必ず負ける（決定的な理由）

`server/src/contexts/qsheet/collab.ts` の `persist` は、Y の状態から
`updateToData(state)` を作って **`qsheet_documents.data` を丸ごと UPDATE** します。
発火は **3000ms の debounce**（`new YjsRoomManager(dbPersistence, 3000, 'qsheet-collab')`）と
ルーム無人化時の flush。

つまり編集中の文書に対して、HTTP 側から `data.schedule` を書いても、
**次の persist が Y 側の（スケジュールを知らない）スナップショットで消します。**
しかも `persist` の JSONB 書き戻しは**失敗を握りつぶす**設計なので、消えたことがログにも出ません。

これを避けるにはスケジュールも Yjs の `extras` に載せるしかなく、そうすると
スケジュールの編集が**collab ソケット経由でしか**できなくなります。`YjsRoomManager` は
**単一プロセス前提**（複数インスタンス化には別途 pub/sub が要る、と実装コメントにある）なので、
これは将来のスケールを人質に取る選択です。

### 2-2. 個数が合わない

スケジュール表は **1日1枚**、Qシート文書は **1番組・1回に1枚**。
「その日の表」を文書の中に入れると、同じ日に3本の番組があるとき**どの文書が表を持つのか**を
恣意的に決めることになり、決めた側の文書を消すと表ごと消えます。

### 2-3. 訊きたい質問が文書をまたぐ

「8/6 の用賀は何時に空くか」「この人は今日どこに何時まで拘束されているか」は**文書横断の問い**です。
JSONB の塊に入れると全件スキャン＋アプリ側での展開になり、索引が張れません。
列に分けておけば `(schedule_id, column_id, start_min)` の索引1本で済みます。

### 2-4. 見せたい相手が違う

台本の共有先は「その番組を作る人」ですが、当日進行表は**その日動く全員**（技術・運営・受付）に配ります。
同じ行単位権限の下に置くと、進行表を見せるために台本まで見せることになります。
（テーブルを分けたうえで、共有テーブルも分けます。§9）

### 2-5. 逆向きの失敗が既に1件ある

`qsheet_stage_templates` テーブルは 012 で作られ、CRUD 一式のルート
（`routes/stage-templates.routes.ts`）まで実装されていますが、
**クライアントから1度も呼ばれていません**（`client-qsheet/src` に `/qsheet/stage-templates` の
呼び出しが0件）。実際の立ち位置図テンプレートは `data.stageTemplates` に入っています。
「テーブルを作ったのに JSONB に逃げた」結果、テーブルがデッドコード化した実例です。

今回はその逆をやると、`data` が肥大して **`qsheet_doc_yjs.state`（BYTEA・1文書1行の全体スナップショット）**が
重くなり、3秒ごとの persist がそのまま重くなります。

### 2-6. 反対意見（採らなかった案）も書いておく

> 「1つの文書に全部入っていれば、PDF もExcel も1回の取得で作れて楽ではないか」

楽です。ただし上の 2-1 が致命的で、これは運用でも回避できません
（「編集中は表を触らない」という規律は必ず破られます）。**却下。**

---

## 3. テーブル定義

新規マイグレーション **`21x_qsheet_schedule.sql`**。
⚠️ **番号は [`README.md`](README.md) の採番表を見て振り直すこと。** 設計書5本が 211・212 を
取り合っています（01=211/212・02=211・03=213・04=212）。`migrate.ts` はファイル名順に流すだけなので
**CI は落ちず、黙って想定と違う順で流れます。** 04 の `212_qsheet_ai.sql` は
`qsheet_schedules` に FK を張るので**この表より後**でなければなりません。

> **型の方針**: `TIMESTAMPTZ` と `deleted_at TIMESTAMPTZ` に揃えます。
> 既存の `qsheet_documents` は `created_at TIMESTAMP`（tz なし）・**`deleted_at TEXT` なのに `NOW()` を入れている**
> という不整合を抱えていますが（`documents.routes.ts` の `SET deleted_at = NOW()`）、
> **新しい表でそれを踏襲する理由はありません。** 揃えるのは正しい側にします。

### 3-1. スケジュール表の本体

```sql
CREATE TABLE IF NOT EXISTS qsheet_schedules (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL DEFAULT '',
  -- ★検査（整合#1）で追加。01 §2-2 のミニアプリ共通の資料番号（SD-202608-0001）。
  --   採番するのは project_id が NULL の新規のみ。既存への一括後付けはしない
  doc_no         TEXT,
  -- 当日。**時刻はすべてこの日の 00:00 JST からの分**で持つ（§7）
  service_date   DATE NOT NULL,
  -- 拠点。ひな形の既定の絞り込みと Excel の題字に使う。
  -- 拠点をまたぐ日（用賀＋渋谷の同時開催）があるので NULL 可
  location_id    TEXT REFERENCES studio_locations(id),
  project_id     TEXT REFERENCES projects(id),
  episode_id     TEXT REFERENCES episodes(id),
  -- グリッドの表示範囲（分オフセット）。既定 08:00〜22:00
  view_start_min INTEGER NOT NULL DEFAULT 480,
  view_end_min   INTEGER NOT NULL DEFAULT 1320,
  -- グリッドの刻み（分）。ドラッグのスナップ幅と Excel の行の粒度を兼ねる
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

CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_date
  ON qsheet_schedules(service_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_project
  ON qsheet_schedules(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_location
  ON qsheet_schedules(location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_created_by
  ON qsheet_schedules(created_by) WHERE deleted_at IS NULL;

-- ★検査（整合#1）で追加。01 §2-2 と同じ形（NULL 同士は衝突しないので部分 UNIQUE）
CREATE UNIQUE INDEX IF NOT EXISTS idx_qsheet_schedules_doc_no
  ON qsheet_schedules (doc_no) WHERE doc_no IS NOT NULL;
```

### 3-2. 列

```sql
CREATE TABLE IF NOT EXISTS qsheet_schedule_columns (
  id          TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES qsheet_schedules(id) ON DELETE CASCADE,
  -- 3つの列グループ。画面は venue → prep → ops の順に左から並べる
  col_group   TEXT NOT NULL CHECK (col_group IN ('venue', 'prep', 'ops')),
  label       TEXT NOT NULL,
  -- 会場列だけ studio_rooms を指せる。他社ホール等の指せない会場もあるので NULL 可
  room_id     TEXT REFERENCES studio_rooms(id),
  color       TEXT,
  width_px    INTEGER NOT NULL DEFAULT 160 CHECK (width_px BETWEEN 80 AND 640),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  -- ▼ 由来の記録。**参照ではない**（FK を張らない。理由は §5-2）
  source_template_id     TEXT,
  source_template_col_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  -- 部屋を指せるのは会場列だけ
  CHECK (col_group = 'venue' OR room_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_sch_cols_schedule
  ON qsheet_schedule_columns(schedule_id, col_group, sort_order) WHERE deleted_at IS NULL;
```

### 3-3. 項目（ガントのブロック）

```sql
CREATE TABLE IF NOT EXISTS qsheet_schedule_items (
  id          TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES qsheet_schedules(id) ON DELETE CASCADE,
  column_id   TEXT NOT NULL REFERENCES qsheet_schedule_columns(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  -- 区分。色と Excel の凡例に効く。**onair だけが Qシートと繋がる**（§6）
  kind        TEXT NOT NULL DEFAULT 'other'
              CHECK (kind IN ('setup', 'rehearsal', 'onair', 'recording',
                              'meal', 'standby', 'teardown', 'move', 'other')),
  -- その日の 00:00 JST からの分。日跨ぎは 1440 以上（25:30 = 1530）
  start_min   INTEGER NOT NULL,
  end_min     INTEGER NOT NULL,
  -- 担当。**users は指さない**（社外の出演者・他社スタッフが入るため。§11-4）
  assignee    TEXT,
  note        TEXT,
  -- ▼ 枠 → 流れ の接続点。ここが唯一の橋（§6）
  qsheet_document_id TEXT REFERENCES qsheet_documents(id) ON DELETE SET NULL,
  -- ▼ 由来の記録。**参照ではない**（§5-2）
  source_template_id      TEXT,
  source_template_item_id TEXT,
  created_by  TEXT REFERENCES users(id),
  updated_by  TEXT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  CHECK (end_min > start_min),
  CHECK (start_min >= 0 AND end_min <= 2880)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_sch_items_col
  ON qsheet_schedule_items(column_id, start_min) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_sch_items_schedule
  ON qsheet_schedule_items(schedule_id) WHERE deleted_at IS NULL;
-- 「このQシートはどの枠から開かれているか」を逆引きする（§6-4）
CREATE INDEX IF NOT EXISTS idx_qsheet_sch_items_doc
  ON qsheet_schedule_items(qsheet_document_id) WHERE qsheet_document_id IS NOT NULL;
```

⚠️ **`qsheet_documents` はソフトデリート（`deleted_at`）なので、この FK の `ON DELETE SET NULL` は
まず発火しません。** 消された文書へのリンクが残り続けます。読み出しは必ず
`LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL` で、
**join が外れたら「リンク切れ」として画面に出す**こと（黙って未リンク扱いにすると、
台本を作ったのに枠が「枠だけ」に戻って見え、作った人が二重に作ります）。

**重なりの禁止は DB では掛けません**（§11-2 に理由と代案）。

### 3-4. ひな形（設定ページで編集する）

```sql
CREATE TABLE IF NOT EXISTS qsheet_schedule_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  -- この型を出す拠点。**NULL = どの拠点でも出す**
  location_id TEXT REFERENCES studio_locations(id),
  -- 最初から入っている型。**消せない**（消すと表を作るときに出す物が無くなる）
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT REFERENCES users(id),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS qsheet_schedule_template_columns (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES qsheet_schedule_templates(id) ON DELETE CASCADE,
  col_group   TEXT NOT NULL CHECK (col_group IN ('venue', 'prep', 'ops')),
  label       TEXT NOT NULL,
  room_id     TEXT REFERENCES studio_rooms(id),
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  CHECK (col_group = 'venue' OR room_id IS NULL)
);

CREATE TABLE IF NOT EXISTS qsheet_schedule_template_items (
  id              TEXT PRIMARY KEY,
  template_col_id TEXT NOT NULL
                  REFERENCES qsheet_schedule_template_columns(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'other'
                  CHECK (kind IN ('setup', 'rehearsal', 'onair', 'recording',
                                  'meal', 'standby', 'teardown', 'move', 'other')),
  -- 時刻をどこから数えるか。day = その日の 00:00 から / onair = 本番開始から
  anchor          TEXT NOT NULL DEFAULT 'day' CHECK (anchor IN ('day', 'onair')),
  -- 符号つき分。本番の 120 分前 = -120、09:00 = 540（anchor='day' のとき）
  offset_min      INTEGER NOT NULL DEFAULT 0,
  duration_min    INTEGER NOT NULL DEFAULT 30 CHECK (duration_min > 0),
  -- 外せない項目か。**外せるものと分けておかないと「全部入れる／全部入れない」の二択になる**
  is_required     BOOLEAN NOT NULL DEFAULT TRUE,
  note            TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_qsheet_sch_tpl_cols
  ON qsheet_schedule_template_columns(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_qsheet_sch_tpl_items
  ON qsheet_schedule_template_items(template_col_id, sort_order);
```

`anchor` / `offset_min` / `is_required` の作りは
**`project_flow_tasks`（`178_project_flow_templates.sql`）と意図的に同じ形**にしてあります。
あちらは「実施日 -60 日」、こちらは「本番開始 -120 分」で、単位が日か分かの違いしかありません。
形を揃えておくと、後から読む人が片方を読めば両方分かります。

### 3-5. 共有

`qsheet_document_shares`（102）と**同じ形**にします。写した理由は §9。

```sql
CREATE TABLE IF NOT EXISTS qsheet_schedule_shares (
  schedule_id TEXT NOT NULL REFERENCES qsheet_schedules(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT REFERENCES users(id),
  PRIMARY KEY (schedule_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_sch_shares_user
  ON qsheet_schedule_shares(user_id);
```

---

## 4. 同時編集をどうするか（Yjs は載せない）

**決定: Yjs を載せず、項目単位の楽観ロック（409）＋ポーリングにする。**

理由:

1. **粒度が粗い。** 台本は1つのセルを2人が同時に打つ（だから CRDT が要る）。進行表は
   「ブロックを掴んで動かす」操作で、**同じブロックを2人が同時に掴むことは稀**です。
2. **Yjs の代償が重い。** ルームは単一プロセス前提で、3秒ごとに BYTEA の全体スナップショットを書きます。
   進行表のためにもう1つ部屋の系統を持つと、その制約が2倍になります。
3. **Yjs には atomic move が無い。** 並び替えは clone（delete + insert）で表現され CRDT identity を失う
   （`ydocOps.ts` のコメント）。進行表は**動かす操作が主**なので、CRDT の一番弱いところを主用途にすることになります。

代わりに:

- 表のメタ（題・表示範囲・状態）の `PUT` は **`expected_updated_at` で 409**。
  判定・レスポンス形は `documents.routes.ts` の実装と**同じ**にします
  （`{ code: 'CONFLICT', message, current_updated_at, updated_by_name }`、
  `existing.updated_by === req.user.id` なら「別のタブ/端末で更新」）。
- 項目の `PUT` / `DELETE` も**項目ごとの `expected_updated_at`** で 409。
  409 になった項目だけを画面で赤くし、**他の項目の編集は止めない**
  （文書側は競合したら自動保存ごと止まりますが、進行表でそれをやると当日の直前に全員が固まります）。
- 画面は **15 秒ごとに `GET /schedules/:id`** を投げ、`updated_at` が進んでいたら差し替える。
  ドラッグ中・入力中は投げない。
- 将来ソケットに寄せたくなったら、既存の `/qsheet` ネームスペースに
  `schedule:changed`（id だけを配る）を足して**再取得のきっかけにするだけ**にする。
  状態そのものをソケットで配らない（配ると Yjs の再発明になる）。

⚠️ **`expected_updated_at` と `BufferedInput` の噛み合わせ（検査 地雷#9・実装を読んで判明）**

`useBufferedValue` は **blur を待たず「打鍵が止まって 500ms」で `onCommit` を呼びます**
（`client-qsheet/src/lib/useBufferedValue.ts` の `COMMIT_DELAY = 500`）。
項目名を打つと 500ms ごとに `PUT /items/:itemId` が飛び、そのたび `updated_at` が進むので、
**素朴に実装すると自分の2回目の PUT が自分の1回目と 409 します。** 次の3つを守ること:

1. **PUT のレスポンスに新しい `updated_at` を必ず含め、クライアントはそれで手元の
   `expected_updated_at` を差し替える。**
2. **同じ項目への PUT は直列化する**（in-flight を1本に絞り、後続の commit はキューへ）。
3. `expected_updated_at` は「画面が最後に**サーバーから受け取った**値」であって、
   **15秒ポーリングで見た値ではない**。

---

## 5. ひな形適用の意味論（ここが仕様の核心）

### 5-1. 適用は「コピー」。参照ではない

適用すると、ひな形の列と項目が **`qsheet_schedule_columns` / `qsheet_schedule_items` の実体行として複製**されます。
以後その行はスケジュール表のものであり、ひな形とは無関係になります。

**したがって「適用後にひな形を直しても既存の表は影響しない」は自動的に成立します。**

これは案件の工程ひな形（`flow-template.service.ts` の `apply()`）が既に採っている形で、
あちらも `project_flow_tasks` の内容を `project_tasks` に INSERT して終わりです。
社内に2つの「ひな形」概念があると混乱するので、**意味論を揃えます。**

### 5-2. 「影響しない」を約束ではなく構造で保証する

コピーだから影響しない、では**将来の誰かが `JOIN` を1本書いた瞬間に壊れます**
（「ひな形の名前が変わったら表の列名も追随してほしい」は必ず言われます）。
そこで:

- `source_template_id` / `source_template_col_id` / `source_template_item_id` は
  **FK を張らない、ただの `TEXT`** にする。
- **ひな形側へ戻る読み出し経路をサービス層に1本も作らない。**
  この3列を読んでよいのは「2回目の適用で重複候補を判定するとき」だけ（§5-3）。
- ひな形の行が消えても、この3列は**孤児のまま残す**。孤児であることが正常です。

⚠️ 実装者への注意: この3列に FK を付けたくなりますが、付けると
`ON DELETE CASCADE` なら**ひな形を消した瞬間に本番当日の表から項目が消え**、
`ON DELETE RESTRICT` なら**一度使ったひな形が永久に消せなくなります**。どちらも事故です。
**FK を張らないことが仕様です。**

### 5-3. 既にある項目をどうするか

**足すだけ。既存の列・項目を書き換えも削除もしません。**

案件の工程ひな形は「2回目の適用は `ALREADY_EXISTS` で止める」設計ですが、
**進行表では採りません。** 理由:

- 進行表は**列グループごとに別のひな形を当てたい**（会場列は拠点のひな形、支度列は式典のひな形）。
- 当日までに**会場が1つ増える**ことが普通にあり、そのとき「その会場列だけ」流し込みたい。
- 1枚に1回しか適用できないと、上の2つが手入力に落ちます。

代わりに **`preview` で重複候補を出します**:

- 同じ `schedule_id` に `source_template_item_id` が同じ項目が既にあれば
  `already_applied: true` を付けて返す。
- 画面はそれを**チェックの外した状態**で並べ、注記を出す（「すでに入っています」）。
- 利用者があえてチェックを入れれば、**2つ入ります**（勝手に消さない）。

同じ考えで、`is_required = false` の項目は**チェックを外した状態**で出します
（`is_required = true` はチェック済み）。

**適用時に既存の項目と時間が重なっても止めません。** 重なりは正常な状態だからです（§11-2）。

### 5-4. 基準時刻の決め方（`anchor`）

`anchor = 'day'` の項目は `start_min = offset_min` でそのまま置きます。

`anchor = 'onair'` の項目は**本番開始時刻**が要ります。これは適用時にリクエストで受け取ります
（`onair_start_min`）。決め方は画面側で次の順に既定値を出す:

1. その表に既に `kind = 'onair'` の項目があれば、その最も早い `start_min`
2. 無ければ、紐づく `episodes.broadcast_date` … ではなく**時刻が無い**ので使えない
   （`episodes` は日付しか持たない。`broadcast_date TEXT`）
3. 紐づくQシート文書があれば `data.meta.broadcastStartTime`
4. どれも無ければ**利用者に入力させる**（既定は出さない）

⚠️ **`onair_start_min` を省略して `anchor='onair'` の項目を含む適用が来たら 400 で断ります。**
勝手に 0 時起点で置くと、当日の項目が全部深夜に並んで**気づかれないまま配布**されます。

### 5-5. 「表のほうを直したらひな形に戻したい」

これは**別の機能**です（逆流）。今回は作りません。
作るなら「この表からひな形を作る（新規保存）」＝ `POST /schedule-templates/from-schedule/:id` の形にして、
**既存のひな形を上書きする経路は作らない**でください。上書きを許すと、
1つの案件の都合が全拠点のひな形に飛び火します。→ §12 で確認。

---

## 6. Qシートとの接続点（ジャーニーの「枠→流れ」）

### 6-1. 橋は1本だけ

`qsheet_schedule_items.qsheet_document_id` の **1本だけ**です。
逆向き（`qsheet_documents` 側にスケジュールの列を足す）は**やりません** — 2本あると必ず食い違い、
どちらが正か決められなくなります。

- 1つの項目は **0 または 1** 個の文書に繋がる。
- 1つの文書は **複数の項目**から指されてよい（リハと本番で同じ台本を使う）。
  だから FK はスケジュール側に置きます。

**繋げられるのは `kind IN ('onair', 'rehearsal', 'recording')` の項目だけ**にします。
「昼食」に台本が繋がっていても意味が無く、リンクの一覧がノイズで読めなくなるためです。
サービス層で弾き、400 を返す。

### 6-2. 「枠から台本を作る」導線（これが無いとジャーニーが成立しない）

進行表で本番のブロックを選び、**「台本を作る」**を押すと:

```
POST /api/v1/internal/qsheet/schedules/:id/items/:itemId/qsheet
```

サーバーがやること（1トランザクション）:

1. その項目が繋げてよい `kind` か検査（違えば 400）。
2. 既に `qsheet_document_id` があれば 409（`ALREADY_LINKED`）。二重に作らせない。
3. `qsheet_documents` を新規作成する。
   ⚠️ **`data` を独自に組み立てないこと**（検査 整合#11）。既存の
   `POST /qsheet/documents` のサービス関数（新規作成の初期値の唯一の正）を呼び、
   引数で下の値を渡す形にする。独自に組むと **`masters: { persons: [], video: [], audio: [], telop: [] }`
   が抜けます**（現行の `DashboardPage.tsx:509` は入れている）。抜けた `data` を作ると
   話者・素材の参照が落ちます。
   ⚠️ **04 §12 の「サーバーは `data` を書かない」との関係**: あちらの禁止は
   **「既存文書の `data` を UPDATE しない」**という意味です。**新規 INSERT は Yjs のルームが
   まだ無いので例外**として安全に成立します（04 §12 の文面もその形に直しました）。
   **流し込む値**:
   - `title` … 項目の `title`（空なら表の `title`）
   - `project_id` / `episode_id` … スケジュール表のものを継承
   - `broadcast_date` … `to_char(schedules.service_date, 'YYYY-MM-DD')`
   - `episode_code` … `episodes.episode_code`（あれば）
   - `data.meta.startTime` / `data.meta.broadcastStartTime` … 項目の `start_min` を `HH:MM` にしたもの
   - `data.meta.title` … 上と同じ
   - `data.blocks` … **既定の11ブロックのうち何を入れるかは未確定**（§11-1・§12）
   - `data.sections` … `[]`（空。ここから先が段階3の仕事）
4. `qsheet_schedule_items.qsheet_document_id` を更新。
5. 作った文書を返す。画面はそのまま編集画面へ遷移する。

**既存の文書に繋ぐ**ときは:

```
PUT /api/v1/internal/qsheet/schedules/:id/items/:itemId/qsheet
body: { qsheet_document_id: string | null }   // null で外す
```

⚠️ **繋ぐときに、繋ぐ側のユーザーがその文書にアクセスできるか必ず検査する**
（`canAccessDoc` を通す）。検査しないと、**進行表を経由して他人の非共有台本を開ける裏口**になります。
アクセスできない文書 id を渡されたら、存在秘匿のため **404**（`access.ts` の作法）。

### 6-3. 尺は**絶対に**自動で書き戻さない

枠の長さ（`end_min - start_min`、分）と、台本の合計尺（`sections[].duration` の合計、秒）は
**別々に持ち、どちらももう片方を上書きしません。**

理由:
- 枠は「会場を何時まで押さえたか」。台本の尺は「番組が何分か」。**転換・撤収を含むかが違います。**
- 自動同期すると、台本の1行を消しただけで**会場の押さえ時間が縮み**、それに気づけません。

代わりに `GET /schedules/:id/breakdown` が差分を返し、画面が
「枠 90 分 ／ 台本 72 分（**18 分の余り**）」のように**並べて見せるだけ**にします。

### 6-4. ブレイクダウンの進み具合（ジャーニー ⑧ の3本バー）

⚠️ **検査（整合#3）で作り直した節です。** 初版はここで
`BreakdownStage = 'frame'|'flow'|'script'` という3値ラベルと
`SCRIPT_THRESHOLD = 0.8` を**サーバーの定数として決めていました**が、これは

- 利用者の指示「**進み具合はあくまでコンセプトであり、画一的なものではない**」
- 01 §4-2「サーバーは判定しない／完成度の判定式は作らない／％バーを出さない」

に真っ向から反します。しかも 02 自身が §11-3 で「0.8 は私が置いた仮の数字で根拠は無い」と
認めていました。**根拠のない閾値を設計書がサーバーの定数として置くのが問題**です。
加えて `flow` / `script` という文字列が 01（案件の段）と 02（1つの枠の段）で
**粒度も意味も違うのに同じ名前**になっており、実装者は必ず混同します。

**決め: `stage` と `SCRIPT_THRESHOLD` を削除し、`breakdown` は数だけ返します。**
ラベルが要るときは 01 の `HintTone`（`blank` / `touched` / `recent`）を
`shared/src/production/journey.ts` から import して使い、**02 独自の段の型は作りません。**

```
GET /api/v1/internal/qsheet/schedules/:id/breakdown
```

`kind IN ('onair','rehearsal','recording')` の項目それぞれについて返す:

```ts
interface ItemBreakdown {
  item_id: string;
  column_id: string;
  title: string;
  qsheet_document_id: string | null;
  /** 文書が消されているのにリンクが残っている（§3-3） */
  link_broken: boolean;
  section_count: number;      // _break/_pageBreak/_vtr を除く実ロール数
  row_count: number;
  rows_with_duration: number; // duration が 0 でない行
  rows_with_scenario: number; // scenario セルの entries[0].html が非空の行
  frame_min: number;          // end_min - start_min
  /** ★docTotalSec(sections)。**素朴に sections[].duration を足さないこと**（下の ⚠️） */
  doc_total_sec: number;
  gap_min: number;            // frame_min - ceil(doc_total_sec / 60)（正 = 枠が余る）
}
```

**画面は上の数だけを見て描きます。** モックの3本バーは
「塗りの割合」ではなく **01 §4-2 の3値の濃さ**で表します（割合にすると分母＝判定式を
決めることになるため）。

⚠️ **`doc_total_sec` の計算式が実装と違っていました（検査 地雷#4・整合#4）。**
初版・04 §2-3・05 §4-5 の3本とも「`sections[].duration` の合計」と書いていましたが、
実装には**フォールバックがあります**:

```ts
// client-qsheet/src/pages/EditorPage.tsx:517（OnAirPage.tsx:92-93 も同じ形）
(acc, section) => acc + (parseDur(section.duration)
                         || section.rows.reduce((a, r) => a + parseDur(r.duration), 0)), 0
```

**ロール尺が未入力で行にだけ尺が入っている台本は現実に存在します**
（`CueTable.tsx:613,618` に「尺が未入力です」の警告 UI があり、
`csvImport.ts:190-195` はわざわざ行合計をロール尺へ埋め戻している）。
フォールバックを落とすと `doc_total_sec` が **0** になり、
「枠 90 分 ／ 台本 0 分（90分の余り）」と表示され、AI にも「まだ90分空いている」と伝わります。
**エラーにならないので誰も気づきません。**

→ **`shared/src/schedule/time.ts` に `docTotalSec(sections)` を1本だけ置き**、
サーバー（ブレイクダウン・索引）・クライアント・Excel・AI が**全部それを呼ぶ**。
詳細は [`00-datamodel-fixes.md`](00-datamodel-fixes.md) §3。

計算のもと（`qsheet_documents.data` を読む）:

```sql
SELECT i.id AS item_id, i.column_id, i.title, i.start_min, i.end_min,
       i.qsheet_document_id,
       d.id AS doc_id,
       COALESCE(d.data->'sections', '[]'::jsonb) AS sections
  FROM qsheet_schedule_items i
  LEFT JOIN qsheet_documents d
         ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
 WHERE i.schedule_id = $1 AND i.deleted_at IS NULL
   AND i.kind IN ('onair', 'rehearsal', 'recording');
```

集計は **Node 側で回す**（SQL の `jsonb_array_elements` に落とすと
`jsonb_typeof` のガードが要り、`_break`/`_vtr` の除外条件も SQL に埋まって読めなくなる）。
尺の解釈は `client-qsheet/src/lib/time.ts` の `parseDur` と**同じ実装を使う** — §7-4 の通り
`shared/` に移して両側から呼びます。写すと、`10'30` のような区切り文字の扱いが片方だけ古くなります。

⚠️ **`data` は collab 編集中でも最大 3 秒古いだけ**です（`persist` が毎回 `updateToData` で
JSONB へ書き戻すため）。ブレイクダウンは進捗の目安なので、この鮮度で足ります。
Y の状態を直接読みに行く必要はありません。

---

## 7. 時刻の持ち方

### 7-1. 分解能

- **保存は 1 分**（`INTEGER`）。
- **操作のスナップは `slot_min`**（既定 5 分・表ごとに 5/10/15/30 から選ぶ）。
  スナップは画面の話で、API は 1 分単位を受け付けます（キーボードで `10:03` と打てるように）。
- **秒は持ちません。** 進行表に秒は要らず、持つと Qシート（秒）との往復で丸め誤差が貯まります。

### 7-2. 日跨ぎ

`0 〜 2880`（＝ 48 時間）の分オフセット。`service_date` の 00:00 JST が原点。

- 深夜 1:30 終わりは **`1530`** と持ち、画面には **`25:30`** と出す。
- これは既存の `client-qsheet/src/lib/time.ts` の **`fmtAbs()` が 24 時で折り返さない**
  （22:00 + 3h を `25:00:00` と出す）のと同じ振る舞いで、放送の慣習にも合っています。
- 翌日の日付に繰り上げる案は**採りません**。繰り上げると「その日の表」が2つの日付にまたがり、
  一覧の日付検索が壊れます。

上限を 2880 にしたのは、2 日にまたがる本番は**表を 2 枚に分ける**運用にするためです。
（3 日連続の中継は 3 枚。§12 で確認）

### 7-3. タイムゾーン

- **`TIMESTAMPTZ` をグリッドに使いません。** 使うと、コンテナが UTC で動いている以上
  `AT TIME ZONE 'Asia/Tokyo'` を全ての読み出しに付けて回ることになり、1 箇所忘れた瞬間に 9 時間ずれます。
- 実際、`flow-template.service.ts` には
  「`created_at` を `String(Date)` して頭 10 文字を取ると `Wed Aug 08` になり、期限が全部 null になる」
  「`toISOString` は UTC に寄せて**1日ずれる**」という**実際に踏んだ罠**がコメントで残っています。
  分オフセットの `INTEGER` なら、この種の事故が**型の上で起こせません**。
- `service_date` は `DATE`。取り出すときは必ず **SQL 側で `to_char(service_date, 'YYYY-MM-DD')`**
  にして文字列で受けます（`Date` で受けると同じ罠を踏みます）。
- JST は夏時間が無いので、分オフセット → 実時刻の対応は一意です。
- 監査用の `created_at` / `updated_at` は `TIMESTAMPTZ` のままで問題ありません（比較しかしないため）。

### 7-4. 表示・変換のユーティリティは `shared/` に置く

Excel はサーバーが作り、画面はクライアントが描くので、**同じ整形関数を両方が呼びます。**
写すと必ず片方が古くなります（`shared/src/collab/yjsDoc.ts` を共有した理由と同じ）。

新設: **`shared/src/schedule/time.ts`**

```ts
/** 分オフセット → "9:30" / "25:30"（24時で折り返さない） */
export function fmtHm(min: number): string;
/** 分オフセット → "09:30" / "25:30"（Excel・印刷用のゼロ詰め） */
export function fmtHmPad(min: number): string;
/** "9:30" / "25:30" / "0930" → 分オフセット。読めなければ null */
export function parseHm(v: string): number | null;
/** 所要 → "1時間30分" / "45分" */
export function fmtSpan(min: number): string;
/** 尺文字列（秒）→ 分に切り上げ。Qシートとの突き合わせ用 */
export function secToMinCeil(sec: number): number;
```

あわせて、Qシート側の `client-qsheet/src/lib/time.ts` の **`parseDur` / `fmtAbs` を
`shared/src/schedule/time.ts` へ移し、`client-qsheet` 側は再輸出だけにする**ことを推奨します
（サーバーがブレイクダウンで `parseDur` を必要とするため。§6-4）。

---

## 8. API

すべて `/api/v1/internal/qsheet` の下。レスポンスは既存と同じ `{ success, data }` / `{ success, error }` の封筒。

### 8-1. 型（クライアント・サーバー共有 — `shared/src/schedule/types.ts`）

```ts
export type ColGroup = 'venue' | 'prep' | 'ops';

export type ItemKind =
  | 'setup' | 'rehearsal' | 'onair' | 'recording'
  | 'meal' | 'standby' | 'teardown' | 'move' | 'other';

export interface ScheduleColumn {
  id: string;
  schedule_id: string;
  col_group: ColGroup;
  label: string;
  room_id: string | null;
  room_name: string | null;      // JOIN 由来（読み取り専用）
  color: string | null;
  width_px: number;
  sort_order: number;
  source_template_id: string | null;
  updated_at: string;            // 楽観ロック用
}

export interface ScheduleItem {
  id: string;
  schedule_id: string;
  column_id: string;
  title: string;
  kind: ItemKind;
  start_min: number;
  end_min: number;
  assignee: string | null;
  note: string | null;
  qsheet_document_id: string | null;
  qsheet_document_title: string | null;  // JOIN 由来（deleted_at IS NULL のときだけ）
  link_broken: boolean;                  // id はあるが JOIN が外れた
  source_template_id: string | null;
  source_template_item_id: string | null;
  updated_at: string;
}

export interface Schedule {
  id: string;
  title: string;
  service_date: string;          // "YYYY-MM-DD"（SQL 側で to_char 済み）
  location_id: string | null;
  location_name: string | null;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  episode_id: string | null;
  view_start_min: number;
  view_end_min: number;
  slot_min: number;
  status: 'draft' | 'fixed' | 'archived';
  notes: string | null;
  created_by: string | null;
  creator_name: string | null;
  share_count: number;
  updated_at: string;
}

export interface ScheduleDetail extends Schedule {
  columns: ScheduleColumn[];
  items: ScheduleItem[];
}
```

### 8-2. スケジュール表

| メソッド | パス | 権限 | 中身 |
| --- | --- | --- | --- |
| GET | `/schedules` | `qsheet` reader | 一覧。query: `date_from` `date_to` `project_id` `location_id` `status` `search`。`ORDER BY service_date DESC LIMIT 200` |
| POST | `/schedules` | `qsheet` editor | 作成。body: `{ title, service_date, location_id?, project_id?, episode_id?, template_id?, onair_start_min? }` — `template_id` を渡すと**作成と同時に適用**（§8-4 と同じ処理を通す）。⚠️ **このとき `anchor='onair'` の項目が1件でも含まれるなら `onair_start_min` は必須**（400）。§5-4 の既定値の出どころ①（既存の `kind='onair'` 項目）と③（紐づくQシート）は**表がまだ空なので両方使えず**、省略を許すと当日の項目が全部深夜に並んで気づかれないまま配布されます（検査 地雷#20） |
| GET | `/schedules/:id` | reader ＋行権限 | `ScheduleDetail`。列・項目を全部入れて1回で返す（当日の表は大きくても列20×項目300程度） |
| PUT | `/schedules/:id` | editor ＋行権限 | メタのみ。body に `expected_updated_at`。不一致で **409** |
| DELETE | `/schedules/:id` | editor ＋**作成者本人 or system_admin** | ソフトデリート（`deleted_at = NOW()`） |
| PUT | `/schedules/:id/shares` | editor ＋作成者 or admin | body: `{ user_ids: string[] }`。総入れ替え |

### 8-3. 列と項目

| メソッド | パス | 中身 |
| --- | --- | --- |
| POST | `/schedules/:id/columns` | `{ col_group, label, room_id?, color?, sort_order? }` |
| PUT | `/schedules/:id/columns/:columnId` | 部分更新 ＋ `expected_updated_at` |
| DELETE | `/schedules/:id/columns/:columnId` | ソフトデリート。**中の項目も同時にソフトデリート**（消える件数を先にレスポンスで返すのではなく、画面が確認ダイアログで件数を出す） |
| PUT | `/schedules/:id/columns/reorder` | `{ order: { id: string; col_group: ColGroup; sort_order: number }[] }`。グループ間の移動もここ |
| POST | `/schedules/:id/items` | `{ column_id, title, kind, start_min, end_min, assignee?, note? }` |
| PUT | `/schedules/:id/items/:itemId` | 部分更新 ＋ `expected_updated_at` |
| DELETE | `/schedules/:id/items/:itemId` | ソフトデリート |
| PUT | `/schedules/:id/items/bulk` | **ドラッグ確定用。** `{ items: { id, column_id?, start_min?, end_min?, expected_updated_at }[] }`。1トランザクション。**1件でも 409 なら全部やめて 409**（半分だけ動いた表を残さない）。レスポンスに競合した id を入れる |

### 8-4. ひな形

| メソッド | パス | 権限 | 中身 |
| --- | --- | --- | --- |
| GET | `/schedule-templates` | `qsheet` reader | 一覧（列・項目を入れ子で全部）。query: `location_id`（**指定拠点のもの ＋ `location_id IS NULL` のもの**を、具体的なほうを先に返す。`templatesFor()` と同じ作法） |
| POST | `/schedule-templates/:tplId/preview` | reader | **保存しない下見。** body: `{ schedule_id, onair_start_min? }` |
| POST | `/schedules/:id/apply-template` | editor ＋行権限 | 実行。body: `{ template_id, column_ids: string[], item_ids: string[], onair_start_min? }` |
| POST | `/schedule-templates` | `qsheet` **manager** | 作成 |
| POST | `/schedule-templates/:tplId/duplicate` | manager | 複製（**拠点ごとの違いを作る入口**） |
| PUT / DELETE | `/schedule-templates/:tplId` | manager | 更新 / 削除（`is_system` は削除不可・中身は直せる） |
| POST / PUT / DELETE | `/schedule-templates/:tplId/columns[/:colId]` | manager | 列の編集 |
| POST / PUT / DELETE | `/schedule-template-columns/:colId/items[/:itemId]` | manager | 項目の編集 |

`preview` のレスポンス:

```ts
interface ApplyPreview {
  onair_start_min: number | null;      // 使った基準。null なら anchor='onair' は解決できない
  columns: {
    template_col_id: string;
    col_group: ColGroup;
    label: string;
    room_id: string | null;
    /** 同じ label（かつ同じ col_group）の列が既にある */
    already_present: boolean;
    /** 既定でチェックを入れるか */
    checked_by_default: boolean;
    items: {
      template_item_id: string;
      title: string;
      kind: ItemKind;
      /** 解決後の絶対分。解決できないものも**落とさずに** null で返す */
      start_min: number | null;
      end_min: number | null;
      /** 「本番の120分前」の読める文 */
      when: string;
      is_required: boolean;
      already_applied: boolean;        // source_template_item_id が既にある
      checked_by_default: boolean;
    }[];
  }[];
}
```

⚠️ **時刻が解決できない項目も落とさずに返します。** 落とすと
「入るはずの項目が入っていない」ことに誰も気づけません
（`flow-template.service.ts` の `preview` が同じ判断をしています）。
画面では赤く出し、チェックを外した状態にする。

`apply-template` のレスポンス: `{ created_columns: number, created_items: number, skipped: number }`。

### 8-5. Qシートとの接続

| メソッド | パス | 中身 |
| --- | --- | --- |
| POST | `/schedules/:id/items/:itemId/qsheet` | 文書を新規作成して結ぶ（§6-2）。201 で `{ item, document }` |
| PUT | `/schedules/:id/items/:itemId/qsheet` | `{ qsheet_document_id: string \| null }`。既存へ結ぶ／外す |
| GET | `/schedules/:id/breakdown` | ジャーニーの進み具合（§6-4） |
| GET | `/documents/:docId/schedule-items` | **逆引き。** その台本がどの表のどの枠から開かれているか。台本の編集画面に「この台本は 8/6 の WORLD STUDIO 14:00 の枠です」と出すため |

⚠️ **逆引きの権限（検査 地雷#10）。** この1本だけは
「台本は見えるが進行表は共有されていない人」が叩けてしまいます。
**`canAccessSchedule` を必ず通し、通らない表の項目は返さない（件数にも入れない）。**
§9-4 が自分で書いているとおり**進行表には社長・副社長の分単位の所在が載る**ので、
`ScheduleItem` をそのまま返してはいけません。**専用の狭い型**にして、
`assignee` と `note` を**型として持たせない**（漏れを型で止める）:

```ts
interface ScheduleItemRef {
  scheduleId: string; itemId: string;
  serviceDate: string;      // "YYYY-MM-DD"
  columnLabel: string;
  startMin: number; endMin: number;
  title: string;
  // ⚠️ assignee / note は持たない
}
```

### 8-6. Excel

| メソッド | パス | 権限 |
| --- | --- | --- |
| GET | `/schedules/:id/export-xlsx` | `qsheet` **exporter** ＋行権限 |

`exporter` にしたのは `shared/utils/excel-resource.ts` の `export-xlsx` が
`requirePermission(module, 'exporter')` を使っている前例に合わせるためです
（`LEVEL_ORDER` では `reader` と `exporter` は同じ 1 なので、実効は reader と同じ。
**それでも書き分けるのは、後で「持ち出しだけ止めたい」と言われたときに1文字で変えられるように**）。

---

## 9. 権限

### 9-1. 区画は既存の `qsheet` を使う（新設しない）

`210_simplify_permission_modules.sql` で区画は**ブロックアプリ単位の7つ**
（`sales` / `equipment` / `dailyops` / `qsheet` / `techsheet` / `liveops` / `awards`）に統合され、
**個人ごとの例外編集は廃止**、型（プリセット）だけになりました。

ここで `schedule` という8つ目を作ると、その方針を1機能のために崩すうえ、
**既存の全ユーザーが権限ゼロの状態で機能を迎え**、system_admin が型を直すまで誰も使えません
（しかも 403 ではなく 404 を返す設計なので「無い機能」に見えます）。

**スケジュール表は「制作資料」アプリの機能なので `qsheet` 区画です。**

### 9-2. レベルの割り当て

| 操作 | 必要なレベル | 前例 |
| --- | --- | --- |
| 表を見る | `qsheet` reader ＋行権限 | `documents.routes.ts:11` の `router.use(requireAuth, requirePermission('qsheet'))` |
| 表・列・項目を作る／直す／消す | `qsheet` editor ＋行権限 | 同 `:113` `:141` `:209` |
| Excel 出力 | `qsheet` exporter ＋行権限 | `excel-resource.ts` |
| ひな形を直す | `qsheet` **manager**（⚠️ 下の注） | `flow-templates.routes.ts:23` の `canEdit = requirePermission('sales','manager')` |
| ひな形を**適用**する | `qsheet` editor | 同 `:57`（apply だけ editor に下げている） |

⚠️ **「`qsheet` の manager」は migration 210 の後では「ほぼ全員」を指します（検査 地雷#12）。**
`210_simplify_permission_modules.sql` は「フルアクセス」型で**全7区画を manager** にしており、
「原則チームメンバーはフルアクセス」という実態に合わせてあります。したがって
**「ひな形は manager／適用は editor」という区別は実質ゼロ**です。
**選択肢は2つで、利用者に決めてもらいます**（→ §12-14）:

- (a) ひな形の編集を **`system_admin` に絞る**（拠点・部屋のマスターと同じ扱い）
- (b) 権限では割らず、**「監査ログと復元で守る」と正直に書く**（誰でも直せるが、
  誰がいつ何を変えたかは残る）

同じ理由で、**04 §5-5 の「レビュー担当＝`qsheet` の manager」も人を特定できません。**
あちらは `ops_reports.assignee_user_id` で1人を指名する形に直しました。
| 表を消す・共有先を変える | editor ＋**作成者本人 or system_admin** | `documents.routes.ts` の削除は作成者本人か system_admin のみ（共有先は 403） |

### 9-3. 行単位の判定は `access.ts` に足す

`server/src/contexts/qsheet/access.ts` に**同じ形で**足します（別ファイルに書かない — 作法が割れます）。

```ts
/** schedule に対して user がアクセス可能か（作成者 / 共有先 / 管理者） */
export async function canAccessSchedule(
  user: AccessUser, scheduleId: string, createdBy: string | null,
): Promise<boolean>;
```

- 全件見えるのは **`role === 'system_admin'` のみ**（`isQsheetAdmin` をそのまま使う。
  qsheet の manager でも他人の非共有表は見えない）。
- それ以外は「作成者本人」または `qsheet_schedule_shares` に行がある人。
- **権限が無いときは存在秘匿のため 404**（403 ではない）。`documents.routes.ts` と同じ。
- 一覧（`GET /schedules`）も同じ条件を SQL に埋める:

```sql
AND (s.created_by = $n OR EXISTS (
      SELECT 1 FROM qsheet_schedule_shares sh
       WHERE sh.schedule_id = s.id AND sh.user_id = $n))
```

### 9-4. 公開URL は作らない

音声サポート（`/qsheet/audio/:id`）だけがログイン不要の公開URLですが、
**進行表に公開URLは作りません。** 理由:

- 209 のマイグレーションで `audio_share_revoked_at` / `audio_share_revoked_by` が **DROP されており、
  公開URLは失効させられません**（URL を知れば誰でも見られる）。
- 進行表には**社長・副社長の分単位の所在**が載ります。失効できない公開URLに載せてよい情報ではありません。

配布は **Excel / PDF のファイル**で行う、という前提にします。→ §12 で確認。

---

## 10. Excel 出力

### 10-1. 3シート構成

**シート①「スケジュール表」** — 配る現物。時刻×列のグリッド。

- A 列 = 時刻（`slot_min` 刻み、`view_start_min` 〜 `view_end_min`、`fmtHmPad` でゼロ詰め）
- B 列以降 = 列（`venue` → `prep` → `ops` の順、各グループ内は `sort_order`）
- 1 行目 = **列グループ名**（`会場` / `支度` / `運営`）を各グループの幅ぶん**結合**
- 2 行目 = 列名（会場列は `studio_rooms.name`、無ければ `label`）
- 3 行目以降 = 時刻の段。項目は **開始スロットのセルにだけ題名を書き、
  終了までのセルは結合する**（結合しないと題名が繰り返され、印刷が読めない）
- 区分は**背景色**で表す（凡例はシート③）

**シート②「項目一覧」** — 機械可読・並べ替え可能な平たい表。列構成:

| 列 | key | 幅 | 中身 |
| --- | --- | --- | --- |
| 区分グループ | `col_group_label` | 8 | 会場 / 支度 / 運営 |
| 列 | `column_label` | 18 | LOUNGE / 全場テクニカル … |
| 開始 | `start_hm` | 8 | `09:30` / `25:30` |
| 終了 | `end_hm` | 8 | 同上 |
| 所要 | `span_min` | 8 | 分（数値。Excel で集計できるように**数値のまま**） |
| 区分 | `kind_label` | 10 | 設営 / リハ / 本番 … |
| 項目 | `title` | 30 | |
| 担当 | `assignee` | 16 | |
| 備考 | `note` | 30 | |
| Qシート | `qsheet_title` | 24 | 繋がっている台本の題（リンク切れは `（削除済み）`） |
| 進み具合 | `stage_label` | 10 | 枠だけ / 流れまで / 台本まで |

**シート③「凡例」** — `kind` の日本語名と色。区分 / 色 / 説明 の3列。

### 10-2. Excel は `exceljs` で出す（検査 整合#10 で方針変更）

**初版は `shared/utils/excel.ts`（SheetJS CE）に `headerGroups` / `merges` / `fills` を
後方互換で足す設計でしたが、やめました。** 理由:

- SheetJS CE は**セルの塗りを書き出せません**（スタイルは Pro 限定）。初版自身が
  「第1版は塗りなし」と諦めており、§11-5 が未確定のまま残っていました。
- **03-excel.md §2-1 が、同じ制約を理由にサーバーへ `exceljs` を足すと既に決めています。**
  03 は「既存の機材・財務の `xlsx` を移すのは範囲外」と書いていますが、
  **スケジュール表は新規なので「既存」ではありません。**
- このまま2本立てにすると、**同じアプリの中で進行表＝SheetJS・台本＝ExcelJS** になり、
  「出力が2本あって食い違う」という 03 がわざわざ潰した問題を別の形で作ります。

**決め: 02 の Excel 出力は 03 の `exceljs` 生成器に相乗りします。**

- 置き場所は `server/src/contexts/qsheet/excel/`（03 §13 と同じ木）に
  `schedule-workbook.ts` を足す。列定義は 03 と同じく**サーバーの1か所**。
- **色は第1版から出せます**（`§11-5 の未確定はこれで消えます`）。
- `shared/utils/excel.ts`（SheetJS）は**1文字も触りません**。finance / sales / equipment の
  既存呼び出しに影響を出さないためで、全面移行の是非は別途。

### 10-3. ファイル名

`excelResponse(res, filename, buf)` は `filename*=UTF-8''` で日本語を通すので、日本語のままで構いません。

```
スケジュール表_2026-08-06_GMOサムライスタジオ用賀.xlsx
```

`service_date` と拠点名（無ければ表の題）から作る。`/` などは `_` に置換する。

### 10-4. PDF は作らない（第1版）

第1版は Excel だけにし、印刷はブラウザの印刷 CSS（横向き A3）で足りるかを見てから決めます。
スケジュール表は**「Excel で配って各自が直す」**のが実態のはずです（§12-11 で確認）。

⚠️ **事実の訂正（検査 機能#M4）**: 初版は「Qシート側は pdfkit で PDF を出しています」と
書いていましたが、**`server/src/contexts/qsheet/routes/pdf.routes.ts:84` は
クライアントから1度も呼ばれていません**（実際の印刷はブラウザ印刷＝`PreviewModal.tsx`）。
しかも同ルートは `stage_diagram` と `slide` を出力から外しています（`:168`）。
Qシート側の印刷をどうするか（`PreviewModal` を正にして `pdf.routes.ts` を廃止するか、
サーバー PDF を正にするか）は [`06-editor.md`](06-editor.md) §6 が引き取りました。

---

## 11. 未確定の判断

### 11-1. 枠から作る台本の既定ブロック（§6-2 の 3）

新規作成時、`data.blocks` に何を入れるか。

- 既存の新規作成（`DashboardPage.tsx`）は **`scenario` / `video` / `audio` の3つ**で、
  しかも `id` が `"scenario"` のような**固定文字列**です（`genId()` ではない）。
- 枠から作るときも同じ3つでよいのか、`kind` に応じて変える（本番なら `telop` も足す等）のかは**分かりません**。
- **迷いました。** 判断: **既存と同じ3つ**にします。増やすと「使わない列が最初から並ぶ」ことになり、
  案件の工程ひな形が「24件が勝手に立つと一覧が読めなくなる」として避けた失敗と同じだからです。
  ただし利用者の実務では違うかもしれません。→ §12

### 11-2. 項目の重なりを禁止するか

**第1版では禁止しません。** 理由:

- 実務で重なりは起こります（「仮押さえ」と「本番」、同じ会場での並行作業）。
- DB で禁止するには `btree_gist` 拡張 ＋ 除外制約が必要で、
  拡張を1機能のために本番 DB へ入れる判断は重い。

```sql
-- もし禁止するなら（採用していない）
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE qsheet_schedule_items
  ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (column_id WITH =, int4range(start_min, end_min) WITH &&)
  WHERE (deleted_at IS NULL);
```

代わりに**画面で重なりを可視化**します（重なったブロックを横に割って両方見せ、
枠線を警告色にする）。**黙って弾かない・黙って重ねない、の両方を避ける**のが狙いです。

### 11-3. ~~`SCRIPT_THRESHOLD`~~ → **削除しました**（検査 整合#3）

「台本まで降りた」の割合判定は**設計から落としました**。0.8 は根拠のない数字で、
サーバーが判定式を持つこと自体が 01 §4-2 と利用者の指示に反していたためです。
`breakdown` は数だけ返し、ラベルは 01 の `HintTone` を使います。
「何をもって台本まで降りたと言うか」を**利用者が言葉で決めた**場合は、
それを 01 の手がかり（`Suggestion`）として1件足す形で入れます（§12-7 は確認事項として残します）。

### 11-4. 担当（`assignee`）を `users` に繋ぐか

**繋ぎません**（自由入力の TEXT）。列の例に「MC」「社長」「出演者受賞者」「オンライン参加者」があり、
**社内ユーザーでない人が多数**含まれるためです。

ただしこれだと「自分の当日の動き」を横断で出せません。
将来やるなら `assignee_user_id` を**追加**して**両方持つ**形（TEXT は表示名として残す）。
**今どちらが要るかは分かりません。** → §12

### 11-5. ~~Excel の色~~ → **解決しました**（検査 整合#10）

`exceljs` に寄せた（§10-2）ので**第1版から色が出ます**。
`shared/utils/excel.ts`（SheetJS）は触らないので、他機能への影響もありません。

### 11-6. 設定ページの置き場所

ひな形の編集画面をどのアプリに置くか。

- 拠点・部屋のマスターは `client/`（案件管理側）の `SitesPage.tsx` にあり、**編集は `system_admin` のみ**。
- しかし進行表のひな形は**現場の制作管理者**が直すものに見えます（だから権限を `manager` にした）。

**判断: `client-qsheet` 側に置く**（`/qsheet/settings/schedule-templates`）。
理由は、ひな形が参照する `kind` や列グループが進行表固有の概念で、
案件管理側の設定に置くと**その概念が案件管理へ漏れる**ためです。
`client/` の設定ハブからはリンクだけ張る。→ §12 で確認。

### 11-7. 2日以上にまたがる本番（§7-2）

「表を 2 枚に分ける」としましたが、3 日連続の中継で**同じひな形を3回適用する**のが
面倒でないかは分かりません。「連日の表をまとめて作る」導線が要るかもしれません。→ §12

### 11-8. 案件のメンバーに自動で見せるか

`qsheet_documents` は**案件に紐づいていても、共有しなければ見えません**。
進行表も同じにしましたが、進行表は「その日動く全員」に配るものなので、
`project_id` が入っていたらその案件の関係者に自動で見せたい、という要望はあり得ます。
**既存の作法を崩す判断はしませんでした。** → §12

---

## 12. 利用者に確認すべきこと

1. **表の単位は「1日1枚」でよいか。** 3日連続の中継は3枚になります。
   まとめて作る導線（初日の表を複製して日付だけずらす）は要りますか。（§7-2・§11-7）
2. **深夜またぎの表記は `25:30` でよいか。** それとも `翌 1:30` と出しますか。（§7-2）
3. **ひな形は「拠点ごと」で足りるか。** 実際には「拠点 × 案件の種類（式典／配信／公開収録）」で
   分かれていませんか。分かれるなら `location_id` だけでなく分類の列も要ります。（§3-4）
4. **ひな形を直したとき、既存の表に「ひな形が変わりました」と知らせる必要はあるか。**
   設計では**完全に無関係**にしています（§5）。知らせるだけなら足せますが、
   「押すと追随する」ボタンは作らないほうがよいと考えています。
5. **表からひな形を作る（逆流）は要るか。** 要る場合、
   **既存のひな形の上書きは許さない**（新規保存のみ）でよいですか。（§5-5）
6. **本番の枠から台本を作るとき、最初に出す列は `シナリオ／映像／オーディオ` の3つでよいか。**
   実務では最初から `テロップ` や `マイク香盤` が要りますか。（§11-1）
7. **「台本まで降りた」の判定基準は何か。** 台本本文の埋まり具合（何割？）ですか、
   それとも「Qワードが入っている」「マイク割当が埋まっている」ですか。（§6-4・§11-3）
8. **枠の時間と台本の合計尺がずれたとき、どう見せてほしいか。**
   設計では**並べて出すだけ**で自動調整しません（§6-3）。警告として目立たせるべき差は何分からですか。
9. **担当欄に社内ユーザーを選ばせる必要はあるか。**
   要るなら「この人の当日の動き」を横断で出せますが、社外の出演者は自由入力のままになります。（§11-4）
10. **Excel の配り方。** 色が付いていないと困りますか（第1版は塗りなしの予定・§10-2）。
    また、シート①（グリッド）とシート②（一覧）の**どちらを主に使いますか**。
11. **PDF も要るか。** Qシート側にはありますが、進行表は Excel だけで足りますか。（§10-4）
12. **公開URL（ログイン不要）で配りたい場面はあるか。**
    設計では作らない判断をしています（失効できないため・§9-4）。
    もし要るなら、**失効できる仕組みを先に作る**必要があります。
13. **案件に紐づく表を、その案件の関係者に自動で見せるか。**
    今の設計は台本と同じで「共有した人だけ」です。（§11-8）
14. **ひな形を直せるのは誰か。** 設計では `qsheet` の manager にしています。
    拠点・部屋のマスターと同じく `system_admin` だけに絞りますか。（§9-2・§11-6）
15. **同時に何人で編集しますか。** 設計は Yjs を載せず楽観ロック（409）にしています。
    当日の朝に5人が同時に動かすなら、方式を見直します。（§4）

---

## 付録: ファイル配置

```
server/src/shared/db/migrations/
  211_qsheet_schedule.sql

server/src/contexts/qsheet/
  access.ts                              ← canAccessSchedule を追記（新ファイルにしない）
  routes/schedules.routes.ts             ← 8-2 / 8-3 / 8-5 / 8-6
  routes/schedule-templates.routes.ts    ← 8-4
  services/schedule.service.ts
  services/schedule-template.service.ts  ← preview / apply / duplicate
  services/schedule-breakdown.service.ts ← 6-4
  excel/schedule-workbook.ts             ← 10（**03 の exceljs 生成器と同じ木に置く**）
  index.ts                               ← router.use('/qsheet', scheduleRoutes) を追加

shared/src/schedule/
  time.ts                                ← 7-4。parseDur / fmtAbs / **docTotalSec** を持つ
                                           （00-datamodel-fixes.md §3。client-qsheet/src/lib/time.ts は再輸出だけ）
  types.ts                               ← 8-1
  kinds.ts                               ← ItemKind ↔ 日本語名・色（画面と Excel の凡例が同じ物を読む）

（`shared/utils/excel.ts` は**触りません**。検査 整合#10。初版は
 `shared/src/server/excel.ts ← 既存 shared/utils/excel.ts に追記` と
 **2つの別のパスを1行に書いていました**（実在は後者）。行ごと削除しました）

client-qsheet/src/
  lib/scheduleApi.ts
  pages/schedule/ScheduleListPage.tsx              ← /qsheet/schedules
  pages/schedule/SchedulePage.tsx                  ← /qsheet/schedules/:id（PC グリッド）
  pages/schedule/ScheduleTemplateSettingsPage.tsx  ← 設定（PC 専用・11-6）
  components/schedule/ScheduleGrid.tsx
  components/schedule/ScheduleColumnHeader.tsx
  components/schedule/ScheduleItemBlock.tsx
  components/schedule/ItemEditSheet.tsx             ← スマホのボトムシート兼 PC のサイドパネル
  components/schedule/ApplyTemplateDialog.tsx       ← preview の結果をチェックリストで見せる
  components/schedule/MobileTimeline.tsx            ← スマホは表を作らない（§1）
```

### 実装で必ず守ること（Qシート側の地雷の持ち込み防止）

- **項目の題・備考・担当の入力は `BufferedInput` / `BufferedTextarea` を使う。**
  素の `<input value onChange>` にすると日本語変換が壊れます
  （「さくら」→「ささくさくらさくら」の実バグ。`client-qsheet/CLAUDE.md`）。
  数値・日付・`<select>` はそのままでよい。
  **時刻の入力欄は `HH:MM` の文字列を打たせるので、`BufferedInput` の対象です。**
- **id はサーバーが `uuid()` で採る。** この機能に Yjs は無いので `genId()` の増殖問題は起きませんが、
  楽観 UI で仮 id を振る場合は**サーバーの返した id で必ず置き換える**こと。
- **`slot_min` のスナップは画面だけの話。** API は 1 分単位を受けます。
  サーバーでスナップし直すと、キーボードで入れた `10:03` が黙って `10:05` になります。
- **44px のタップ領域**（iOS HIG）。ガントのブロックは細くなりがちなので、
  スマホのカード一覧側で担保します（`CLAUDE.md` の UI/UX ポリシー）。
