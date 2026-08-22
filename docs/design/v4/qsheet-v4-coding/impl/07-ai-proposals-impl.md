# 段7 実装設計 — 04-a「AI 提案テーブル＋取り込み＋締め」（生成機能は出さない）

> 対象: [`../README.md`](../README.md) §7 の **段7**。
> 元設計: [`../04-ai.md`](../04-ai.md) §2-3 / §2-5 / §3-2 / §3-3 / §3-4 / §5-3a / §5-5 / §5-6 / §9 / §12 / §13-4 / §14
> 会社方針: [`../../../../../CLAUDE.md`](../../../../../CLAUDE.md)「開発の絶対原則: AIを使い捨てにしない」
> ／ 監査の様式: `.claude/skills/ai-feedback-loop/SKILL.md` ＋ `references/patterns.md` ＋ `references/onair-current-state.md`
>
> **この文書もコードではありません。** ただし §2 の事実はすべて実装を読んで確かめたもので、
> `ファイルパス:行番号` を付けてあります。**確かめていないことは「未確認」と書きました。**

---

## 1. この段でやること / やらないこと

README §7 の段7 はこう書かれています。

> ⚠️ **「取り込む → 何も触らない → 締める ⇒ `none` 1行だけ」の往復テストが通るまで、生成機能を出さない。ここが壊れると全指標が同時に嘘になる。**

つまりこの段は **「AI が出したものを受け止めて、人が直した分だけを正しく数える器」** を作る段です。
AI は1回も呼びません。

### やること

| # | やること | 出どころ |
| --- | --- | --- |
| 1 | `qsheet_ai_proposals` ほかの DDL（migration 1本） | 04 §3-2・§9 |
| 2 | 提案を読む／取り込む／捨てる／今すぐ締める／「これは違う」の API | 04 §10-2 |
| 3 | **取り込み（`apply`）の記録**（`applied_payload` / `applied_ids` / `preview.` 差分） | 04 §3-4 |
| 4 | **締め（`settle`）の2段**（`early` / `final`）と、**AI を呼ばない**定時実行 | 04 §3-3 |
| 5 | **放置提案の期限切れ**（`expired` → `reject`）と取り込み率 `applied/generated` | 04 §3-3 |
| 6 | 台詞差分の**本文を digest に出さない**手当て（§5-6 の 2） | 04 §5-6 |
| 7 | クライアント側の**取り込みの唯一の入口** `applyProposal.ts`（`applyDataUpdate` を通す） | 04 §3-1・§12 |
| 8 | **往復テスト**（vitest。§8） | README §7 |

### やらないこと（この段では出さない）

- **生成（①枠 ②骨格 ③セリフ）と ④壁打ち** … 段8。LLM 呼び出しのコードを1行も置かない
- **`qsheet_doc_index` を使った類似検索・few-shot** … 段8。ただし**表と `is_reference` は先に作る**（理由は §3-3）
- **digest の分岐（`outline` / `line` / `chat`）・ナレッジ・月次レポート** … 段9
- **MCP の8ツール** … 段10
- **`qsheet_cue_actuals`（実尺）** … **段1**。この段の migration には入れない（§13 の食い違い#1）

### この段の「完成」の定義

1. `npm run typecheck` / `npm run lint` / `npm run test` が通る
2. **往復テスト**（§8）が緑
3. 検証 DB（`npm run verify:up`）で migration が流れ、`POST /apply` → `POST /settle` を手で叩くと
   `ai_corrections` に **`(全体)` / `none` が1行だけ**入る
4. 期限切れバッチを `force` で流すと、放置提案が `discarded` / `discard_reason='expired'` になり
   `reject` が1行積まれる

---

## 2. 実装前の事実確認（すべて実装を読んで確かめた）

### 2-1. AI 基盤3表と共通ヘルパ

| 事実 | 出どころ |
| --- | --- |
| `ai_outputs` / `ai_corrections` / `ai_outcomes` は存在する。`payload_snapshot` は JSONB で切り詰めない | `server/src/shared/db/migrations/134_ai_feedback_loop.sql:19-73` |
| `ai_corrections.correction_type` の CHECK は **`fix` / `enrich` / `reject` / `rephrase` / `none` の5つ**。`none` を必ず入れるのが分母 | 同 `:47-49` |
| `ai_outputs` / `ai_corrections` は **`TIMESTAMP`（tz なし）** | 同 `:36` / `:52` |
| `recordAiOutput()` は失敗しても `null` を返すだけ（best-effort） | `server/src/shared/services/ai-output.service.ts:50-70` |
| `recordCorrections()` も1件ずつ try/catch で握りつぶす | 同 `:118-140` |
| `hasCorrections()` は**例外時に `true` を返す**（＝書かない側に倒す） | 同 `:104-115` |
| `CORRECTION_WINDOW_DAYS = 7` | 同 `:19` |
| **`diffByKey(before, after, keyField, compareFields, label = 'items')`。引数は5つで、第5引数は `label`**（`field_path` の接頭辞）。省略すると `items[...]` になり、見積（`estimate_draft`）と同じ鍵空間になる | 同 `:169-175` |
| `diffByKey` が返す種別は **`fix` / `reject` / `enrich` の3つだけ**。**`rephrase` は出さない** | 同 `:187` `:196` `:203` |
| 値の比較は「両方が数値らしければ数値比較、そうでなければ `String()` 比較」 | 同 `:190-198` |
| **`toComparable` に相当する関数は、リポジトリ全体に存在しない**（grep 0 件） | 全走査 |
| `findLatestAiOutput(targetTable, targetId, kind, withinDays)` は**最新1件**を返す。同じ台本に提案が何本もあると別提案の成績が汚れる | 同 `:76-96` |

### 2-2. digest（条件4の読み口）

| 事実 | 出どころ |
| --- | --- |
| `getFeedbackDigest(kind = 'estimate_draft', windowDays = 90)`。**第3引数（`segmentKey` / `source`）は無い** | `server/src/shared/services/ai-feedback.service.ts:158` |
| 分母は **`EXISTS (SELECT 1 FROM ai_corrections WHERE output_id = o.id)`**。つまり **`ai_corrections` に1行も無い出力は集計上「存在しなかったこと」になる** | 同 `:165-170` |
| `top_corrected_field_types` は `regexp_replace(field_path, '\[[^\]]*\]', '[]', 'g')` で鍵を潰す。**`preview.` / `normalize.` / `late.` の接頭辞はそのまま残る** | 同 `:196-197` |
| `recent_examples` は `before_value` / `after_value` を**そのまま返す**（10件） | 同 `:85-92` `:238-246` `:267-273` |
| MCP ツール `get_ai_feedback_digest` の `kind` は **`z.string().optional()`**（enum ではない） | `server/src/contexts/mcp/tools/aifeedback.tools.ts:37-46` |
| **read ツールにゲートが無い。** `enforceToolPermissions` は `WRITE_TOOL_PERMISSIONS` に載っていないツールを素通しし、そもそも静的 API キー（`isOAuth === false`）は先頭で `return` する | `server/src/contexts/mcp/gate.ts:104-114`（`:106` が早期 return、`:114` が「読み取りツール等はゲートなし」） |

→ **結論: `script_line_draft` の差分に台詞本文を入れると、共有 API キーの誰からでも読めます。**
04 §5-6 の指摘は**実装のとおり**です。この段で塞ぎます（§7）。

### 2-3. 定時実行（`scheduler.service.ts`）

| 事実 | 出どころ |
| --- | --- |
| 仕事は `JOBS: Job[]` の配列に1行足すだけ。`{ key, at: 'HH:MM', templateId, run }` | `server/src/contexts/platform/services/scheduler.service.ts:46-59` `:456-471` |
| **`templateId: null` = 通知を出さない裏方の仕事**。既に `activity_format`(03:00) と `next_action_short`(03:10) がこの形 | 同 `:469-471` |
| 二重実行は `scheduled_job_runs(job_key, run_date)` の主キーで止める（`ON CONFLICT DO NOTHING RETURNING`） | 同 `:496-502` |
| **15分ごとに起きて「今日まだ流していない＆ `at` を過ぎた」仕事を流す**。時刻ちょうどは狙わない | 同 `:475-478` `:530-541` |
| **`run_date` は「日」単位。月次・週次の概念が無い**（`at` は `HH:MM` だけ） | 同 `:46-59` `:479` |
| 時刻は必ず `jstParts()`（`Intl` 経由）。コンテナは UTC で動き、Alpine は tzdata を持たない | 同 `:40-42` / `server/src/shared/utils/jst.ts:1-40` |
| 失敗しても他の仕事は流す（`try/catch` で `error` 列に落とす） | 同 `:513-522` |

→ **月次（毎月1日）は `run` の中で `jstParts().date.slice(8) === '01'` を見るしかありません。**
04 §5-5 は「毎月1日 03:20 に足す」と書いていますが、**そういう仕組みは無い**ので §13 に記録しました。
（この段では月次は作りません。段9の話です。）

### 2-4. Qシート本体と `data` の所有権

