# 08 収録設定・配信設定・WEB会議 — 実装設計

> **2026-08-21 作成。執筆時点ではコードは書いていませんでした。**
> ✅ **2026-08-22 追記: 実装済み**（PR1〜5はPR #288の段8で実装・マージ済み）。
> 上位の設計は [`../08-recording-streaming.md`](../08-recording-streaming.md)、
> 機器側の事実（Assistant が何を読むか）は [`docs/design/qsheet-recording-streaming.md`](../../../qsheet-recording-streaming.md)（PR #279）が正です。
> この文書は**その2本を実装に落とすときに手が止まる箇所だけ**を、実装を読んで確かめた事実の上に書きます。
>
> ⚠️ **実装を読んで分かった食い違いは §10 に全部あります。着手前に §10 を読んでください。**
> いちばん大きいのは **PR #279 は文書だけで、コードもテーブルも1行も入っていない**ことと、
> **ミニアプリ・レジストリの型（01 §3-2）に「資料ではない道具」を載せる場所が無い**ことです。

---

## 1. この段でやること

| # | やること | 出どころ |
| --- | --- | --- |
| 1 | `qsheet_recording_settings` / `qsheet_streaming_settings` の2本を作る | 08 §2 |
| 2 | 取得・保存・点検・書き出し・写しの7エンドポイント | 08 §3 |
| 3 | 収録設定（PC）／配信設定（PC）／WEB会議（配信設定の中）／Excel を書き出す／スマホ | 08 §6 |
| 4 | 機器設定の Excel を**台本の Excel とは完全に別のモジュール**で作る | 08 §4・03 §0-0 |
| 5 | ミニアプリ・レジストリに2件足す（**型の拡張が要る** → §10-2） | 08 §1-1 |

**やらないこと**（この段で作らない・後段でもなく「作らない」と決めたもの）

- **機器への送信**。ONAiR は機器に触らない（#279 §0-2）。作るのは「書き出す」だけ
- **WEB会議の Excel 列**（08 §5-4）。`export-xlsx` は `meetings` を**一度も読まない**
- **機器設定の Excel 取込**（08 §8-5 で確認中）。片道のまま
- **接続設定（IP・機種・NAS）**（08 §8-6 で確認中）
- **Singular Live・機材台帳との紐付け**（08 §8-7 で確認中）

**先に済んでいる必要があるもの**

| 前提 | なぜ | 状態 |
| --- | --- | --- |
| 01 のミニアプリ・レジストリ（`shared/src/production/miniapps.ts`） | ここに載っていないミニアプリは一覧に出ない | **未着手**（`shared/src/production/` は存在しない） |
| 01 の `qsheet_documents.doc_no`（README §6 の 211 相当） | `:ownerKey` の片側が `doc_no` | **未着手**（`012_qsheet_schema.sql:7-26` に `doc_no` は無い） |
| 00 の「凍結を解く」作業 | `tokens-v4.css` / LINE Seed JP / 共通シェルが使えるようになる | **未着手**（`shared/src/client/apps.ts:147` が `frozen: true`） |

⚠️ **`doc_no` が無いあいだは `:ownerKey` を `project_id` だけに絞って先行実装できます**
（`rec_owner_ck` の `doc_no IS NOT NULL` 側を使わないだけ）。01 の完了を待たずに始めたい場合はこの形にし、
**画面の「資料単体でも持てる」は 01 の後で足す**こと。

---

## 2. 実装前の事実確認（読んで確かめたもの）

### 2-1. PR #279 は**文書だけ**で、コードは1行も入っていない

```
$ git show --stat 4eb1211        # Merge pull request #279
 docs/changelog.d/claude-gmo-onair-recording-streaming-tch92d.md |  40 ++
 docs/design/qsheet-recording-streaming.md                       | 429 ++
 docs/design/qsheet-recording-streaming/mockups/*.dc.html        | ...
 9 files changed, 2199 insertions(+)
```

- `qsheet_recording_settings` / `qsheet_streaming_settings` を参照するコード・SQL は
  **リポジトリ全体で 0 件**（`grep -rn "qsheet_recording\|qsheet_streaming" --include=*.ts --include=*.tsx --include=*.sql` が空）
- `client-qsheet/src/pages/recording/` も `streaming/` も**存在しない**
- `server/src/contexts/qsheet/routes/` は `documents` / `pdf` / `public-audio` / `stage-templates` / `upload` の**5本だけ**
  （`server/src/contexts/qsheet/index.ts:8-20`）

**つまりこの段は「#279 を作り直す」ではなく「#279 を初めて作る」です。**

### 2-2. 型と作法（DDL を書く前に必ず知っておくこと）

| 事実 | どこで確かめたか |
| --- | --- |
| `projects.id` は **TEXT** | `server/src/shared/db/migrations/001b_postgresql_schema.sql:104-105` |
| `users.id` は **TEXT** | `052_liveops_schema.sql:4`（コメントに明記）・`001b` |
| `qsheet_documents.id` は **TEXT**、`project_id TEXT REFERENCES projects(id)` | `012_qsheet_schema.sql:7-26` |
| `qsheet_documents` に `doc_no` は**まだ無い** | 同上（01 §7-1 の migration 待ち） |
| Postgres は **16**（本番・検証・`verify:up` すべて） | `docker-compose.yml:11` / `.devcontainer/docker-compose.dev.yml:27` / `scripts/dev-verify/up.sh:33`（`/usr/lib/postgresql/16/bin`） |
| migration は**ファイル名の辞書順**に流し、`_migrations` に**ファイル名で**記録する | `server/src/shared/db/migrate.ts:16,21,33` |
| migrations の**実際の最大は `211_drop_techsheet_schema.sql`**（197・205 は欠番、**206 が2本ある**） | `ls server/src/shared/db/migrations/` |

### 2-3. 権限・アクセス制御の作法

| 事実 | どこ |
| --- | --- |
| `requirePermission(module, minLevel)`。`system_admin` は素通し | `server/src/shared/middleware/auth.ts:184-194` |
| qsheet の全ルートは `router.use(requireAuth, requirePermission('qsheet'))` を通る | `server/src/contexts/qsheet/routes/documents.routes.ts:11` |
| 書き込みは `requirePermission('qsheet','editor')` を**ルートごとに**足す | 同 `:113,141,209,287` |
| **存在秘匿は 404**（403 ではない）。文言は `'ドキュメントが見つかりません'` | 同 `:95,100,150,155` |
| `canAccessDoc(user, docId, createdBy)` は **`qsheet_document_shares` を引く文書単位**の判定。**案件単位の判定は存在しない** | `server/src/contexts/qsheet/access.ts:18-30` |
| 権限区画は migration 210 で7つに統合済み（`sales`/`equipment`/`dailyops`/`qsheet`/`techsheet`/`liveops`/`awards`） | `210_simplify_permission_modules.sql:1-30` |

