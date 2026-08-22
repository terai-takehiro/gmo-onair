-- 224: Excel 取込の履歴とスナップショット（段6・03-excel.md §9-4・§10）
--
-- 取込前後の `data`（qsheet_documents.data と同じ形）を全文で持つ。
-- 「取り込む前に戻す」をワンクリックでできるようにするため（今の CSV 取込は
-- スナップショットもゴミ箱退避も取らず、置き換えたら元に戻せない）。
--
-- ⚠️ サイズは実測前。08-recording-streaming の教訓（未測のまま作ると事故る）を踏まえ、
-- 保持件数は控えめ（適用済み10件・下見のみは別途クリーンアップ）から始める。運用しながら
-- `SELECT pg_column_size(data) FROM qsheet_documents ORDER BY 1 DESC LIMIT 10` を見て緩める。

CREATE TABLE IF NOT EXISTS qsheet_import_batches (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('merge', 'append')),
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('xlsx', 'csv')),
  file_name       TEXT NOT NULL DEFAULT '',
  file_size       INTEGER NOT NULL DEFAULT 0,
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_data     JSONB NOT NULL,
  after_data      JSONB,
  applied_at      TIMESTAMPTZ,
  undone_at       TIMESTAMPTZ,
  created_by      TEXT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qsheet_import_batches_doc
  ON qsheet_import_batches (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qsheet_import_batches_applied
  ON qsheet_import_batches (document_id, applied_at DESC) WHERE applied_at IS NOT NULL;

COMMENT ON TABLE  qsheet_import_batches            IS 'Excel/CSV 取込の下見・適用記録。before_data/after_data は data 列と同じ形の全文スナップショット（切り詰めない）';
COMMENT ON COLUMN qsheet_import_batches.before_data IS '取込適用直前の data。undo はこれをそのまま返す';
COMMENT ON COLUMN qsheet_import_batches.after_data  IS '適用後にクライアントが報告した data。下見のみ（未適用）なら NULL';
COMMENT ON COLUMN qsheet_import_batches.applied_at  IS 'NULL = 下見のみ（未適用）。適用は POST .../applied で記録する';
