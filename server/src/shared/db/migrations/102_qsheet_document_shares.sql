-- Qシート ドキュメント共有 (作成者 + 共有ユーザーのみ閲覧可、管理者は全件)
-- 既定では作成者本人 (created_by) と管理者しか見られない。
-- このテーブルに行を追加したユーザーは対象ドキュメントを閲覧・(編集権限があれば)編集できる。
CREATE TABLE IF NOT EXISTS qsheet_document_shares (
  document_id TEXT NOT NULL REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  TEXT REFERENCES users(id),
  PRIMARY KEY (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_doc_shares_user ON qsheet_document_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_qsheet_doc_shares_doc ON qsheet_document_shares(document_id);
