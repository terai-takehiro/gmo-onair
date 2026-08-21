-- ============================================================
-- 223: 制作資料 v4 — MCP 対応（段10 / 05-mcp.md §8）
--
-- 新規テーブルは作らない。04/段7 の qsheet_ai_proposals（migration 222）に相乗りし、
-- MCP 由来を見分ける・冪等にするための列だけを ALTER で足す。
--
-- ⚠️ 番号は impl/README.md §3 の予定表では 219 だったが、実装時点の最大は
--    222_qsheet_ai.sql（段7）だったため 223 を採る（README §3 の指示どおり
--    「PR を出す直前に必ず再実測」した結果）。
--
-- 実装設計: docs/design/v4/qsheet-v4-coding/05-mcp.md §8
-- ============================================================

-- ▼ MCP 由来の提案を見分けるための3列。
--   source / discard_reason / expires_at は 222 で既に qsheet_ai_proposals 本体に
--   入っている（README §8 のとおり、04 側の DDL 本体へ移動済み）ので、
--   ここに残すのは MCP 固有の3列だけ。
ALTER TABLE qsheet_ai_proposals
  -- AI が聞き取った指示者名（mcp_audit_log.requested_by と同じ意味）
  ADD COLUMN IF NOT EXISTS requested_by TEXT,
  -- 生成前に get_ai_feedback_digest を読んだか（読ませるための可視化。05-mcp.md §10-2）
  ADD COLUMN IF NOT EXISTS read_feedback_digest BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 同じ意図で propose_qsheet_draft を二度呼んでも1本しか作らない
-- （副作用の前に既存チェックして返す。migration 126 と同じ形）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_ai_proposals_idem
  ON qsheet_ai_proposals (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- MCP 由来をまとめて数える・締めバッチが拾うときに使う
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_proposals_source
  ON qsheet_ai_proposals (source, kind, created_at DESC);

-- ▼ create_qsheet の冪等キー（migration 126 と同じ形。qsheet_documents.deleted_at は TEXT 型）
ALTER TABLE qsheet_documents ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_documents_idem
  ON qsheet_documents (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
