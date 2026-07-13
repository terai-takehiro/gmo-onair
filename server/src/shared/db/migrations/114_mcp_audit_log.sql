-- MCP 書き込みツールの監査ログ (v2.9.173)
-- 共用 APIキー運用のため、AI 経由の書き込みを「どのツールが・何を・誰の指示で」記録する。
-- INSERT は fire-and-forget (失敗してもツール自体は成功させる)。参照系ツールは記録しない。
CREATE TABLE IF NOT EXISTS mcp_audit_log (
  id             TEXT PRIMARY KEY,          -- uuidv4 (アプリ採番)
  tool_name      TEXT NOT NULL,
  args           JSONB,                     -- ツール引数 (長大文字列は 1000 文字で切詰め)
  result_summary JSONB,                     -- 例 {"created_id": "...", "gls_number": "..."}
  requested_by   TEXT,                      -- AI が聞き取った指示者名 (任意・自由記述)
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_created_at ON mcp_audit_log(created_at);
