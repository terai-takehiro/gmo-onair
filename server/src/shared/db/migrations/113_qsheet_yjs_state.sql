-- Qシート 同時共同編集 (Phase 2.2): Y.Doc の状態を永続化するテーブル
-- doc_id ごとに Yjs の state update (バイナリ) を 1 行保持する。
-- 既存 qsheet_documents.data (JSONB) はそのまま残し、collab 有効時のみこちらを正とする
-- (フラグでカットオーバー。Phase 4 まで JSONB はスナップショット/バックアップとして併存)。
CREATE TABLE IF NOT EXISTS qsheet_doc_yjs (
  doc_id     TEXT PRIMARY KEY REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  state      BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
