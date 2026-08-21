-- ============================================================
-- 222: 制作資料 v4 — AI の提案・取り込み・締め（段7 / 04-a）
--
-- **生成機能はまだ載せない。** この migration が作るのは
-- 「AI が出したものを受け止めて、人が直した分だけを正しく数える器」。
--
-- 依存: qsheet_schedules / qsheet_documents（既に本番にある）。
-- 型は TIMESTAMPTZ に揃える（既存 qsheet_documents は TIMESTAMP + deleted_at TEXT
-- という不整合を抱えているが、新しい表で踏襲する理由がない。02/04 と同じ判断）。
--
-- 実装設計: docs/design/v4/qsheet-v4-coding/impl/07-ai-proposals-impl.md §3
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

-- 2段目（final）が拾う対象。1段目とは別の索引を持つ（無いと毎回 seq scan になる）。
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