| 事実 | 出どころ |
| --- | --- |
| `qsheet_documents(id, title, data JSONB, project_id, broadcast_date TEXT, status, ..., deleted_at TEXT)` | `server/src/shared/db/migrations/012_qsheet_schema.sql:7-26` |
| `status` の CHECK は `draft/rehearsal/on_air/archived`。**`deleted_at` は TEXT のソフトデリート** | 同 `:19` `:25` |
| **collab の永続化が `data` を丸ごと上書きする。** `updateToData(state)` → `UPDATE qsheet_documents SET data = $2` | `server/src/contexts/qsheet/collab.ts:56-72`（`:68` が UPDATE） |
| debounce は **3000ms**（`new YjsRoomManager(dbPersistence, 3000, 'qsheet-collab')`） | 同 `:77` |
| `data` への書き込みの唯一の入口は `applyDataUpdate(ydoc, updater)`。中身は `backfillIds` → `yDocToData` → `ensureStableIds(updater(prev))` の3手順 | `client-qsheet/src/lib/collab/ydocDiff.ts:187-193` |
| 画面からの呼び出しも `applyDataUpdate(ydoc, (prev) => updater(prev))` の形（**`prev` の関数**） | `client-qsheet/src/pages/EditorPage.tsx:328` |
| `genId(prefix)` は `crypto.randomUUID` 優先。`sec_` / `row_` の接頭辞で使う | `client-qsheet/src/lib/stableIds.ts:22-30` |
| **`scenario` セルは `entries[0] = { name, html, isQWord }`。`text` という欄は無い** | `client-qsheet/src/components/editor/CueRow.tsx:387` `:412-445` |
| **尺は文字列**（`section.duration` / `row.duration`）。読むときは `parseDur()` を通す | `client-qsheet/src/components/editor/CueTable.tsx:577` `:688` `:725` ／ `client-qsheet/src/lib/time.ts:8-23` |
| **`fmtDur` は `server/src/contexts/qsheet/routes/pdf.routes.ts:42` のローカル関数しか無い。** `shared/src/schedule/time.ts` は**存在しない** | 全走査 |
| **`docTotalSec` は存在しない**（段0 で作る） | 全走査 |
| 本番の実尺は `RundownPage` の `useState<Record<number, number>>` のみ。**キーは cue の通し番号（数値）で、行 id ではない** | `client-qsheet/src/pages/RundownPage.tsx:135` |
| OnAir は `cue:next` を**受ける側**で、emit しているのは `cue:update` だけ | `client-qsheet/src/pages/OnAirPage.tsx:337` `:358` |

### 2-5. LLM 呼び出しの共通レイヤ（この段では使わないが、事実として）

| 事実 | 出どころ |
| --- | --- |
| **共通の呼び出しレイヤは無い。** 各サービスが `zodTextFormat` ＋ `client.responses.parse()` を手書きする（5か所） | `intake-ai.service.ts:36,816` / `activity-ai.service.ts:54,338` / `minutes-ai.service.ts:27,368` / `kpt-ai.service.ts:20,219` / `next-action-short.service.ts:44,213` |
| **`zodTextFormat` に渡すスキーマで `.optional()` / `.nullable()` / `.default()` を使っている箇所は5か所とも0件。** 全部必須フィールド＋「無ければ空文字」の `describe` | 上記5ファイル（grep で確認） |
| 段は `light` / `heavy` の2つだけ。`POLICY: Record<AiJob, { base: AiTier; lightMaxChars?: number }>`。**`heavyOver` は存在しない** | `server/src/shared/services/ai-model.ts:200-206` |
| `AiJob = 'intake' \| 'activity' \| 'minutes' \| 'kpt'`。`JOB_ENV: Record<AiJob, EnvName[]>` なので **`AiJob` を足すと `JOB_ENV` にも足さないと型が通らない** | 同 `:57` `:126` |
| `AiUsageKind = 'intake'\|'minutes'\|'activity'\|'activity_short'\|'kpt'\|'stt'\|'stt_preview'` | `server/src/shared/services/ai-usage.service.ts:39-40` |
| 判断基準は「間違いに気づけるか」で費用ではない。モデルの正は `BUILTIN_MODELS` | [`docs/ai-models.md`](../../../../ai-models.md) |

→ **この段では上のどれも触りません。** 段8 で触るときの注意として記録だけしておきます。

### 2-6. migration の実際の最大番号

```
$ ls server/src/shared/db/migrations | sort -V | tail -1
211_drop_techsheet_schema.sql
```

- **実際の最大は `211`**（`a5cd30e feat(techsheet): 技術資料アプリを完全に削除` で入った）。
  README §6 の採番表は「現在の最大が 210」の前提で書かれており、**1つずれています。**
- 欠番: **197 / 205 が無い**。**206 は2本ある**
  （`206_drop_untracked_drift_tables.sql` と `206_weekly_unreviewed_notification.sql`）。
- `migrate.ts` は `readdirSync(...).filter(.sql).sort()` の**ファイル名の辞書順**で流すだけ
  （`server/src/shared/db/migrate.ts:16-18`）。**番号が重なっても CI は落ちません。**

### 2-7. 試験の置き場所（**サーバー側の試験は1本も無い**）

| 事実 | 出どころ |
| --- | --- |
| `npm run test` = `npm run test -w shared` = `vitest run` | ルート `package.json:"test"` ／ `shared/package.json:"test"` |
| **`server/` 配下に `*.test.ts` は0件** | `find server -name "*.test.ts"` → 0 |
| vitest の設定は `shared/vitest.config.mts` の1本だけ | 同ファイル |
| **`shared/tests/` の試験は `server/src/...` を相対パスで直接 import できる**（前例あり） | `shared/tests/nextActionShort.test.ts:15-16` が `../../server/src/contexts/sales/services/next-action-short.service` を import |
| **ソースを文字列として読んで正規表現で守る**やり方も定着している | `shared/tests/aiFeedback.test.ts:20-40`（`readFileSync` して `toMatch`）／`shared/tests/sqlPlaceholder.test.ts` |
| DB を立てる試験の仕組みは**無い**（`npm run verify:up` は手で確かめる用の Postgres） | `scripts/dev-verify/up.sh` |

→ **往復テストは「純関数＋相対 import」でしか自動化できません。** §8 はその形で設計します。

### 2-8. その他

| 事実 | 出どころ |
| --- | --- |
| DB 層は SQL の `?` を数えて `$1,$2…` に置き換える。**jsonb の `?` 存在演算子を SQL に書くと落ちる** | `server/src/shared/db/connection.ts:13-20` ／ `shared/tests/sqlPlaceholder.test.ts` |
| Qシートのルーターは `requireAuth, requirePermission('qsheet')` を全体に掛ける | `server/src/contexts/qsheet/routes/documents.routes.ts:11` |
| 行単位は「作成者／共有先／`system_admin`」。`canAccessDoc` | `server/src/contexts/qsheet/access.ts:13-30` |
| API の前置きは `/api/v1/internal` | `server/src/app.ts:89` |
| **サーバーは `@gmo-onair/shared` を import していない。** `server/tsconfig.json` は `rootDir: "./src"` で paths も無く、`server/package.json` の依存にも入っていない | `server/tsconfig.json` ／ `server/package.json` ／ grep 0 件 |
| 同じ値をサーバーとクライアントで持つときは**意図的に二重に持ち、コメントで同期を約束する**のが既存の作法 | `server/src/shared/constants/statuses.ts:1-8` |
| 1ファイル **400 行**を超える新規ファイルは `npm run lint` が止める | `scripts/check-file-size.mjs:27` `:112-115` |
| `ops_reports` は `kind` に CHECK が無く、`uq_ops_reports_kind_period` がある | `server/src/shared/db/migrations/118_ops_reports.sql:6-27` |

---

## 3. DDL

### 3-1. migration の番号

**実際の最大は `211`（§2-6）。したがって「最大値＋1」は `212` です。**

ただし README §7 の順序では、この段（段7）の前に段0〜6 が入ります。**着手時に必ず**

```bash
ls server/src/shared/db/migrations | sort -V | tail -1
```

を実行し、**その番号＋1** を取ってください。参考として、README §6 の表を実際の最大 `211` 起点で
振り直すとこうなります（**`qsheet_cue_actuals` を段1に切り出す §13 #1 を採った場合**）:

| 段 | 番号 | ファイル | 中身 |
| --- | --- | --- | --- |
| 1 | 212 | `212_qsheet_cue_actuals.sql` | 実尺（**段1。この段では作らない**） |
| 2 | 213 | `213_qsheet_audio_share.sql` | 公開音声のトークンと失効 |
| 3 | 214 | `214_qsheet_doc_no.sql` | `doc_no` |
| 3 | 215 | `215_production_journey_marks.sql` | ジャーニーのピン |
| 4 | 216 | `216_qsheet_schedule.sql` | スケジュール表5本＋共有1本 |
| **7** | **217** | **`217_qsheet_ai.sql`** | **この段** |
| 6 | 218 | `218_qsheet_import_batches.sql` | Excel 取込 |
| 10 | 219 | `219_qsheet_mcp.sql` | MCP の追加列 |

**この段だけを今すぐ単独で入れるなら `212_qsheet_ai.sql`** です。
以下の DDL のファイル名は `NNN_qsheet_ai.sql` と書きます（`NNN` を着手時に確定）。

⚠️ **`qsheet_schedules` への FK があるため、02（スケジュール表）の migration より後**でなければ
なりません。02 がまだ入っていない状態でこの段を先に入れるなら、`schedule_id` の
`REFERENCES qsheet_schedules(id)` を落として `TEXT` のままにし、**02 の migration で
`ALTER TABLE ... ADD CONSTRAINT` する**こと（黙って FK を消したままにしない）。

### 3-2. `NNN_qsheet_ai.sql`（この段で作るもの）

