-- 139: 問い合わせ→ネタ案件の昇格記録 + 音声サポート公開URLの無効化
--
-- 1) misc_inquiries に昇格の記録を足す (内覧会 v2.9.196 と同じ形)。
--    列を持たないと「案件にした」が分からず、同じ問い合わせから何度も案件が生まれる。
-- 2) qsheet_documents に配布URLの無効化を足す。
--    音声サポートの URL (/qsheet/audio/:docId) は**認証がない**ので、番組が終わったら
--    止めたい。既定は NULL = 有効なので既存の配布は壊れない (§5.1)。

ALTER TABLE misc_inquiries ADD COLUMN IF NOT EXISTS promoted_project_id TEXT REFERENCES projects(id);
ALTER TABLE misc_inquiries ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP;
ALTER TABLE misc_inquiries ADD COLUMN IF NOT EXISTS promoted_by TEXT;

CREATE INDEX IF NOT EXISTS idx_misc_inquiries_promoted
  ON misc_inquiries(promoted_project_id) WHERE promoted_project_id IS NOT NULL;

ALTER TABLE qsheet_documents ADD COLUMN IF NOT EXISTS audio_share_revoked_at TIMESTAMP;
ALTER TABLE qsheet_documents ADD COLUMN IF NOT EXISTS audio_share_revoked_by TEXT;