⚠️ **`canAccessDoc` は `:ownerKey` にそのままは使えません**（引数が `docId`）。→ §4-1 で新しい判定を定義します。

### 2-4. Excel を作る土台

| 事実 | どこ |
| --- | --- |
| `buildExcelWorkbook(sheets)` は `shared/utils/excel.ts` の既存 API（中の Excel ライブラリはその後 SheetJS から ExcelJS に移った — このモジュールからは知らなくてよい）。`columns[].header` を**1行目**に置き、2行目以降がデータ | `server/src/shared/utils/excel.ts` |
| 列幅は `!cols`、シート名は 31 文字で切る | 同 `:28-29` |
| `formatCell` は `null`→`''`、`Date`→文字列、`object`→JSON、**`boolean`→`'TRUE'`/`'FALSE'` の文字列** | 同 `:34-40` |
| `excelResponse(res, filename, buffer)` が `Content-Disposition: attachment; filename*=UTF-8''…` を付ける | 同 `:45-49` |
| `xlsx` は **`server/package.json:42` にだけ**入っている（client には無い） | — |
| `exceljs` は**どこにも入っていない**（03 が足す予定。**この文書は使いません**） | `grep exceljs package*.json` が空 |

**`buildExcelWorkbook` は #279 §4-1 の要求（1行目に見出し・A1 から・真偽値セルを使わない・数式を使わない・結合しない）を
そのまま満たします。** 足りないのは「空欄を本当に空にできるか」だけ（→ §7-3 で実測する）。

### 2-5. 秘密の暗号化

| 事実 | どこ |
| --- | --- |
| `encrypt` / `decrypt` は **AES-256-GCM**、形式は `iv:authTag:ciphertext`（全部 hex） | `server/src/contexts/liveops/crypto.ts:17-41` |
| 鍵は `process.env.ENCRYPTION_KEY`（**64 hex 以上**）。**本番で未設定なら起動時に例外**。開発は `config.jwtSecret` から SHA-256 で導出 | 同 `:4-14` |
| `mask(value)` は末尾4文字だけ残す（`'****' + slice(-4)`） | 同 `:44-48` |

**この3本をそのまま使います。新しい暗号の実装は書きません。**
⚠️ `crypto.ts` は `contexts/liveops/` にあります。qsheet から import すると**コンテキストをまたぐ**ので、
§3-3 のとおり **`server/src/shared/utils/secret-box.ts` へ引き上げ**、`liveops` 側は再輸出だけにします
（**鍵の形式も既存の暗号文も変えない**ので、既に入っている `liveops_settings` の値はそのまま読めます）。

### 2-6. 画面側の土台

| 事実 | どこ |
| --- | --- |
| `client-qsheet` のベースパスは `/qsheet/`、`client-live` は `/live/` | `client-qsheet/vite.config.ts:7` / `client-live/vite.config.ts:7` |
| サーバーは6アプリの `dist` を prefix ごとに配る（SPA フォールバックつき） | `server/src/app.ts:130-146` |
| 共通シェルは `shared/src/client/shell/`（`AppShell` / `AppTopbar` / `AppSideMenu` / `MobileTabs`） | `ls shared/src/client/shell/` |
| 空・エラー・権限なしの面は `shared/src/client/states/`（`NoPermissionPanel` / `NotFoundPanel` / `ErrorPanel` / `Skeleton`） | `ls shared/src/client/states/` |
| **凍結アプリが共通シェルを使うと `check-shared-wiring.mjs` が落とす**（`V4_APPS` は `client` / `client-daily` / `client-equipment` の3つだけ） | `scripts/check-shared-wiring.mjs:207,236-238` |
| **1ファイル 400 行が上限** | `scripts/check-file-size.mjs:27` |
| 設定を打ち込む画面の手本 | `client-equipment/src/pages/settings/RentalRulesPanel.tsx` |

---

## 3. DDL

### 3-1. migration 番号

**実測の最大は `211_drop_techsheet_schema.sql`**（`ls server/src/shared/db/migrations/ | sed -n '$p'`）。
⚠️ **README §6 の採番表は「現在の最大が 210」を前提にしており、全部 1 つずれています。**

段ごとの実装設計を並行して書いているため、**予定番号は [`README.md`](README.md) §3 の表が正**です。
この段の予定は **`220_qsheet_device_settings.sql`**（段1〜10 が 212〜219 を予定しているため、その次）。

⚠️ **予定であって確定ではありません。** `migrate.ts:16` はファイル名の辞書順に流すだけで、
**番号が重なっても CI は落ちません**（黙って想定と違う順に流れます）。
**PR を出す直前に必ず `ls server/src/shared/db/migrations | sort | tail -3` で取り直し、
他の PR が先に入っていたら自分の番号を上げてリネームしてください。**
（一度 `main` に入ったファイル名は**絶対に変えないこと**。`_migrations` はファイル名で
実行済みを持つので、リネームすると既存 DB でもう一度流れます。）

**この文書の中では `NNN` と書きます。** 08 の DDL は**1ファイルにまとめます**
（2表とも同じ機能で、片方だけ入った状態に意味が無いため）。**08 は他のどの段にも依存しません**
（`projects` と `users` にしか FK を張らない）ので、**番号の前後関係を気にする必要はありません**。

### 3-2. 本体