```sql
-- ============================================================
-- NNN: 制作資料 v4 — AI の提案・取り込み・締め（段7 / 04-a）
--
-- **生成機能はまだ載せない。** この migration が作るのは
-- 「AI が出したものを受け止めて、人が直した分だけを正しく数える器」。
--
-- 依存: qsheet_schedules / qsheet_schedule_items（02-schedule の migration）
-- 型は TIMESTAMPTZ に揃える（既存 qsheet_documents は TIMESTAMP + deleted_at TEXT
-- という不整合を抱えているが、新しい表で踏襲する理由がない）。
-- ============================================================

-- ── ① 提案（条件1・条件2の起点） ─────────────────────────────
CREATE TABLE IF NOT EXISTS qsheet_ai_proposals (
  id             TEXT PRIMARY KEY,
  -- event_plan_draft / script_outline_draft / script_line_draft
  -- ⚠️ CHECK は張らない（04 §1-2 の第2版 kind を migration レスで足せるように。
  --    ops_reports.kind と同じ判断）。値の正は ai/kinds.ts。
  kind           TEXT NOT NULL,

  -- ▼ 対象。kind によってどちらかが埋まる
  schedule_id    TEXT REFERENCES qsheet_schedules(id) ON DELETE CASCADE,
  document_id    TEXT REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  project_id     TEXT REFERENCES projects(id),

  -- ▼ AI 出力の本体（切り詰めない）。教師データの正は ai_outputs.payload_snapshot 側で、
  --   こちらは「画面に出す提案」として読む
  proposal       JSONB NOT NULL,
  -- ▼ 何を見て作ったか（再現とレビューのため）。segment_key もここに入る
  context        JSONB NOT NULL DEFAULT '{}',

  -- ▼ AI 基盤への紐づけ。ここが無いと条件1〜4が全部切れる
  ai_output_id   TEXT REFERENCES ai_outputs(id),
  model          TEXT,
  prompt_version TEXT,

  -- ▼ 状態
  state          TEXT NOT NULL DEFAULT 'open'
                 CHECK (state IN ('open', 'applied', 'discarded', 'failed')),
  error_message  TEXT,
  -- 人が見送った理由、または 'expired'（放置）。**人が残す唯一の「なぜ」**
  discard_reason TEXT,

  /* open のまま放置された提案を落とす期限。
     ⚠️ **NOT NULL + DEFAULT にする**（04 §3-2 は NULL 可だった）。
     NULL だと期限バッチが永久に拾わず、その提案は ai_corrections に1行も入らないので
     getFeedbackDigest の分母（EXISTS ai_corrections）から**丸ごと消えます**。
     「10回生成して1回使うと採用率が非常に高く出る」の再発そのもの。
     ⚠️ §3-3 の締めの期限とは**別物**。同じ定数を使わないこと。 */
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),

  -- MCP 由来を見分ける（段10 で使う）。既定 'server' なので先に作っても壊れない
  source         TEXT NOT NULL DEFAULT 'server' CHECK (source IN ('server','mcp')),

  -- ▼ 取り込み（条件2の起点）
  applied_at     TIMESTAMPTZ,
  applied_by     TEXT REFERENCES users(id),
  /* 取り込んだ内容そのもの。**人がプレビューで直した後の値**を入れる（§4）。
     表現は `data` と同じ形（尺は文字列・本文は html）。 */
  applied_payload JSONB,
  /* 取り込みで採番された id。**AI が作った要素だけを後で見分ける鍵**
     { "sections": ["sec_x"], "rows": ["row_a"], "items": ["itm_1"], "columns": [] } */
  applied_ids    JSONB,

  -- ▼ 締め（差分を取る瞬間。§5）
  settled_at       TIMESTAMPTZ,   -- 1段目 early を締めた時刻
  settled_final_at TIMESTAMPTZ,   -- 2段目 final を締めた時刻
  settle_stage     TEXT CHECK (settle_stage IN ('early', 'final')),
  settled_reason   TEXT CHECK (settled_reason IN ('on_air','broadcast_date_passed','timeout','manual')),

  created_by     TEXT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (schedule_id IS NOT NULL OR document_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_ai_prop_doc
  ON qsheet_ai_proposals(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_prop_sch
  ON qsheet_ai_proposals(schedule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_prop_kind_created
  ON qsheet_ai_proposals(kind, created_at DESC);

-- 1段目（early）が拾う対象。**数える SQL と拾う SQL でこの条件を共有する**
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_prop_pending_early
  ON qsheet_ai_proposals(applied_at)
  WHERE state = 'applied' AND settled_at IS NULL;

/* ★ 2段目（final）が拾う対象。04 §3-2 の索引は1段目の条件しか持っておらず、
   **2段目が毎回 seq scan になる**（しかも「拾えていない」ことに気づけない）。 */
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_prop_pending_final
  ON qsheet_ai_proposals(applied_at)
  WHERE state = 'applied' AND settled_final_at IS NULL;

-- 期限切れバッチが拾う対象
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_prop_expiring
  ON qsheet_ai_proposals(expires_at)
  WHERE state = 'open';

-- ── ② 索引（見本の可否だけこの段で作る） ─────────────────────
/* ⚠️ **表とカラムは段7で作る。** 類似検索と few-shot は段8 だが、
   `settle` が「確定した台本を索引に入れ直す」ところまでをこの段で持つため
   （後から足すと、段7〜段8 の間に確定した台本が索引に入らない）。
   ⚠️ **is_reference は DEFAULT TRUE。** 04 の初版は DDL が FALSE で本文が TRUE と
   矛盾しており、DDL のまま実装すると類似検索も few-shot も**常に0件**（エラーは出ない）。 */
CREATE TABLE IF NOT EXISTS qsheet_doc_index (
  document_id      TEXT PRIMARY KEY REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  project_id       TEXT,
  customer_id      TEXT,
  project_type     TEXT,
  broadcast_type   TEXT,
  media_platform   TEXT,
  location_id      TEXT,
  service_date     DATE,
  section_count    INTEGER NOT NULL DEFAULT 0,
  row_count        INTEGER NOT NULL DEFAULT 0,
  /* docTotalSec(sections)。**素朴に sections[].duration を足さない**
     （ロール尺が空の台本で 0 になる。00-datamodel-fixes §3） */
  total_sec        INTEGER NOT NULL DEFAULT 0,
  scenario_rows    INTEGER NOT NULL DEFAULT 0,
  mic_unassigned_rows INTEGER NOT NULL DEFAULT 0,
  block_types      TEXT[] NOT NULL DEFAULT '{}',
  section_labels   TEXT[] NOT NULL DEFAULT '{}',
  person_names     TEXT[] NOT NULL DEFAULT '{}',
  is_reference     BOOLEAN NOT NULL DEFAULT TRUE,
  reference_updated_by TEXT REFERENCES users(id),
  reference_updated_at TIMESTAMPTZ,
  settled_at       TIMESTAMPTZ,
  indexed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_updated_at TIMESTAMPTZ
  -- 将来 pgvector を入れるならここに embedding を ALTER で足す（**今は作らない**。
  -- CREATE EXTENSION を1本も打っていない本番 DB に、1機能のために拡張を入れない）
);

CREATE INDEX IF NOT EXISTS idx_qsheet_doc_index_type
  ON qsheet_doc_index(project_type, broadcast_type) WHERE is_reference;
CREATE INDEX IF NOT EXISTS idx_qsheet_doc_index_project
  ON qsheet_doc_index(project_id);
CREATE INDEX IF NOT EXISTS idx_qsheet_doc_index_customer
  ON qsheet_doc_index(customer_id) WHERE is_reference;
CREATE INDEX IF NOT EXISTS idx_qsheet_doc_index_date
  ON qsheet_doc_index(service_date DESC) WHERE is_reference;
```

**この migration に入れないもの**

| 入れないもの | 行き先 |
| --- | --- |
| `qsheet_cue_actuals`（実尺） | **段1**の別 migration（§13 #1） |
| `qsheet_ai_threads` / `qsheet_ai_messages`（壁打ち） | 段8 |
| `qsheet_ai_knowledge`（ナレッジ） | 段9 |
| `ai_outputs` の `segment_key` 式インデックス | 段9（`getFeedbackDigest` の第3引数と同時） |

⚠️ **`ai_outputs` / `ai_corrections` / `ai_outcomes` のスキーマは変えません。**

### 3-3. `ai_outputs` の書き方（この段の約束）

**04 §3-3 の統一を守ります。**

| 列 | 値 |
| --- | --- |
| `kind` | `event_plan_draft` / `script_outline_draft` / `script_line_draft`（`ai/kinds.ts` が唯一の正） |
| **`target_table`** | **`'qsheet_ai_proposals'`（固定）** |
| **`target_id`** | **`proposal.id`** |
| `payload_snapshot` | 提案の**全文** ＋ `context`（`segment_key` を含む） |
| `model` / `prompt_version` | 生成側（段8）が入れる。この段では **NULL のまま通す** |

**`qsheet_documents` を target にしない理由**: 同じ台本に提案が何本も生まれるので、
target が同じになり突合の起点が壊れます（`findLatestAiOutput` が別提案を掴む）。
この統一により、「これは違う」の経路でも **`findLatestAiOutput` を一切使わずに済みます**
（画面が持っている `proposal_id` から `ai_output_id` を直接引く）。

---

## 4. 取り込みの流れ

### 4-1. 全体

```
   [段8] AI → qsheet_ai_proposals（state='open'）／ai_outputs に1行
                    ↓
          画面のプレビューで人が取捨選択・その場で書き換え
                    ↓
   ① クライアントが applyDataUpdate(ydoc, prev => applyProposalOps(prev, plan)) で data に流す
      ここで **genId() が採番される**（AI に id を作らせない）
                    ↓
   ② POST /qsheet/ai/proposals/:id/apply
      { applied_payload, applied_ids, rejected_keys }
                    ↓
      サーバー: proposal と突き合わせて
        ・提案に無い要素 → applied_ids から外す（AI に帰属させない）
        ・人がプレビューで直した要素 → `preview.` 接頭辞で ai_corrections に fix
        ・人が外した要素 → `reject` を1回だけ
        ・applied_payload は **人が直した後の値**で保存（after 側の基準を揃える）
                    ↓
   ③ 締め（§5）: applied_ids の id 集合だけを、現在の data と突合
```

### 4-2. ⚠️ `applyDataUpdate` の `updater` は必ず `prev` の関数

**これが段7でいちばん壊しやすいところです。**

```ts
// ✗ 絶対に書かない（プレビュー中に他人 or 自分の別タブが足した行が黙って消える）
applyDataUpdate(ydoc, () => mergedData);

// ○ 正しい形
applyDataUpdate(ydoc, (prev) => applyProposalOps(prev as DocumentData, plan));
```

`applyDataUpdate` は `prev` と `next` の**差分**を Yjs 操作へ翻訳します
（`ydocDiff.ts:187-193`）。定数スナップショットを返すと、`prev` にあって `next` に無い行は
**削除操作**に落ちます。**「2人以上なら警告」では防げません**（自分の別タブで起きるため）。
03-excel.md §8-1 が同じ規約を持ちます。

