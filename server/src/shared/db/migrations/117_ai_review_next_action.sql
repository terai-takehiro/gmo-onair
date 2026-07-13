-- ============================================================
-- 117: AI メール処理に最適化した UIUX 第1弾 (v2.9.178)
-- ①AI起票案件のレビュー状態: projects.ai_reviewed_at / ai_reviewed_by
--   (created_by='mcp-claude' の案件を人間が内容確認したら記録)
-- ②次回アクションの完了状態: activity_logs.next_action_done_at
--   (営業ダッシュボードから「完了」でセット。NULL = 未対応)
-- ③mcp_audit_log の created_id 逆引き用 expression index
--   (活動ログ/案件の AI 由来判定 lateral join を軽くする)
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_reviewed_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_reviewed_by TEXT;

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS next_action_done_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_mcp_audit_created_id
  ON mcp_audit_log ((result_summary->>'created_id'));