```sql
-- ============================================================
-- NNN: 収録設定・配信設定（機器設定）
--
-- 案件（または資料単体）＋実施日で1セット。明細は JSONB。
-- ⚠️ qsheet_documents.data（JSONB）には入れない。あちらは Yjs の所有物で、
--    collab.persist が3秒ごとに丸ごと上書きするため、サーバーが書いても消える。
--    設定は同時編集しないので Y.Doc を通す理由が無い（08 §2 / #279 §5-2）。
-- ============================================================

CREATE TABLE IF NOT EXISTS qsheet_recording_settings (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  doc_no            TEXT,                      -- 案件に紐づかない資料単体のとき
  service_date      DATE NOT NULL,             -- ⚠️ NOT NULL。理由は §3-4
  decks             JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_exported_at  TIMESTAMP,
  last_exported_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_export_name  TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMP,
  CONSTRAINT qsheet_rec_owner_ck
    CHECK ((project_id IS NULL) <> (doc_no IS NULL))   -- ⚠️ 「どちらか一方」。§3-4
);

CREATE UNIQUE INDEX IF NOT EXISTS qsheet_recording_key
  ON qsheet_recording_settings (COALESCE(project_id, doc_no), service_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS qsheet_streaming_settings (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id) ON DELETE CASCADE,
  doc_no            TEXT,
  service_date      DATE NOT NULL,
  destinations      JSONB NOT NULL DEFAULT '[]'::jsonb,
  meetings          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- WEB会議。⚠️ Excel には出さない（§6-5）
  last_exported_at  TIMESTAMP,
  last_exported_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_export_name  TEXT,
  key_mode          TEXT NOT NULL DEFAULT 'blank'
                    CHECK (key_mode IN ('blank','plain')),
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMP,
  CONSTRAINT qsheet_stream_owner_ck
    CHECK ((project_id IS NULL) <> (doc_no IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS qsheet_streaming_key
  ON qsheet_streaming_settings (COALESCE(project_id, doc_no), service_date)
  WHERE deleted_at IS NULL;

-- 一覧・ジャーニーの「技術の仕込み」行から引くため（§7 の位置づけ）
CREATE INDEX IF NOT EXISTS qsheet_recording_project
  ON qsheet_recording_settings (project_id, service_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS qsheet_streaming_project
  ON qsheet_streaming_settings (project_id, service_date) WHERE deleted_at IS NULL;
```

### 3-3. 暗号化ユーティリティの引き上げ（同じ migration の PR に入れる。DDL ではない）

```
server/src/shared/utils/secret-box.ts      ← 新設。crypto.ts の中身をそのまま移す
server/src/contexts/liveops/crypto.ts      ← 中身を消し `export { encrypt, decrypt, mask } from '../../shared/utils/secret-box'` だけにする
```

- **鍵の導き方・暗号文の形式（`iv:authTag:ciphertext`）を1文字も変えない。**
  変えると `liveops_settings` に既に入っている値が読めなくなります（`decrypt` は失敗すると `null` を返すので**黙って壊れます**）
- import 元が変わるだけなので `liveops` 側の呼び出しは書き換えません

### 3-4. 08 §2 の DDL から変えた4点（と、その理由）

| # | 08 §2 | この文書 | なぜ |
| --- | --- | --- | --- |
| 1 | `service_date DATE`（NULL 可） | **`NOT NULL`** | 一意インデックスの鍵に NULL が入ると **Postgres は NULL どうしを別物として扱う**ので、同じ案件の「日付なし」を何行でも作れてしまいます。PG16 なら `NULLS NOT DISTINCT` も使えますが、**#279 §4-6 のファイル名（`収録配信設定_{GLS}_{日付}.xlsx`）が日付を必須にしている**ので、素直に必須にします |
| 2 | `CHECK (project_id IS NOT NULL OR doc_no IS NOT NULL)` | **`CHECK ((project_id IS NULL) <> (doc_no IS NULL))`** | 元の式は**両方入っている行**を許します。両方入ると `COALESCE(project_id, doc_no)` が `project_id` を選ぶので、`doc_no` 側から引けない行が黙ってできます |
| 3 | `TIMESTAMPTZ` | **`TIMESTAMP`** | 既存の qsheet / liveops の表がすべて `TIMESTAMP`（`012_qsheet_schema.sql:23-25`・`052_liveops_schema.sql:27-28`）。ここだけ型を変えると比較・ソートで読み手が混乱します。**日付の計算は `shared/utils/jst.ts` で JST に直す**のがこのリポジトリの作法です |
| 4 | `REFERENCES users(id)`（削除挙動なし） | **`ON DELETE SET NULL`** | 既定は `NO ACTION` なので、**書き出した人が退職すると `users` の行が消せなくなります**。既存の `liveops_programs.created_by`（`052:26`）と揃えます |

---

## 4. API

```
GET    /api/v1/internal/qsheet/production/:ownerKey/recording          reader
PUT    /api/v1/internal/qsheet/production/:ownerKey/recording          editor
GET    /api/v1/internal/qsheet/production/:ownerKey/streaming          reader
PUT    /api/v1/internal/qsheet/production/:ownerKey/streaming          editor
POST   /api/v1/internal/qsheet/production/:ownerKey/settings/preflight  reader
GET    /api/v1/internal/qsheet/production/:ownerKey/settings/export-xlsx  editor
POST   /api/v1/internal/qsheet/production/:ownerKey/settings/copy-from   editor
```

- 新設は `server/src/contexts/qsheet/routes/device-settings.routes.ts`
  （`recording.routes.ts` にしない。**1本のファイルに収録と配信の両方**が入るため。400 行を超えたら
  `device-settings.routes.ts` ＋ `services/device-settings.service.ts` に割る）
- `server/src/contexts/qsheet/index.ts` に `router.use('/qsheet', deviceSettingsRoutes);` を1行
- 封筒は既存どおり `{ success: true, data }` / `{ success:false, error:{ code, message } }`

### 4-1. `:ownerKey` の解決とアクセス判定（**ここを1か所に閉じる**）

`canAccessDoc`（`access.ts:18-30`）は**文書単位**なので、そのままは使えません。
**`resolveOwner` を1本作り、7エンドポイント全部がそこを通る形にします**
（`customers.routes.ts` の `resolveLegacyCustomerId` を1箇所に寄せたのと同じ形。v4.1.6 の判断）。

```ts
// server/src/contexts/qsheet/device-settings-owner.ts
export type Owner =
  | { kind: 'project'; projectId: string; date: string }
  | { kind: 'doc';     docNo: string;     date: string };

/**
 * `:ownerKey` と `?date=` を Owner に直す。
 *   - `GLS-...` / `projects.id` にあたるものは project
 *   - `SB-...` のような資料番号は doc
 * 見つからない・権限が無い → **null を返す。呼び出し側は 404**（403 にしない）
 */
export async function resolveOwner(user: AccessUser, ownerKey: string, date?: string): Promise<Owner | null>;
```

判定の中身:

| `kind` | 見えてよい人 |
| --- | --- |
| `project` | `system_admin`／`qsheet` 区画が `reader` 以上**かつ**その案件が見える人 |
| `doc` | `canAccessDoc` と**同じ判定**（作成者／`qsheet_document_shares`／`system_admin`） |