**`applyProposalOps(prev, plan)` は純関数**（`client-qsheet/src/lib/applyProposal.ts`）で:

- `prev.sections` を**そのまま活かして**、提案の要素を「足す／既存行のセルを埋める」だけ
- 新しい section / row には `genId('sec')` / `genId('row')` を**その場で**振る
- **提案の `key`（AI が付けた一時キー）→ 採番された id** の対応表を返す
  → これが `applied_ids` になる
- **提案に `row_id` が入っている場合（③セリフ）は、`prev` に実在する行だけを対象にする**
  （幻覚した id で書き込ませない。`normalize` でも落とすが、二重に守る）

戻り値:

```ts
interface ApplyPlanResult {
  data: DocumentData;                    // updater の返り値
  appliedIds: { sections: string[]; rows: string[]; items: string[]; columns: string[] };
  appliedPayload: AppliedPayload;        // **data と同じ表現**（§4-4）
  keyToId: Record<string, string>;       // 提案の key → 採番された id
}
```

### 4-3. `POST /apply` がやること（改ざん防止と `preview.` 差分）

body はクライアントが作るので、**そのまま `applied_payload` に入れてはいけません。**

```ts
// server/src/contexts/qsheet/ai/apply.core.ts（純関数。DB もネットワークも触らない）
export function sanitizeApplied(input: {
  proposal: ProposalPayload;                 // qsheet_ai_proposals.proposal
  body: { applied_payload: unknown; applied_ids: AppliedIds; rejected_keys?: string[] };
}): {
  appliedPayload: AppliedPayload;            // 保存するもの
  appliedIds: AppliedIds;                    // 保存するもの（提案に無い要素を外した後）
  corrections: CorrectionInput[];            // preview. の差分 ＋ 外した要素の reject
  droppedCount: number;                      // context.dropped_count に入れる
}
```

規則（04 §3-4 のとおり）:

| 場合 | どうするか |
| --- | --- |
| 提案に無い要素が body に入っている | **`applied_ids` から外す**（人が自分で足したものを AI に帰属させない）。`droppedCount` を1増やす。**400 にしない** |
| 提案と同じ | そのまま `applied_payload` に入れる |
| **人がプレビューで直した** | `applied_payload` には**人が直した後の値**を入れる。同時に `{ fieldPath: 'preview.rows[<row_id>].<f>', before: 提案の値, after: 人の値, type: 'fix' }` を積む |
| 人がプレビューで**外した** | `{ fieldPath: 'preview.rows[<key>]', before: 提案の要素, after: null, type: 'reject' }` を**1回だけ** |

- **`preview.` 接頭辞**を付けるのは、digest の `top_corrected_field_types` が
  `regexp_replace(field_path, '\[[^\]]*\]', '[]', 'g')` で鍵だけを潰す仕様
  （`ai-feedback.service.ts:196-197`）なので**接頭辞はそのまま残り**、
  「取り込む前に直された」と「取り込んだ後に直された」を人が読み分けられるからです。
- `context.dropped_count` は残してよいが、**それだけでは何も分かりません**
  （スキルの「確認フラグを差分と呼ぶな」と同じ形）。

⚠️ **`preview.` の差分を積んだ時点で `ai_corrections` に行が入るため、
その提案は締める前から digest の分母に入ります。** これは正しい挙動です
（「取り込む前に全部書き直された」は最も濃い教師データ）。
ただし**締め（`early`）の `hasCorrections` ガードが効かなくなる**ので、
**締めのガードは `hasCorrections(outputId)` ではなく `settled_at IS NULL` を見る**こと（§5-4）。

### 4-4. `applied_payload` の表現形（`toComparable`）

⚠️ **`toComparable` はリポジトリに存在しません**（§2-1）。**この段で作ります。**

**規則: `applied_payload` は「クライアントが `data` に実際に書いた形」で持つ。**
提案の型（`ScriptOutlineProposal` の `duration_sec: number` など）は**プロンプトの出力型**であって
台本の内部表現ではありません。役割を分けます。

```ts
// server/src/contexts/qsheet/ai/comparable.ts（純関数）
/** 差分を取る前に before / after を同じ表現へ寄せる */
export interface ComparableRow {
  row_id: string;
  label: string;       // 行ラベル
  duration: number;    // **秒（数値）**。"1:30" も 90 も parseDurSec() でここへ寄せる
  name: string;        // scenario の entries[0].name（話者）
  html: string;        // scenario の entries[0].html（本文・**平文**）
}
export function toComparableRow(row: unknown, scenarioBlockId: string): ComparableRow;
export function toComparableItem(item: unknown): ComparableItem;  // ①枠用
```

**なぜ必要か**（04 §3-3 手順3）:
`diffByKey` の比較は「両方が数値らしければ数値比較、それ以外は `String()` 比較」
（`ai-output.service.ts:190-198`）。`90` と `"1:30"` は不一致になるので、
**人が1文字も触っていない行が全部 `fix` になります。** 話者名（`speaker` vs `entries[0].name`）、
本文（`text` vs `entries[0].html`）も同じ経路でずれます。

⚠️ **`text` という欄は実装に存在しません。** セルは
`row.cells[<scenarioBlockId>].entries[0] = { name, html, isQWord }`（`CueRow.tsx:387`）で、
本文は **`html` に平文**が入ります。

⚠️ **`parseDurSec` はサーバーにありません。** `client-qsheet/src/lib/time.ts:8-23` の
`parseDur` はクライアント専用で、サーバーは import できません（§2-8）。
**`server/src/contexts/qsheet/ai/comparable.ts` に同じロジックを持たせ、
`client-qsheet/src/lib/time.ts` と対で保つ旨をコメントに書く**
（`server/src/shared/constants/statuses.ts:1-8` と同じ作法）。
`shared/tests/` から両方を import して**同じ入力で同じ秒数になること**を試験で固定します（§8）。

### 4-5. `applied_ids` だけを突合する

```ts
// 締めのとき: after は現在の data 全部だが、突合するのは applied_ids の id だけ
const beforeRows = appliedPayload.rows;                                  // AI が置いた行
const afterRows  = allRowsOf(currentData).filter(r => appliedIdSet.has(r.row_id));
diffByKey(beforeRows.map(toComparableRow), afterRows.map(toComparableRow),
          'row_id', ['label', 'duration', 'name', 'html'], 'rows');
//                                                          ^^^^^^
// ⚠️ **第5引数 'rows' を省略しない。** 省略すると既定 'items' で、
//    見積（estimate_draft）と同じ鍵空間になる（ai-output.service.ts:174）
```

- **人が後から足した行は対象外**（`applied_ids` に無いので `afterRows` に入らない）。
- 配列 index 突合は禁止（1行挿すと全行が「修正された」になる）。
- `applied_ids` に載っていて `after` に居ない行 → `diffByKey` が `reject` を返す（消された）。

---

## 5. 締めの2段

### 5-1. 何をいつ締めるか

| 段 | `settle_stage` | いつ | `field_path` | 何を数えるか |
| --- | --- | --- | --- | --- |
| 1段目 | `early` | `applied_at` + **7日**（`CORRECTION_WINDOW_DAYS`） | **無加工**（`rows[...]`） | **AI 起因の修正**。digest の無修正採用率の分母は**ここだけ** |
| 2段目 | `final` | **本番の翌日 03:00 JST** | **`late.` 接頭辞**（`late.rows[...]`） | 本番直前にどれだけ動いたか |

`settled_reason`（2段目の理由）:

| 値 | 条件 |
| --- | --- |
| `on_air` | その台本で本番トランスポートが動いた日（`qsheet_cue_actuals` にその文書の行が入った日）の**翌日 03:00 JST** |
| `broadcast_date_passed` | `qsheet_documents.broadcast_date`（①枠なら `qsheet_schedules.service_date`）の**翌日 03:00 JST** |
| `timeout` | **本番日が特定できないときだけ**（両方 NULL）。`applied_at` から 30 日 |
| `manual` | 「今すぐ締める」を人が押した |

⚠️ **`timeout` を「最も早いもの」にしない。** そうすると本番が8日以上先の台本では
`timeout`(7日) が必ず勝ち、測りたい「当日の直し」を 100% 取りこぼします。

⚠️ **`qsheet_cue_actuals` は段1の表です。** 段1 が未実装のうちは `on_air` の判定を
**無効にする**（`broadcast_date_passed` / `timeout` だけで回す）。表が無いのに
JOIN を書くと migration の順によって落ちます。**存在しない表を参照しないこと。**

### 5-2. 順序が逆転したとき（**04 が決めていない穴**）

**本番が取り込みから7日以内にあると、`final` の期限が `early` より先に来ます。**
04 §3-3 はこの場合を決めていません。放置すると実装者ごとに挙動が変わり、
**同じ差分が接頭辞ありとなしで二重に積まれる**か、`early` が永久に締まりません。

**決め: 同じ回で両方の期限に達していたら、必ず `early` → `final` の順に2回積む。**

- `early` は `applied_at + 7日` **または** `final` の期限のうち、**先に来たほう**で締める。
- `final` は `early` が締んだ後にだけ積む。同じ回で両方来た場合、`final` の差分は
  ほぼ 0 件になる（after が同じ `data` なので）→ **`late.(全体)` に `none` が1行**入る。
- これで無害。**分母は `early` だけなので指標は歪みません**し、
  「本番が取り込みから7日以内だった」ことが記録から読めます。

### 5-3. どこで起動するか

**`scheduler.service.ts` に「通知を出さない裏方の仕事」を2本足します**（`templateId: null`）。
既存の `activity_format`(03:00) / `next_action_short`(03:10) と同じ形です
（`scheduler.service.ts:469-471`）。

```ts
// server/src/contexts/platform/services/scheduler.service.ts の JOBS に追記
{ key: 'qsheet_ai_expire', at: '03:15', templateId: null, run: expireOpenProposals },
{ key: 'qsheet_ai_settle', at: '03:20', templateId: null, run: settleDueProposals },
```

