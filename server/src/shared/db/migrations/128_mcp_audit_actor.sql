-- v2.9.197: mcp_audit_log に実行 actor を記録 (AI 活動フィード / 監査の帰属強化)
-- OAuth 経由 = 実 ONAiR ユーザー id / 静的キー経由 = 'mcp-claude'。
-- 既存行は NULL のまま (当時の actor は不明のため埋めない)。

ALTER TABLE mcp_audit_log ADD COLUMN IF NOT EXISTS actor_id TEXT;