⚠️ **「その案件が見える人」の定義がこの段では決められません。**
`qsheet` の既存判定は**文書単位**（作成者と共有先）で、案件単位の可視性を決める関数がありません。
**当面は `qsheet` 区画の `reader` 以上を「その案件が見える」とみなす**（08 §3 の書き方どおり）ことにし、
**§9 の確認3で利用者に確かめます**。ここを曖昧にしたまま「案件の絞り込み」を足すと、
**qsheet の reader 全員に全案件の機器設定が見えます**（ストリームキーは伏せ字なので鍵は漏れませんが、
**どの案件がどこに配信しているかは見えます**）。

`?date=` が無いときは **「その owner の最新の `service_date` の行」**を返し、
1行も無ければ `data: null` を返す（404 にしない — 「まだ作っていない」は正常）。

### 4-2. 保存（PUT）

```jsonc
// PUT .../recording
{ "serviceDate": "2026-08-02",
  "decks": [ { "deckId": "REC1", "label": "本線 PGM", "videoFormat": "1920x1080p59.94",
               "codec": "ProRes:HQ", "audioChannels": 2, "slot": "ネットワーク",
               "filePrefix": "GLS002-003_PGM" } ] }
```

- **UPSERT**（`ON CONFLICT` は使えない。一意なのは部分インデックスなので、
  `resolveOwner` → `SELECT ... FOR UPDATE` → 有れば `UPDATE`・無ければ `INSERT` をトランザクションで）
- `id` は `genId()` ではなくサーバー側の既存作法に合わせて **`uuidv4()`**
  （`snapshots.routes.ts:35` / `timers.routes.ts:68` と同じ。列は TEXT なので UUID 文字列で入る）
- **配列の中の値は検証してから入れる**（`deckId` の enum・`encoderId` の enum・`name` の 32 文字と文字種）。
  **ここで弾くのが往復でいちばん効きます**（#279 §0-9）
- ⚠️ **`decks` / `destinations` / `meetings` は「まるごと差し替え」**。行単位のマージはしません
  （同時編集しない前提。2人が同時に開いていたら**後勝ち**になります。→ §9 の確認6）

### 4-3. ストリームキーの扱い（**ここが事故の芯**）

| | 決め |
| --- | --- |
| 保存 | `destinations[].streamKey` は **`secret-box.encrypt` を通してから** JSONB に入れる。平文で JSONB に入れない |
| 応答（GET） | **常に `mask()` した文字列**（`****abcd`）と `hasStreamKey: true/false` を返す。**平文は GET では絶対に返さない** |
| 更新（PUT） | 送られてきた `streamKey` が **`****` で始まるなら「変更なし」**として既存の暗号文を温存する（伏せ字をそのまま送り返してくるため） |
| 書き出し | `key_mode='plain'` のときだけ `decrypt` して平文で Excel に入れる。`'blank'` なら**列は出すが空欄** |
| 記録 | 書き出したら `last_exported_at` / `last_exported_by` / `last_export_name` を**必ず**更新する（08 §3） |
| ログ | ⚠️ **平文のキーをログに出さない。** `console.log` に `destinations` をそのまま流さないこと（暗号文でも出さない） |

`export-xlsx` は **`editor` 以上**（`reader` にしない。08 §3 の指示どおり）。

### 4-4. `preflight`（点検）

**#279 §4-5 の3段（赤／橙／灰）をそのままサーバーで数えます。**
画面と Excel で判定がずれないよう、**画面はこの API の結果だけを表示する**（画面側に判定式を書かない）。

```jsonc
{ "red":  [ { "where": "ENC1 / YouTube Pri", "code": "RTMP_KEY_EMPTY", "message": "RTMP なのにストリームキーが空です" } ],
  "amber":[ { "where": "REC8", "code": "FORMAT_EMPTY", "message": "解像度が空欄です（現地の値を変えません）" } ],
  "gray": [ { "where": "ENC3", "code": "NO_DESTINATION", "message": "配信先が無いので Excel に出ません" } ] }
```

⚠️ **`meetings` は一度も見ません**（08 §5-4-2）。未入力でも赤も橙も出しません。

### 4-5. `copy-from`

```jsonc
{ "from": { "ownerKey": "GLS-A012", "date": "2026-07-14" }, "what": ["recording","streaming"] }
```

- **`meetings` は写さない**（会議URLとパスコードは日ごとに別物。写すと**古い会議に人を集めてしまう**）
- **`streamKey` も写さない**（暗号文をコピーすること自体はできますが、
  「前回の設定を写す」で鍵まで付いてくるのは**意図しない配信**につながる）。
  写した行は `hasStreamKey: false` で入り、画面で「キーは写していません」と出す
- コピー元の範囲は §9 の確認2で確かめる（既定は**同じ案件の別日と、別案件の両方**）

---

## 5. 画面

**モックアップ**: `docs/design/v4/qsheet-v4-coding/mockups/tech-settings/`
（`Main.dc.html` 収録／`Stream.dc.html` 配信／`Meeting.dc.html` WEB会議／`Export.dc.html` 書き出し／
`Mobile.dc.html` スマホ／`MeetingMobile.dc.html` WEB会議スマホ）。

### 5-1. ファイルの割り方（400 行の上限に収める）

```
client-qsheet/src/pages/recording/RecordingPage.tsx        画面の骨（帯・絞り込み・表2つ）
client-qsheet/src/pages/recording/DeckRow.tsx              1台ぶんの行（PC）
client-qsheet/src/pages/recording/DeckSheet.tsx            1台ぶんの下から出るシート（スマホ）
client-qsheet/src/pages/recording/deckOptions.ts           機種ごとの候補（#279 §2-1 の表）
client-qsheet/src/pages/streaming/StreamingPage.tsx        画面の骨（ENC 一覧＋インスペクタ＋WEB会議）
client-qsheet/src/pages/streaming/DestinationInspector.tsx 右 372px
client-qsheet/src/pages/streaming/MeetingCard.tsx          WEB会議 1枚（§5-3）
client-qsheet/src/pages/streaming/meetingFields.ts         ツールごとに出す欄（§5-3 の表）
client-qsheet/src/pages/settings-export/ExportDialog.tsx   4段の書き出し
client-qsheet/src/lib/deviceSettingsApi.ts                 API 呼び出し（1本）
```

### 5-2. 入力部品は**素の `<input>` で可**

08 §1-3 のとおり。理由は**この2画面が `useState` のローカル状態**で、`applyDataUpdate` を通さないためです。
⚠️ **ただし将来 `updateData` 経由に変えたら、その瞬間に `BufferedInput` が必須になります**
（素の `<input>` だと「さくら」が「ささくさくらさくら」になる — README §9-1）。
**ファイルの先頭にその一文をコメントで書いてください。**