- **03:20 にするのは、既存の 03:00 / 03:10（AI を呼ぶ仕事）と重ねないため。**
  こちらは **AI を1回も呼びません**が、同じ深夜帯に固めない既存の作法に合わせます。
- **`run` は `NotifyInput[]` を返す型なので `return []`。** 通知は出しません
  （毎晩「N件締めました」は要らない。`scheduled_job_runs.created` に0が入るだけ）。
- 二重実行は `scheduled_job_runs(job_key, run_date)` の主キーが止めます（`:496-502`）。
- **1回の上限を置きます**（`LIMIT 200`）。落ちた日に翌日また拾えるよう、
  **失敗した提案は `settled_at` を立てない**（次の晩に再挑戦）。
- 止め方は環境変数 `QSHEET_AI_SETTLE_NIGHTLY=off`（既存2本と同じ形）。

⚠️ **無人バッチに AI 呼び出しを1つも置かない**（04 §8）。`settleDueProposals` は
`applied_payload` と現在の `data` を突合するだけの純粋な Node 処理です。

**手動の口**: `POST /qsheet/ai/proposals/:id/settle`（`settled_reason='manual'`）。
デバッグと、日程が飛んだときの手動締め用。

### 5-4. `settleProposal(proposalId, stage)` の手順

1. **before = `applied_payload`。** `proposal` でも「保存直前の行」でもない。
   - `proposal` にすると、人がプレビューで消した行を「AI が間違えた」と二重に数える。
   - 「保存直前の行」にすると、書きかけを保存してから確定した人の修正が**全部「無修正」**になる
     （議事録で実測して直した地雷。`onair-current-state.md`）。
2. **after = 現在の `qsheet_documents.data`**（①枠なら `qsheet_schedule_items`）。
   collab 中でも最大3秒古いだけで、締めは翌日以降なので十分。
3. **両方を `toComparable*()` に通してから** `diffByKey(..., 'rows')`（§4-4・§4-5）。
4. 種別の決め方:
   - 消えた行 = `reject` ／ 空→値 = `enrich` ／ 値→別値 = `fix`
   - **文章の言い換え = `rephrase`。`diffByKey` はこれを出しません**（§2-1）。
     **`html` の `fix` を後段で `rephrase` に格上げする純関数**を通します:
     `similarity >= 0.6 → rephrase`、それ未満は `fix`。
     `ai_corrections.note` に `sim=0.62` を機械的に入れておく（後から閾値を引き直せる）。
     ⚠️ **±20% の文字数差で判定しない。** 同じ長さの全面書き換え（＝中身が違う）を
     `rephrase` と誤判定し、「ナレッジを直すかプロンプトを直すか」の判断を逆にします。
   - **`correction_type` は人が上書きできる**: `PUT /qsheet/ai/corrections/:id`（`manager` 以上）。
5. **差分が 0 件でも `[{ fieldPath: '(全体)', type: 'none' }]` を必ず1行残す。**
   これが正解ラベルで、無いと分母が壊れます。**直した場合も、直さなかった項目を
   `none` で埋めて分母を作る**（`recordProjectAccepted` と同じ発想）。
6. **二重計上を防ぐ。**
   ⚠️ **`hasCorrections(outputId)` を使わない。** `apply` の時点で `preview.` の差分が
   入っている提案では**常に `true` を返し、`early` が黙って積まれません**
   （`ai-output.service.ts:104-115`。しかも例外時も `true`）。
   → **`UPDATE ... SET settled_at = NOW() WHERE id = ? AND settled_at IS NULL RETURNING id`
   が1行返したときだけ積む**（DB 側で1回に絞る）。`final` は `settled_final_at` で同じことをする。
7. 締めたら `settle_stage` / `settled_at`（`final` なら `settled_final_at` と `settled_reason`）を立て、
   **`qsheet_doc_index` を作り直す**（`settled_at` と `source_updated_at` を更新）。
   ⚠️ 索引の読み出しには必ず
   `JOIN qsheet_documents d ON d.id = i.document_id AND d.deleted_at IS NULL` を入れる
   （`deleted_at` は TEXT のソフトデリートなので `ON DELETE CASCADE` は**永久に発火しない**）。

⚠️ **04 初版の「`if (userId === config.mcpActorId) return;`」は書かない。**
`settleProposal` は翌日のバッチで突合するだけで、**`userId` がスコープに存在しません**。
正しくは「**Yjs の origin では書き手を区別できないので、AI が書いた分は `applied_ids` の
id 集合でしか見分けない**」です。

### 5-5. 期限切れ（`expireOpenProposals`）

```sql
-- state='open' AND expires_at < NOW() を LIMIT 200 で拾う
UPDATE qsheet_ai_proposals
   SET state = 'discarded', discard_reason = 'expired', updated_at = NOW()
 WHERE id = ? AND state = 'open'
RETURNING ai_output_id;
```

拾えた提案について:

```ts
recordCorrections(outputId, [{
  fieldPath: '(全体)', before: null, after: null,
  type: 'reject', note: '未使用のまま期限切れ',
}]);
```

**これが無いと `state='open'` の放置提案は `ai_corrections` に1行も入らず、
`getFeedbackDigest` の分母（`EXISTS ai_corrections`・`ai-feedback.service.ts:169`）から
丸ごと消えます。** 結果「10回生成して1回だけ使った」場合、無修正採用率は
**その1回だけで計算され、非常に高く出ます**。

---

## 6. 指標の3本立てと、生成ベースの数

### 6-1. 尺の精度（3本立て）

**主指標は「AI が置いた尺の精度」で、人が直したあとの尺ではありません。**

```
ai_duration_mape    = median(|actual_sec - applied_payload の duration| / applied_payload の duration)
                        ← **AI の精度（主指標）**
human_duration_mape = median(|actual_sec - planned_sec| / planned_sec)
                        ← 人の最終見積もりの精度（参考）
plan_drift_sec      = median(planned_sec - applied_payload の duration)
                        ← **人が AI の尺をどちらへ何秒動かしたか**
```

**なぜ3本要るか**: `qsheet_cue_actuals.planned_sec` は DDL のコメントどおり
「そのとき画面が出していた予定尺」＝**本番当日に人が直し終わった値**です。
行を `applied_ids.rows` に絞っても、**絞られるのは行であって値の版ではありません。**
これだけを見ると「AI が酷い尺を出しても人が全部直せば良い数字が出る」ため、
**改善判断が逆向き**になります。

**この段でやること**: `settleProposal` の中で `applied_payload` から
**AI の初期値（`duration`・秒）を取り出して `ai_corrections.note` に添える**か、
`ai_corrections.before_value` にそのまま残す（`toComparableRow` が秒に寄せているので後者で足ります）。
**新規カラムは要りません。**

⚠️ **`ai_duration_mape` の計算そのものは段9**（`getFeedbackDigest` の `outline` 分岐）です。
この段で必要なのは「**あとで計算できる形で before を残す**」ことだけ。
段1（`qsheet_cue_actuals`）が未実装のうちは `actual_sec` が無いので**3本とも `null`**。

⚠️ **実尺の取得率を必ず並べる**（段9で digest に出す）:
`runs_measured / broadcasts_total`。ランダウンを使わない現場は1行も入らないので、
`mape` の分母が「几帳面なチームの本番」に偏ります（自己選択バイアス）。
取得率が5割を切っている間は「実尺の記録がある本番が少ないため断定できません」を出す。

### 6-2. 取り込み率（`applied / generated`）

⚠️ **「一撃で当たったか」の主指標は無修正採用率ではなく取り込み率です。** 04 初版にはこの数字が
どこにもありませんでした。無修正採用率は「使われた提案」だけを見るので、**捨てられた提案が
1件も入りません。**

この段で **`qsheet_ai_proposals` だけから数えられる4数**を出せるようにします
（`ai_outcomes` には**焼かない** — 既存データから導出できるものに行を足すと、
書き忘れた日から数字が嘘になる）:

```sql
SELECT kind,
       COUNT(*)                                                          AS generated,
       COUNT(*) FILTER (WHERE state = 'applied')                         AS applied,
       COUNT(*) FILTER (WHERE state = 'discarded'
                          AND COALESCE(discard_reason,'') <> 'expired')  AS discarded,
       COUNT(*) FILTER (WHERE discard_reason = 'expired')                AS expired
  FROM qsheet_ai_proposals
 WHERE created_at >= NOW() - (? || ' days')::interval
 GROUP BY kind
```

- 取り込み率 = `applied / generated`
- **`expired` は `discarded` と別に数える**（人が判断して捨てたのか、誰も見なかったのかは意味が違う）
- ただし **`ai_corrections` には `expired` も `reject` として積む**（§5-5）。
  digest の分母を作るのはそちらで、この4数は**生成ベース**の別の見方です。
- 読み出しの口は `GET /qsheet/ai/proposals/stats?window_days=90`（`manager` 以上）。
  **段9 で `FeedbackDigest` に差し込みます。**

⚠️ **`jsonb` の `?` 存在演算子を SQL に書かないこと。** DB 層が `?` をプレースホルダとして
数えて `$n` に置き換えるため `syntax error at or near "$1"` で落ちます
（`connection.ts:13-20`。`shared/tests/sqlPlaceholder.test.ts` が機械で見ています）。

---

## 7. 差分の記録（接頭辞と、台詞の落とし方）

### 7-1. 接頭辞の一覧（**この3つで読み分ける**）

| 接頭辞 | いつ積むか | 種別 | 意味 |
| --- | --- | --- | --- |
| （無し）`rows[<row_id>].<f>` | `settle`（`early`） | `fix`/`enrich`/`reject`/`rephrase`/`none` | **AI 起因の修正**。digest の分母はここ |
| **`preview.`** | `apply`（§4-3） | `fix` / `reject` | **人がプレビューで書き換えた／外した分**。いちばん濃い教師データ |
| **`normalize.<reason>.`** | 生成直後（**段8**） | `reject` | **`normalize` が捨てた AI の誤り**。人が触る前の純粋な誤り |
| **`late.`** | `settle`（`final`） | 同上 | 本番直前にどれだけ動いたか |