### 5-3. WEB会議

- **配信設定の画面の下段**（ミニアプリを増やさない・08 §5）
- 区切りに「**ここから下は Excel に出ません**」の1行を**必ず**入れる（08 §5-4-3）
- ツールで出す欄を変える（Zoom・Webex・その他 → 会議ID/パスコードを出す／Teams・Google Meet → 伏せる）
- ⚠️ **伏せた欄の値を消さない。** 出し分けは**描画だけ**で、`meetings[i].joinId` の値は保持する
- パスコードは**既定で伏せ字**、目のアイコンで表示
- カード右上に「URLをコピー」と「全部まとめてコピー」の2つ。
  **まとめてコピーはパスコードを含める／含めないをボタンの文言で分ける**（08 §5-5）
- `Meeting.meetingId_`（行の id・`mtg_` 接頭辞）と `joinId`（会議側のID）を取り違えないこと。
  ⚠️ **`genId` は `client-qsheet/src/lib/stableIds.ts:22` にあります**（`shared` ではない）。
  00 §4-3 で `shared` へ上げる計画なので、**上がっていればそちらを import する**

### 5-4. スマホ（375px で確かめる）

- 収録／配信をセグメントで切り替え、**1台ずつ直す**（下から出るシート）
- **まとめて変える操作は置かない**。「まとめて変えるのは PC で。」と案内する
- ⚠️ **WEB会議だけはスマホでも編集できること**（現場で会議URLを受け取るのはスマホ）
- タップ対象 44px 以上、主アクションは下端に幅いっぱい 52px

⚠️ **`scripts/check-mobile-declared.mjs` は現在 v4 対象3アプリしか見ていません**
（`:23-45` の `APPS` に `client-qsheet` が無く、`client-qsheet/src/pcOnlyScreens.ts` も存在しない）。
**凍結を解くなら `client-qsheet` をこの検査に足す**こと。足さないと、
この2画面が「スマホで触るのか PC 専用か」を**宣言しないまま出せてしまいます**。→ §10-5

---

## 6. Excel（**台本の Excel とは別モジュール**）

### 6-1. 置き場所

```
server/src/contexts/qsheet/services/device-excel.service.ts    ← この文書
server/src/contexts/qsheet/services/qsheet-excel.service.ts    ← 03-excel.md（台本）
```

**守ること（03 §0-0 と 08 §4 の再掲。実装で一番踏みやすい）**

1. **互いを import しない。**（`device-excel.service.ts` が `qsheet-excel.service.ts` を読まない・逆も）
2. **列定義・ヘッダ生成・検証を共有しない。**
3. **Excel 用の共通レイヤーを新設しない。** `buildExcelWorkbook` / `excelResponse` は
   `shared/utils/excel.ts` の**既存**のものを**それぞれが直接呼ぶ**だけ
4. **Excel ライブラリを直接 import しない。** `buildExcelWorkbook` だけを呼ぶ（中のライブラリは `shared/utils/excel.ts` の都合で替わる — 実際 SheetJS → ExcelJS に替わった）
5. **2行ヘッダ・`_schema` 隠しシートを混入させない。** 混ざると
   **Assistant が2行目をデータ行として読み、現地で全行が弾かれます**

**CI で守れるようにする**（口約束にしない）: `shared/tests/` に
「`device-excel.service.ts` の中に `qsheet-excel` / `exceljs` / `_schema` の文字列が出てこない」ことを
確かめる小さいテストを1本置く（`shared/tests/crossAppLinks.test.ts` と同じ形の、
**文字列を固定して見張るだけ**のテスト）。

### 6-2. シートの並び

| 順 | シート名 | 中身 | 出す条件 |
| --- | --- | --- | --- |
| **1枚目** | `収録設定` | #279 §4-2 の6列 | 収録を選んだとき |
| 2枚目 | `配信設定` | #279 §4-3 の11列 | 配信を選んだとき |
| 3枚目 | `入力ガイド` | `項目` / `説明` の2列 | 常に付ける（#279 §4-4） |

⚠️ **Assistant は1枚目しか読みません**（#279 §0-3）。
**「収録だけ」「配信だけ」を選べる画面**にしてあるので、**配信だけを選んだときは `配信設定` が1枚目**に来ます。
`buildExcelWorkbook(sheets)` は配列の順にシートを足す（`excel.ts:20-30`）ので、**配列を組む順が仕様です**。
ここに「常に収録が1枚目」のような固定を書かないこと。

### 6-3. 列（#279 §4-2 / §4-3 をそのまま。**綴りを変えない**）

```ts
const RECORDING_COLUMNS = [
  { key: 'deckId',        header: 'デッキ' },
  { key: 'videoFormat',   header: '解像度' },
  { key: 'codec',         header: 'コーデック' },
  { key: 'audioChannels', header: '音声ch' },
  { key: 'slot',          header: '収録先' },
  { key: 'filePrefix',    header: 'ファイル名' },
];
// ⚠️ label は出さない（ONAiR 側の見やすさのための欄・#279 §2-1）
// ⚠️ TCソース列は出さない（#279 §0-5。`TC` に前方一致する見出しは1つも置かない）

const STREAMING_COLUMNS = [
  { key: 'encoderId',    header: 'ENC' },
  { key: 'name',         header: 'セッション名' },
  { key: 'protocol',     header: 'プロトコル' },
  { key: 'url',          header: '宛先' },
  { key: 'port',         header: 'ポート' },
  { key: 'streamKey',    header: 'ストリームキー' },
  { key: 'passphrase',   header: 'パスフレーズ' },
  { key: 'latencyMs',    header: 'Latency' },
  { key: 'bandwidthPct', header: 'Bandwidth' },
  { key: 'mtu',          header: 'MTU' },
  { key: 'aes',          header: '暗号化' },
];
// ⚠️ Stream ID の列は出さない（#279 §4-3）
// ⚠️ meetings は列を1つも作らない（08 §5-4-1）
```

### 6-4. 空行を作らない・空欄を本当に空にする