`top_corrected_field_types` は `[...]` の中身だけを潰す（`ai-feedback.service.ts:196`）ので、
接頭辞はそのまま残ります。**「`normalize.bad_reference.rows[]` が 28 件」と出れば
プロンプトを直す先が一発で分かります。**

⚠️ **`normalize.` の器はこの段で用意しますが、積むのは段8です。**
`recordCorrections` に渡す形（`fieldPath: 'normalize.${reason}.${path}'` / `type: 'reject'`）を
`ai/kinds.ts` の定数と型で先に固めておき、段8 が書き足すだけにします。
これを段8 に丸投げすると、**いちばん自動で取れる教師データが黙って落ちます**（04 §2-5 の F8）。

### 7-2. 台詞の差分（**確認7 が保留のため両案を書く**）

README §4 高 #7 は**まだ決まっていません**:

> **台詞の差分を「本文のまま」記録してよいか。** 設計では `{ 長さ, 先頭20字, ハッシュ }` に落とします。

**事実（§2-2）**: `get_ai_feedback_digest` は無ゲートの read ツールで、`recent_examples` が
`before_value` / `after_value` をそのまま返します。**`script_line_draft` の差分を本文のまま
入れると、共有 API キーの誰からでも台詞が読めます。** 05-mcp が「台本は 404 で存在秘匿」と
設計した意味が裏口から消えます。

| 案 | 内容 | 教師データ | 秘匿 |
| --- | --- | --- | --- |
| **A（既定・設計の案）** | `script_line_draft` の `html` 差分は **`{ len, head, hash }`** に落として `ai_corrections` に入れる。**全文の正は `ai_outputs.payload_snapshot`（MCP から読めない）に残る** | ○（`payload_snapshot` に全文がある） | ○ |
| B | 本文のまま入れる。代わりに **`get_ai_feedback_digest` の `kind` を `z.enum` にし、qsheet 系 kind は OAuth actor かつ `qsheet` manager 以上でなければ `recent_examples` を落とす degrade** | ○ | △（degrade を1か所でも忘れると全社に出る） |

**実装は A を既定とし、B の degrade も同時に入れます**（多層防御）。
どちらか片方だけにしない理由:
- A だけだと、`ops_reports.kind='ai_review_production'`（段9）に個票を貼った瞬間に
  **`dailyops` の reader 権限で台本の断片が読めます**。
- B だけだと、degrade を1か所でも忘れた日に全部出ます。

```ts
// server/src/contexts/qsheet/ai/redact.ts（純関数）
/** 台詞など「本文そのもの」を差分に残さないための落とし方 */
export function redactText(v: string): { len: number; head: string; hash: string } {
  return { len: [...v].length, head: [...v].slice(0, 20).join(''), hash: sha256(v).slice(0, 16) };
}
/** kind ごとに、どのフィールドを落とすか（1か所で決める） */
export const REDACT_FIELDS: Record<string, string[]> = {
  script_line_draft: ['html'],       // 本文
  script_outline_draft: [],          // ロール名・尺は落とさない
  event_plan_draft: [],
};
```

⚠️ **`head` の20字にも顧客名が入りえます**（「本日は◯◯社の…」）。
それでも `head` を残すのは、**ハッシュだけでは「何を直したのか」が1バイトも分からない**ためです。
**`head` を出すかどうかは、確認7 の回答とセットで決めてください**（§12 #1）。

⚠️ **`kind` 引数を必須にしない。** 既存の `kind` は `z.string().optional()` で、
**Git 管理外のメール取込スキル（`/root/.claude/skills/sales-mail-gmoonair/`）が
最短1時間おきに叩いています**。必須引数を1つ足すと**次の実行から全部落ちます**。
`z.enum([...]).optional()` にすること。

---

## 8. 往復テスト（「取り込む → 何も触らない → 締める ⇒ `none` 1行だけ」）

### 8-1. なぜ自動化が難しいか（実装の制約）

- **サーバー側の試験は1本も存在しません**（`find server -name "*.test.ts"` → 0 件）。
- `npm run test` は `shared` の vitest 1本だけで、**DB を立てる仕組みがありません**。
- ただし `shared/tests/*.test.ts` は **`server/src/...` を相対パスで直接 import できます**
  （前例: `shared/tests/nextActionShort.test.ts:15`）。

→ **「DB を触る部分」と「判断する部分」を分け、判断する部分を純関数にして試験します。**
これは `normalizeShort` / `nextActionLine` を純関数にして固めた既存の作法と同じです。

### 8-2. 純関数に切り出すもの（**この設計の要**）

```
server/src/contexts/qsheet/ai/
  comparable.ts   ← toComparableRow / toComparableItem / parseDurSec（§4-4）
  apply.core.ts   ← sanitizeApplied（§4-3）        …… DB もネットワークも触らない
  settle.core.ts  ← computeSettleCorrections（§5-4）…… DB もネットワークも触らない
  redact.ts       ← redactText / REDACT_FIELDS（§7-2）
  apply.service.ts / settle.service.ts  ← DB の読み書きだけ（上を呼ぶ）
```

```ts
// settle.core.ts
export function computeSettleCorrections(input: {
  kind: string;
  appliedPayload: AppliedPayload;   // before
  appliedIds: AppliedIds;
  after: { rows?: unknown[]; items?: unknown[] };  // 現在の data / schedule_items から作る
  stage: 'early' | 'final';
  scenarioBlockId: string | null;
}): CorrectionInput[];
```

- `stage === 'final'` なら**すべての `fieldPath` に `late.` を付ける**（この関数の中で付ける。
  呼ぶ側に任せると必ず片方で忘れる）
- **差分 0 件なら `[{ fieldPath: '(全体)', type: 'none' }]` を返す**（この関数の責任にする）
- `REDACT_FIELDS[kind]` に載ったフィールドは `redactText()` を通してから返す