- **配信先が1件も無い ENC は行を出さない**（空行禁止・#279 §4-1）
- **収録は「使わないと決めた台」を出さない**（灰の段。全 12 行を機械的に出さない）
- ⚠️ **`formatCell` は `null` を `''` にします**（`excel.ts:35`）。
  SheetJS の `aoa_to_sheet` は `''` を**空文字列のセル**として書きます。
  Assistant がこれを「空欄」と読むか「空文字列という値」と読むかは**この repo からは分かりません**。
  → **§7-3 で実測してから決める。** 「空文字列が値として読まれる」なら、
  `formatCell` を触らずに **`buildExcelWorkbook` に渡す前の行から key ごと落とす**か、
  `device-excel.service.ts` 側で `undefined` を使う形に寄せます（`shared/utils/excel.ts` は**触りません**）

### 6-5. ファイル名

```
収録配信設定_{GLS番号 または 案件名}_{YYYY-MM-DD}.xlsx
```

`excelResponse(res, name, buf)`（`excel.ts:45-49`）が `filename*=UTF-8''` を付けます。**自分で書かないこと。**

---

## 7. 検証手順

**本番・検証の DB には一切触りません。** 検証用 Postgres（ポート 5433・`onair_verify`）だけを使います。

```bash
npm run verify:up                       # 約4秒。ポート5433・本番とは完全分離
source /tmp/onair-verify/env.sh
npm run typecheck && npm run lint && npm run test
```

### 7-1. DDL（検証 DB で実際に流す）

| # | 確かめること | どうやって |
| --- | --- | --- |
| 1 | migration が流れる | `npm run migrate -w server`（`_migrations` に新ファイル名が入る） |
| 2 | 同じ案件・同じ日で2行作れない | 同じ `project_id` + `service_date` を2回 INSERT → 2回目が一意違反 |
| 3 | 案件が違えば作れる／日が違えば作れる | 3行 INSERT が通る |
| 4 | 論理削除した行は鍵を塞がない | 1行 `deleted_at` を入れてから同じ鍵で INSERT → 通る |
| 5 | `project_id` と `doc_no` の**両方**入った行を作れない | CHECK 違反になること（§3-4 #2） |
| 6 | 案件を消すと設定も消える | `DELETE FROM projects` → CASCADE |
| 7 | 書き出した人を消せる | `DELETE FROM users` → `last_exported_by` が NULL になる |

### 7-2. API（`x-user-id` ヘッダーで開発認証。`scripts/dev-verify/up.sh:23`）

| # | 確かめること |
| --- | --- |
| 1 | `qsheet` 権限が無い人の GET が **404**（403 ではない） |
| 2 | `reader` が PUT できない（`editor` 以上） |
| 3 | `reader` が `export-xlsx` を**取れない**（`editor` 以上・08 §3） |
| 4 | GET の応答に**平文のストリームキーが1文字も含まれない**（`****` だけ） |
| 5 | 伏せ字（`****abcd`）をそのまま PUT で送り返して**保存し直しても鍵が消えない** |
| 6 | `preflight` の赤・橙・灰が #279 §4-5 の例どおりに出る |
| 7 | `preflight` が **`meetings` を1件も返さない**（会議を全部空にしても赤も橙も出ない） |
| 8 | `copy-from` が **`meetings` と `streamKey` を写さない** |
| 9 | `export-xlsx` のあと `last_exported_*` の3列が入っている |

### 7-3. Excel（**実ファイルを開いて確かめる**）

| # | 確かめること | どうやって |
| --- | --- | --- |
| 1 | 1枚目が選んだシートになっている | 「配信だけ」で書き出し → 1枚目が `配信設定` |
| 2 | 見出しが**1行目・A1 から**、データが2行目から | `xlsx` で読み直して `A1` を見る |
| 3 | **空行が1つも無い** | 全行のセルが空でないことを数える |
| 4 | **`TC` に前方一致する見出しが1つも無い** | 見出し配列を assert |
| 5 | 真偽値セル・日付書式セルが無い | セルの `t` が `b` / `d` でないこと |
| 6 | ⚠️ **空欄が「空欄」として読めるか** | `key_mode='blank'` で書き出し → セルの型と値を出す。**空文字列のセルになるなら §6-4 の対応を採る** |
| 7 | ファイル名が `収録配信設定_..._YYYY-MM-DD.xlsx` | `Content-Disposition` を見る |
| 8 | **`device-excel.service.ts` が `qsheet-excel` / `exceljs` / `_schema` を含まない** | §6-1 のテスト |

⚠️ **6 は Assistant 側でしか最終確認できません**（相手は別プロダクト・Rust）。
ONAiR 側でセルの型を確かめたうえで、**現地で1回試すまでは「未確認」と書く**こと。

### 7-4. 画面

```bash
npm run verify:ui        # 書体・桁揃い・横はみ出しを実ブラウザで実測
```

- **375px（iPhone SE 相当）で横スクロールが出ない**こと
- 表は `overflow-x-auto` で囲む・タップ対象 44px 以上・ダイアログは `max-h-[90vh] overflow-y-auto`
- 値は1行（`white-space: nowrap` ＋ 長体 0.94／詰まるところだけ 0.90。#279 §3-4）
- ⚠️ **JS で測って書き戻す「長体フィット」は入れない**（`docs/design/v4/mockups/DESIGN_POLICY.md`）
- 凍結を解いた直後は `npm run build:all && npm run check:frozen` を回す（`npm run lint` には入っていない・約2分）

---

## 8. PR の切り方

**5本に割ります。** 1本にすると DDL・秘密の扱い・Excel・画面2枚が同じ差分に入り、レビューが成立しません。

| # | PR | 中身 | 検査 |
| --- | --- | --- | --- |
| **1** | `refactor(server): 暗号化ユーティリティを shared に上げた` | §3-3 のみ。**挙動を1つも変えない** | `typecheck` / `lint` / `test`。**既存の `liveops_settings` の値が読めることを検証 DB で確かめる** |
| **2** | `feat(qsheet): 収録設定・配信設定の入れ物を作った` | §3-2 の migration ＋ §4-1/4-2 の GET・PUT ＋ 型定義。**画面なし** | §7-1・§7-2 の 1〜5 |
| **3** | `feat(qsheet): 収録設定・配信設定の画面を作った` | §5-1 の画面（WEB会議を除く）＋ミニアプリ・レジストリへの2件（→ §10-2） | §7-4 |
| **4** | `feat(qsheet): 機器設定の Excel を書き出せるようにした` | §6 の `device-excel.service.ts` ＋ `preflight` ＋ 書き出しダイアログ | §7-2 の 6〜9・§7-3 |
| **5** | `feat(qsheet): 配信設定にWEB会議の情報を持てるようにした` | §5-3・`meetings`。**Excel には出さない**ことのテストを含む | §7-2 の 7・§7-3 の 8 |

⚠️ **PR を出したらその場で `.claude/skills/pr-watch` を使って見張ること**（確認を待たない）。
⚠️ **マージしたらレビュー指摘を `npm run reviews:debt` で棚卸しへ移すこと**（マージすると画面から消えます）。

### changelog.d の1文案

`docs/changelog.d/<枝の名前>.md` に1ファイル。**版の3か所（`package.json` / `CLAUDE.md` / `README.md`）は触らない。**

> **収録設定・配信設定を制作資料のミニアプリとして作った。** HyperDeck 12 台と Magewell 10 台の設定を
> 案件＋実施日の単位で打ち込み、現場の GMO ONAiR Assistant がそのまま取り込める Excel（1枚目・見出し1行・
> 空行なし）を書き出せるようにした。ストリームキーは既存の AES-256-GCM で暗号化して保存し、画面には
> 伏せ字でしか出さず、書き出しは `editor` 以上に限って誰がいつ出したかを記録する。配信設定には
> WEB会議（ツール・URL・ID・パスコード・入力映像／音声）も持てるようにしたが、**現地に反映する経路が
> 無いため Excel には1列も出さず**、共有は画面のコピーで行う。⚠️ 機器設定の Excel は台本の Excel
> （`03-excel.md`）とは前提が正反対（片道・1行ヘッダ・空行禁止）なので、**別モジュールにして互いを
> import せず、共通レイヤーも作っていない**（混ざると現地で読めなくなる）。
> 検証: `npm run typecheck` / `npm run lint` / `npm run test` OK。検証用 Postgres（5433）で DDL と API を実測。

---

## 9. 未決・要確認

### 9-1. 08 §8 が挙げた確認（**31・32・33 は README §4 の「中」に載っているもの**）

| # | 論点 | 実装がどう分岐するか | 既定（決まらなければこれで進む） |
| --- | --- | --- | --- |
| **31** | **入力音声設定にも「その他」＋手入力が要るか** | 要るなら `audioInput` に `'other'`、`audioInputOther?: string` を足すだけ。**型は前方互換**（既存行は `UltraStudio` / `Rubix42` のまま読める）ので**先回りして作らない** | 足さない（08 §5-3 のまま） |
| **32** | **WEB会議は1案件に複数持てる前提でよいか** | 1本でよければ `meetings` を配列にせず単一オブジェクトにでき、`MeetingCard` の追加・削除・並べ替えが要らなくなる（**画面が半分になります**） | 複数持てる（本番用・リハ用。08 §5-1） |
| **33** | **会議のパスコードを「まとめてコピー」に含めてよいか** | 含めないなら「まとめてコピー」の実用性がほぼ無くなる（チャットに貼る前提の機能） | **含める。ただしボタンの文言で分ける**（08 §5-5） |

⚠️ **32 は 31・33 より先に決めてください。** 配列か単一かで `meetings` の JSONB の形が変わり、
**入ったあとに変えるとデータの作り直しが要ります**（31 は列を足すだけ・33 は画面だけ）。

### 9-2. この文書で新しく出た確認

| # | 論点 | なぜ聞くか |
| --- | --- | --- |
| 1 | **`service_date` を必須にしてよいか** | §3-4 #1。「日付を決めずに機器設定だけ先に打つ」運用があるなら必須にできません（その場合は `NULLS NOT DISTINCT` にします） |
| 2 | **`copy-from` のコピー元をどこまで広げるか**（08 §8-3） | 別案件から引けると便利ですが、**qsheet の reader 全員が他案件の設定を読める**ことになります |
| 3 | ⚠️ **「その案件の機器設定が見えてよい人」の定義**（§4-1） | いまの qsheet は**文書単位**の可視性しか持っていません。「`qsheet` 区画の reader = 全案件が見える」でよいか。**ここを決めないと 08 §3 の権限設計が宙に浮きます** |
| 4 | **書き出しの履歴をどこまで残すか**（08 §8-4） | いまの設計は最後の1回だけ。全履歴なら別テーブルが要ります |
| 5 | **収録の「使わない台」をどう表すか** | #279 §4-5 の灰（「出さない」）を**どこに保存するか**が #279 にも 08 にも書かれていません。`decks[].skip: true` を足すか、**行そのものを消す**か |
| 6 | **同時に2人が開いたときの後勝ちでよいか**（§4-2） | 設定は同時編集しない前提ですが、**現場では「PC で打ちながらスマホでも直す」が普通に起きます**。`updated_at` の楽観ロック（409）を足すかどうか |

---

## 10. 設計書と実装の食い違い

### 10-1. ⚠️ PR #279 は**文書だけ**。コードもテーブルも入っていない

08 の冒頭は「PR #279 で出した設計を…合わせ直したもの」と書いており、
README §2 の表も「PR #279 をミニアプリに合わせ直したもの」と読めます。
**実際には #279 は `docs/` だけの 2,199 行の追加**で（§2-1）、
`qsheet_recording_settings` を参照するコードはリポジトリに 1 件もありません。

**影響**: 「合わせ直す」ではなく「初めて作る」ので、**この段の工数は 08 が想定しているより大きい**。
§8 で 5 本の PR に割ったのはそのためです。

### 10-2. ⚠️ ミニアプリ・レジストリの型に「資料ではない道具」を載せる場所が無い

01 §3-2 の `MiniAppDef`（`01-app-structure.md:281-302`）は

```ts
docPrefix: string;   // 資料番号の接頭辞
docNoSeq: string;    // 採番の seq_name
table: string;       // 資料を入れる表。doc_no 列を持つこと
listPath: string;    // 一覧の URL
docPath: string;     // 資料1件の URL のひな形。`:id` を置換
```

を**全部必須**にしています。ところが**収録設定・配信設定は「1案件に1セット」の設定で、
資料番号も一覧も1件ずつの URL も持ちません**（08 §1-2）。
`MiniAppKey` も `'sheet' | 'schedule'` の2つに固定されています。

**このまま「レジストリに2件足す」は書けません。**

**提案（01 の担当と合わせること）**: `MiniAppDef` に判別子を1つ足す。

```ts
export type MiniAppKind = 'document' | 'panel';
// 'document': 資料が複数ある（sheet / schedule）→ docPrefix / docNoSeq / table / docPath が要る
// 'panel'   : 案件に1つの道具（recording / streaming / live）→ path だけ

export type MiniAppKey = 'sheet' | 'schedule' | 'recording' | 'streaming' | 'live';
```