### 8-3. 試験（`shared/tests/qsheetAiRoundTrip.test.ts`）

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeApplied } from '../../server/src/contexts/qsheet/ai/apply.core';
import { computeSettleCorrections } from '../../server/src/contexts/qsheet/ai/settle.core';
import { toComparableRow, parseDurSec } from '../../server/src/contexts/qsheet/ai/comparable';
import { parseDur } from '../../client-qsheet/src/lib/time';
```

**必ず入れる試験**:

| # | 何を固定するか | 期待 |
| --- | --- | --- |
| **1** | ⭐ **往復（本命）**: 提案 → `sanitizeApplied`（人は何も触らない）→ その `appliedPayload` から `data` を作る → `computeSettleCorrections(stage:'early')` | **`[{ fieldPath: '(全体)', correction_type: 'none' }]` の1行だけ**。長さも1であること |
| 2 | **表現形のずれ**: 提案が `duration_sec: 90`、`data` が `duration: "1:30"` | **1件も差分が出ない**（`toComparableRow` が両方 90 に寄せる） |
| 3 | **`name`/`html` のずれ**: 提案 `{speaker, text}` → `data` `entries[0]={name, html}` | 差分 0 件 |
| 4 | **人が後から足した行**: `applied_ids` に無い行を `data` に足す | 差分 0 件（`enrich` を出さない） |
| 5 | **人が消した行**: `applied_ids` の行を `data` から消す | `reject` が1件。**`none` は出さない** |
| 6 | **`field_path` の鍵空間**: 差分が出たときの `fieldPath` | **`rows[...]` で始まる**（`items[` で始まらない＝第5引数を渡している） |
| 7 | **`late.` 接頭辞**: 同じ入力で `stage:'final'` | 全部 `late.` で始まる |
| 8 | **`preview.` 差分**: 人がプレビューで `text` を書き換えて取り込む | `preview.rows[...].html` の `fix` が1件、`appliedPayload` には**人の値**が入る |
| 9 | **提案に無い要素**: body に勝手な行を足す | `appliedIds.rows` に**入らない**、`droppedCount` が1、**例外を投げない** |
| 10 | **`rephrase` の格上げ**: 同じ長さの全面書き換え | `rephrase` ではなく **`fix`**（正規化編集距離 < 0.6） |
| 11 | **台詞の伏せ**: `kind='script_line_draft'` の `html` 差分 | `before`/`after` が `{ len, head, hash }` で、**本文そのものを含まない** |
| 12 | **秒の解釈が2つに割れない**: `parseDurSec`（サーバー）と `parseDur`（クライアント）に同じ入力 | 同じ秒数（`"1:30"` / `"90"` / `"0:01:30"` / `""` / `null`） |

**ソースを読む見張り（`aiFeedback.test.ts` / `sqlPlaceholder.test.ts` と同じ形）**:

| # | 何を見るか |
| --- | --- |
| 13 | `client-qsheet/src/lib/applyProposal.ts` に **`applyDataUpdate(ydoc, () =>`** の形が**無い**こと（`prev` の関数であること） |
| 14 | `settle.service.ts` が **`hasCorrections(` を呼んでいない**こと（§5-4 の 6） |
| 15 | `settle.service.ts` の UPDATE が **`AND settled_at IS NULL`** を持つこと |
| 16 | `apply.service.ts` / `settle.service.ts` に **`callOpenAi` / `callAnthropic` / `openai` の import が1つも無い**こと（＝AI を呼ばない） |
| 17 | `scheduler.service.ts` の `qsheet_ai_settle` / `qsheet_ai_expire` が **`templateId: null`** であること |
| 18 | `NNN_qsheet_ai.sql` に **`CREATE EXTENSION` が無い**こと |
| 19 | `qsheet_doc_index` の `is_reference` が **`DEFAULT TRUE`** であること |

**手で確かめること（自動化しない）**: 実 DB での `apply` → `settle` の往復は
`npm run verify:up` の検証 Postgres で手動（§10）。**DB 込みの自動試験は作りません**
（仕組みが無く、この PR で作ると本題より大きくなる）。§12 に残します。

---

## 9. AIフィードバックループ5条件の充足表

**結論を先に。** この段で**条件1と条件2は完全に閉じます**（器＋自動 diff＋接頭辞＋`none` の分母）。
**条件3は `qsheet_cue_actuals`（段1）待ちで △、条件4と条件5はこの段では ✕**（段9で閉じる）。
**顧客反応は4機能とも ✕ で、代替も無いことを正面から書きます。**

### 9-1. 充足表（この段の完了時点）

| # | 条件 | 判定 | どのテーブル・どの経路で満たすか / 何が足りないか |
| --- | --- | :-: | --- |
| **1** | AI出力を記録・保存 | **○** | `ai_outputs.payload_snapshot`（**切り詰めない**）＋ `qsheet_ai_proposals.proposal`。`target_table='qsheet_ai_proposals'` / `target_id=proposal.id` に統一（§3-3）。**この段では入れる側（生成）が無いので、`apply` の受け口と DDL だけが先にできる** |
| **2** | 人間の修正を差分として残す | **○** | `ai_corrections` に4系統: 無加工（`settle` の `early`）／**`preview.`**（プレビューでの書き換え・§4-3）／**`late.`**（`final`）／**`normalize.`**（器のみ。積むのは段8）。**before は `applied_payload`**、突合は **`applied_ids` の id 集合だけ**。**差分0でも `none` を1行**。理由欄（`note`）は任意 |
| **3** | 顧客反応と成果指標を出力に紐づける | **△** | **導出の材料はこの段で揃う**（`applied_payload` に AI の初期尺が秒で残る）。**計算は段9**。⚠️ **`actual_sec` が無いので、段1（`qsheet_cue_actuals`）が入るまで `ai_duration_mape` は `null`**。生成ベースの4数（`generated/applied/discarded/expired`）は**この段で出せる**（§6-2）。**顧客反応は ✕**（§9-3） |
| **4** | 貯めたデータをAI改善に戻す経路 | **✕（段9）** | `get_ai_feedback_digest` は既存だが、qsheet の4 kind を渡しても **`outline`/`line` の分岐が無い**ので集計値しか返らない。**この段では「読ませる」経路を作らない**（生成が無いので読む相手がいない）。⚠️ ただし §7-2 の degrade は**この段で入れる**（先に入れないと、段8 で生成した瞬間に台詞が漏れる） |
| **5** | レビュー頻度と担当 | **✕（段9）** | 04 §5-5 は「月1回・制作管理のマネージャー・`ops_reports.kind='ai_review_production'`」と決めているが、**担当が名前で決まっていない**（README 確認8）。かつ **`scheduler.service.ts` に月次の仕組みが無い**（§2-3）。**この段では作らない** |

### 9-2. 埋まらなかった条件の代替案（**「できない」で止めない**）

| 条件 | 何が埋まらないか | 代替案 |
| --- | --- | --- |
| **3（尺の精度）** | `qsheet_cue_actuals` が段1。段7 単独では `actual_sec` が無い | **(a) 段1 を先に入れる**（README §7 の順序どおり。これが本線）。**(b) それでも間に合わないときの暫定**: `plan_drift_sec`（`planned_sec − AI の初期値`）だけなら**実尺なしで出せる**。「人が AI の尺をどちらへ何秒動かしたか」は `applied_payload` と `data` だけで計算でき、ナレッジの自動ルール案（「挨拶系は −90 秒に動かされる」）にそのまま効く。**`fix` の件数からでは秒数が出ない**ので、これは単独で価値がある |
| **3（顧客反応）** | 台本に顧客の反応は付かない | **測らない、と正面から書く**（04 §5-4）。proxy 候補（同じ案件の次の回・同じ顧客のリピート）は「継続は AI とほぼ無関係」、`projects.stage` は「**台本は受注の後に作るので因果が逆**」。**測れないものを測れるふりをして数字を出すほうが害が大きい**（既存の `minutes.tracked_rate` に注意書きが付いているのと同じ発想）。代わりに段9 の月次レビューで**人が定性的に見る** |
| **4** | 段9 まで還流の口が無い | **この段では「読ませる」より「汚さない」を優先**する。`preview.` / `late.` / `normalize.` の接頭辞と `none` の分母を**先に**入れておけば、段8 で生成を出した日から**正しい形で貯まり始めます**。逆順（先に digest、後から接頭辞）にすると**混ざった期間のデータは後から切り分けられません** |
| **5** | 担当が名前で決まっていない・月次の仕組みが無い | **(a) 名前を訊く**（README 確認8・§12 #3）。**(b) 仕組みは `scheduler.service.ts` の日次 `run` の中で `jstParts().date.slice(8) === '01'` を見る**（月次の器は無いので、これしかない。§13 #3）。**(c) `ops_reports.reviewed_at` で実施率を測り、2か月連続で NULL なら digest の `advice` 先頭に出す** — **AI 自身が読む場所に出すのがいちばん確実**。ただし全部**段9** |

### 9-3. リスク（**指摘されないと必ず踏むもの**）

1. ⭐ **正常な業務更新を AI の誤りとして数える。** ONAiR の台本は数か月更新され続けます。
   `applied_ids` の id 集合＋2段締め（`early` 7日 / `final` 本番翌日）で切っていますが、
   **`timeout` を 30 日より長くした瞬間に壊れます。** 定数は `ai/kinds.ts` に1か所だけ置くこと。
2. **`preview.` を積むと `hasCorrections` が常に `true` になる**（§5-4 の 6）。
   気づかないと **`early` が1件も積まれず、無修正採用率が永久に `null`** になります。
   **試験14 で見張ります。**
3. **`expires_at` を NULL にできる形にすると、放置提案が分母から消えます**（§3-2）。
   `NOT NULL DEFAULT` で DB 側から守ります。
4. **台詞の伏せを1か所でも忘れると全社に出ます**（§7-2）。A（伏せる）と B（degrade）の
   両方を入れます。
5. **`diffByKey` の第5引数を忘れると、見積の指標に混ざります**（`items[` になる）。**試験6 で見張ります。**

---

## 10. 検証手順

### 10-1. 機械で見るもの

```bash
npm run typecheck      # v4 対象3アプリ + server
npm run lint           # changelog / file-size(400行) / eslint など
npm run test           # shared の vitest（§8 の往復テストがここに入る）
```

⚠️ **`client-qsheet` は `typecheck` の既定に入っていません**（3アプリのみ）。
この段は `client-qsheet/src/lib/applyProposal.ts` を触るので、
**必ず `npm run typecheck:all` も回すこと**（CI は `typecheck:all` を使う）。

⚠️ **`npm run check:frozen`** — 制作資料は v4.0.0 では凍結アプリです。
この段は CSS を触らないので通るはずですが、`build:all` のあとに回して確かめます。

### 10-2. 検証 DB で手を動かすもの

```bash
npm run verify:up                  # 検証用 Postgres（ポート5433・本番とは完全分離）
npm run db:migrate -w server       # NNN_qsheet_ai.sql が流れること
```

| # | 確かめること | どう見るか |
| --- | --- | --- |
| 1 | migration が流れる | `SELECT name FROM _migrations ORDER BY name DESC LIMIT 3` |
| 2 | 番号が重なっていない | `ls server/src/shared/db/migrations \| sort -V \| tail -5` |
| 3 | ⭐ **往復（本命）** | 提案を1件手で INSERT → `POST /apply`（何も触らない）→ `POST /settle` → `SELECT field_path, correction_type FROM ai_corrections WHERE output_id = ?` が **`(全体)` / `none` の1行だけ** |
| 4 | プレビューでの書き換え | `apply` の body で1つ書き換える → `preview.rows[...].html` の `fix` が1行 |
| 5 | 期限切れ | `expires_at` を過去に UPDATE → バッチを `force` で流す → `state='discarded'` / `discard_reason='expired'` / `reject` が1行 |
| 6 | 2段締め | `broadcast_date` を昨日にして `settle` を2回流す → `late.` 付きが積まれ、**無加工の分は増えない** |
| 7 | 同時編集で行が消えない | 2タブで同じ台本を開き、片方で提案を取り込む → **もう片方が足した行が残っている**（`applyDataUpdate` の `prev` 規約） |
| 8 | 定時実行が二重に流れない | `runDueJobs()` を2回呼ぶ → 2回目は `scheduled_job_runs` の主キーで弾かれる |
| 9 | AI を1回も呼んでいない | バッチ実行中に `ai_usage` に1行も増えないこと |

### 10-3. 見た目

- **375px 幅**でプレビュー（取捨のチェックリスト）が破綻しないこと（CLAUDE.md の UI/UX ポリシー）
- ダイアログは `max-h-[90vh] overflow-y-auto`、タップ領域 44px

---

## 11. PR の切り方

**1本にすると 400 行制限（`check-file-size.mjs:27`）と レビュー量の両方で詰まります。3本に割ります。**

| PR | タイトル | 中身 | 依存 |
| --- | --- | --- | --- |
| **A** | `feat(qsheet): AI 提案の器（提案テーブルと索引）を作った` | migration 1本（§3-2）＋ 型 ＋ `ai/kinds.ts` ＋ 読み取り API（`GET /proposals`・`GET /proposals/:id`） | 02（`qsheet_schedules`） |
| **B** | `feat(qsheet): AI 提案の取り込みと、人が直した分の記録を入れた` | `comparable.ts` / `apply.core.ts` / `apply.service.ts` / `redact.ts` ＋ `POST /apply` `/discard` `/wrong` ＋ クライアントの `applyProposal.ts` ＋ **往復テストの前半**（試験2〜4・8〜9・11〜12） | A |
| **C** | `feat(qsheet): AI 提案の締め（2段）と期限切れを入れた` | `settle.core.ts` / `settle.service.ts` ＋ `scheduler.service.ts` の2本 ＋ `POST /settle` ＋ `PUT /corrections/:id` ＋ **往復テストの本命**（試験1・5〜7・10・13〜19）＋ `get_ai_feedback_digest` の degrade（§7-2 B） | B |

⚠️ **PR を出したら、確認を待たずにその場で `.claude/skills/pr-watch` で見張る**（CLAUDE.md）。
⚠️ **マージしたらレビュー指摘を `npm run reviews:debt` で棚卸しへ移す**（消えると存在ごと消える）。
⚠️ **作業 PR では版を上げない**（`package.json` / `CLAUDE.md` / `README.md` の3か所を触らない）。

### changelog.d の1文案

`docs/changelog.d/<枝の名前>.md` に**1文だけ**置きます（新しいファイルなので衝突しません）。

> **制作資料の AI 提案を「受け止める器」を先に作った**（生成機能はまだ出していない）。AI が出したものを台本（`data`）へ直接書かず提案テーブルに置き、人がプレビューで取捨選択して取り込んだときに**採番された id を記録**するようにした。差分はその id 集合だけを突き合わせるので、**人が後から足した行を AI の誤りとして数えない**。締めは2段（取り込みから7日＝AI 起因の修正／本番の翌日＝本番直前の動き）にし、**放置されたまま期限切れになった提案も「使われなかった」として数える**ようにした（数えないと、10回作って1回使っただけでも精度が非常に高く見える）。台詞の本文は差分に残さず `{長さ, 先頭20字, ハッシュ}` に落とし、全文は MCP から読めない場所にだけ置く。**AI は1回も呼んでいない。**

---

## 12. 未決・要確認

| # | 何が決まっていないか | 決まらないと何が起きるか | 出どころ |
| --- | --- | --- | --- |
| **1** | ⚠️ **台詞の差分を「本文のまま」記録してよいか**（README 確認7・04 §14-17）。既定は `{ len, head: 先頭20字, hash }` | 本文のままだと**無ゲートの `get_ai_feedback_digest` から台詞が全社で読めます**。`head` の20字にも顧客名が入りえます | README §4 高 #7 |
| **2** | **AI に埋めさせるのは `シナリオ` だけでよいか**（README 確認14） | 対象ブロック型が増えると `toComparableRow` の `compareFields` が変わります。**この段の器は `scenario` 前提**で作ります | README §4 中 14 |
| **3** | **月次 AI レビューの責任者を1人、名前で**（README 確認8） | 条件5 が「決めただけ」で終わり、`onair-current-state.md` の「残っていること#1」を繰り返します。**この段では ✕ のまま出します** | README §4 高 #8 |
| **4** | **実尺の記録を先に入れるか**（README 確認5） | 段1 を後回しにすると、この段の器はできても**条件3 が段9 まで `null` のまま**です | README §4 最優先 #5 |
| **5** | **締めのタイミング（2段）でよいか**（04 §14-18）。「この台本で本番に入る」ボタンを足すか | ボタンを足すなら `qsheet_documents.status` を `on_air` に上げる UI が要ります（**現在1つも無い**・`012_qsheet_schema.sql:19`） | 04 §14-5・§14-18 |
| **6** | **`timeout` の 30 日は妥当か** | 短すぎると当日の直しを取りこぼし、長すぎると通常の練り直しが混ざります。`broadcast_date` が空の台本がどれくらいあるかを**実 DB で数えてから**決めたい（README §8 #5。**本番へアクセスできず未確認**） | 04 §3-3 |
| **7** | **`rephrase` の閾値 0.6** | 04 §3-3 が置いた値で、**根拠のある数字ではありません**。`note` に `sim=` を機械的に残して後から引き直せるようにします | 04 §3-3 手順4 |
| **8** | **DB 込みの自動試験を作るか** | 現状サーバー側の試験が1本も無く、この段で作ると本題より大きくなります。§8 は純関数＋ソース見張りで代替し、**DB の往復は手で確かめます**（§10-2） | 本文書の判断 |

---

## 13. 設計書との食い違い（**実装を読んで見つけたもの**）

| # | 重大度 | 設計書の記述 | 実装 | どうするか |
| --- | :-: | --- | --- | --- |
| **1** | ⭐**高** | README §6 の採番表は `qsheet_cue_actuals`（実尺）を **`214_qsheet_ai.sql`（＝段7 の migration）** に入れている。一方 README §7 は**実尺を段1**（いちばん最初）に置いている | — | **矛盾。** 段1 で実尺が要るのに、その DDL が段7 のファイルにあると**段1 が着手できません**。→ **`NNN_qsheet_cue_actuals.sql` を段1 の別 migration に切り出す**（§3-1 の表）。この段の migration には入れない |
| **2** | ⭐**高** | README §6「現在の最大が 210 の前提」 | **実際の最大は `211`**（`211_drop_techsheet_schema.sql`）。さらに **197 / 205 が欠番、206 が2本** | 採番表を丸ごと **+1** で振り直す。**着手時に `ls \| sort -V \| tail -1` で必ず確かめる**。`migrate.ts:16-18` はファイル名順に流すだけで **CI は落ちません** |
| **3** | ⭐**高** | 04 §5-5「`scheduler.service.ts` に `job_key='ai_review_production_draft'` を足し、**毎月1日 03:20 JST**」 | **`scheduler.service.ts` に月次の仕組みが無い。** `Job` は `{ key, at: 'HH:MM' }` だけで、二重防止は `scheduled_job_runs(job_key, run_date)` の**日**単位（`:46-59` `:479` `:496-502`） | 月次は **`run` の中で `jstParts().date.slice(8) === '01'` を見る**しかない。「1行も新しい仕組みが要らない」は**正確ではありません**。段9 の設計に反映すること |
| **4** | ⭐**高** | 04 §12 は `shared/src/qsheetAi/normalize.ts` を**サーバーとクライアントの共通**として置いている。§2-5 も「`shared/tests/` に vitest を1本」 | **サーバーは `@gmo-onair/shared` を import していません。** `server/tsconfig.json` は `rootDir: "./src"`、paths 無し、`server/package.json` の依存にも無い | **サーバー側の純関数は `server/src/contexts/qsheet/ai/` に置く**（§8-2）。`shared/src/qsheetAi/types.ts` は**クライアント専用**とし、サーバーは同じ形を自前で持ってコメントで同期を約束する（`server/src/shared/constants/statuses.ts:1-8` と同じ作法）。**試験は `shared/tests/` から相対 import で両方を読む**（前例: `nextActionShort.test.ts:15`） |
| **5** | **中** | 04 §12「尺は必ず `shared/src/schedule/time.ts` の `fmtDur(sec)` / `parseDur(str)` を通す」 | **`shared/src/schedule/` は存在しません。** `parseDur` は `client-qsheet/src/lib/time.ts:8` にあり、`fmtDur` は `server/.../pdf.routes.ts:42` のローカル関数だけ。`normalizeDur`（`time.ts:26`）が `M:SS` 化の実体 | 02 が `shared/src/schedule/time.ts` を作る前提なら**02 の後**。作らないなら §4-4 のとおりサーバー側に `parseDurSec` を持ち、**試験12 で両者が同じ秒を返すことを固定** |
| **6** | **中** | 04 §3-2 の索引 `idx_qsheet_ai_prop_pending_settle` は `WHERE state='applied' AND settled_at IS NULL` の1本だけ | — | **2段目（`final`）を拾う索引が無い。** `settled_final_at IS NULL` の索引を足す（§3-2） |
| **7** | **中** | 04 §3-3 の手順6「`hasCorrections(outputId)` で二重計上を防ぐ」 | `hasCorrections` は `ai_corrections` に**1行でもあれば `true`**（例外時も `true`）（`ai-output.service.ts:104-115`） | **`preview.` の差分を積んだ提案では常に `true` になり、`early` が黙って積まれません。** → **`settled_at IS NULL` の条件付き UPDATE で1回に絞る**（§5-4 の 6） |
| **8** | **中** | 04 §3-3 は `early`(7日) と `final`(本番翌日) の**順序が逆転する場合を決めていない** | — | 本番が取り込みから7日以内だと `final` が先に来ます。**`early` → `final` の順に必ず2回積む**と決めました（§5-2）。決めないと実装者ごとに挙動が変わります |
| **9** | **中** | 04 §3-2 の `expires_at TIMESTAMPTZ`（NULL 可・「既定 14日」は本文だけ） | — | **NULL のまま作られた提案は期限バッチが永久に拾わず、digest の分母から丸ごと消えます**（F5 の再発）。→ **`NOT NULL DEFAULT (NOW() + INTERVAL '14 days')`**（§3-2） |
| **10** | **小** | 04 §5-3a は指標を **`ai_duration_mape` / `human_duration_mape` / `plan_drift_sec`** に作り直した | **04 §6-1 の `FeedbackDigest.outline` は古いまま**（`duration_mape` / `duration_bias_sec` の2本） | 段9 で digest を書くときに **§5-3a を正**とする。§6-1 のコードブロックは追随漏れ |
| **11** | **小** | 04 §2-5「**`emphasis` は第1版のスキーマから落とします**」 | **04 §11 の `ScriptLinesProposal` には `emphasis: string[]` が残っている** | 段8 で型を書くときは **§2-5 を正**（落とす）。`entries[0]` に置く場所が無い |
| **12** | **小** | 04 §3-3 手順4「消えた行 = `reject`／空→値 = `enrich`／値→別値 = `fix`／言い換え = `rephrase`」 | **`diffByKey` は `rephrase` を出しません**（`fix`/`reject`/`enrich` の3つだけ・`:187` `:196` `:203`） | `diffByKey` の後段で `html` の `fix` を類似度で `rephrase` に格上げする純関数を通す（§5-4 の 4）。**`diffByKey` 自体は変えない**（見積・タスク投入が使っている） |
| **13** | **小** | 04 §5-6 の 1「`kind` を `z.enum([...])` に変え」 | 既存は `z.string().optional()`（`aifeedback.tools.ts:37-46`） | **必須にしないこと**（`z.enum([...]).optional()`）。Git 管理外のメール取込スキルが最短1時間おきに叩いており、必須引数を1つ足すと**次の実行から全部落ちます** |
| **14** | **小** | 04 §0 の表「migration の現在の最大は `210`」 | `211` | #2 と同じ。04 §0 の表も直すべき |