`kind: 'panel'` のときは `docPrefix` 以下を持たせない（判別可能な union にする）。
こうすると **`MINI_APP_UI` の `Record<MiniAppKey, …>` が型で網羅を強制する**利点（01 §3-2）もそのまま残ります。

⚠️ **09（計時・視聴者）も同じ問題を抱えています。** 2本まとめて 01 に投げること。

### 10-3. ⚠️ 08 §2 の DDL は Postgres で**そのまま流すと穴が2つ**

§3-4 の #1（`service_date` NULL で一意が効かない）と #2（`project_id` と `doc_no` の両方が入る行を許す）。
どちらも**エラーにならず、黙って重複が作れる**形です。

### 08 §2 のその他

| 08 §2 の記述 | 実装 | 直し方 |
| --- | --- | --- |
| `TIMESTAMPTZ` | 既存の qsheet / liveops は全部 `TIMESTAMP` | §3-4 #3 |
| `REFERENCES users(id)`（削除挙動なし） | 既定 `NO ACTION` で**ユーザーが消せなくなる** | §3-4 #4 |
| 「`liveops_settings` と同じ AES-256-GCM で暗号化する（`server/src/contexts/liveops/crypto.ts` が既にある）」 | **正しい。ただし別コンテキスト**。qsheet から `contexts/liveops/` を import することになる | §3-3 で `shared/utils/secret-box.ts` へ引き上げ |

### 10-4. ⚠️ 「`access.ts` の作法で 404」は**関数ではなくルートの作法**

08 §3 は「権限が無いときは存在秘匿のため 403 ではなく 404（`access.ts` の作法）」と書いていますが、
`access.ts:18-30` は **`true`/`false` を返すだけ**で、404 を返しているのは
`documents.routes.ts:95,100,150,155` の**呼び出し側**です。
さらに `canAccessDoc` は**文書単位**（`qsheet_document_shares`）なので、
**`:ownerKey`（案件）にはそのまま使えません**。→ §4-1 で `resolveOwner` を新設し、
**「見えない案件は 404」を明示的に実装する**必要があります。**流用では済みません。**

### 10-5. ⚠️ 凍結を解く作業の範囲が 08 に書かれていない

08 §1-3 は「`tokens-v4.css`・LINE Seed JP・共通シェル・`NoticeBar` が使えます」としていますが、
**それが使えるようになるまでに触る検査が3本あります**（08 も 00 も明示していません）。

| 検査 | いまの状態 | 凍結を解くとき |
| --- | --- | --- |
| `scripts/check-frozen-css.mjs:45-49` | `qsheet` / `live` / `awards` の3つを見張る | `qsheet` を外す |
| `scripts/check-shared-wiring.mjs:207` | `V4_APPS = ['client','client-daily','client-equipment']` | `client-qsheet` を足す。**足さないと「凍結アプリを共通シェルに載せ替えないこと」で lint が落ちます**（`:236-238`） |
| 同 `:254-256` | `client-qsheet` だけ `<Toaster />` を1個持つ前提 | **トーストは残す**（放送中の切断通知を含む・README §5-3）ので、**この行はそのまま**。`NoticeBar` / `ConfirmHost` の期待値が 0→1 に変わる |
| `scripts/check-mobile-declared.mjs:23-45` | v4 対象3アプリだけ | `client-qsheet` を足し、`client-qsheet/src/pcOnlyScreens.ts` を新設する |

### 10-6. 08 §1-2 の「資料単体（`doc_no` = `SB-…`）でも持てる」は言葉が食い違っている

08 §1-2 は「収録設定が『Qシート文書の子』だと、Qシートを消したら収録設定も消えます」を
**案件単位にする理由**として挙げていますが、同じ節の最後で
「案件に紐づかない資料単体（`doc_no` = `SB-…`）でも同じように持てます」と書いています。
**`SB-` は 01 §3-2 の `MINI_APPS` で `sheet`（進行台本）の `docPrefix`** なので、
これは結局「進行台本1件に紐づく」形です。

**実装上の解釈**（この文書はこう決めます）: `doc_no` 側は **`qsheet_documents` への FK を張らない**
（TEXT を持つだけ）。**進行台本を消しても機器設定は残る**。
「Qシートを消したら消える」を避けるという §1-2 の目的はこれで満たされます。
⚠️ **代わりに、消えた資料番号にぶら下がった孤児が残ります。** 一覧に出す経路が無いので、
**「案件に紐づかない機器設定」の一覧をどこかに1つ置く**か、**`doc_no` 側を作らない**かを §9-2 の 1 と一緒に決めてください。

### 10-7. 08 §6 の「Excel を書き出す」は**画面4段のうち1段が API に無い**

08 §6 は「4段（シートを選ぶ → 見出しの見本 → 点検 → キーの扱い）」としていますが、
**「見出しの見本」を返す API が §3 の7本にありません。**
`preflight` は赤・橙・灰しか返しません。

**実装の判断**: 見出しは**画面側の定数**から作れる（`RECORDING_COLUMNS` / `STREAMING_COLUMNS` は
サーバーの定数）ので、**`preflight` の応答に `headerPreview: { sheets: [{ name, headers: string[] }] }` を足す**のが素直です。
**画面に列名を書き写さないこと**（書き写すと、サーバーの列を1つ変えたときに見本だけ古くなり、
「見本と実物が違う」という**いちばん気づけない壊れ方**をします）。

### 10-8. 事実として正しかったもの（確認済み・直す必要なし）

| 08 の記述 | 確認 |
| --- | --- |
| 「`buildExcelWorkbook`（`server/src/shared/utils/excel.ts`）で足りる」 | ✅ `excel.ts:18-32`。1行ヘッダ・A1 から・真偽値を文字列化まで満たす |
| 「`xlsx` は `server/package.json` にしか入っていない」（#279 §5-3） | ✅ `server/package.json:42`。client には無い |
| 「`liveops_settings` と同じ AES-256-GCM（`crypto.ts` が既にある）」 | ✅ `crypto.ts:17-41`。鍵は `ENCRYPTION_KEY`、本番未設定なら起動時に例外（`:9-11`） |
| 「migration 210 で7区画に統合済みなので区画を増やさない」 | ✅ `210_simplify_permission_modules.sql:1-30` |
| 「設定は `useState` のローカル状態なので素の `<input>` で構いません」 | ✅ `updateData` / `applyDataUpdate` を通らない限り IME の二重入力は起きない |
| 「`/qsheet/` は制作資料アプリのベースパスであって Qシートのパスではない」 | ✅ `client-qsheet/vite.config.ts:7` ＋ `server/src/app.ts:143` |
