-- 141: 見積・請求の「原本」(PDF / 画像) を持てるようにする
--
-- いまの finance_docs は **AI が読み取ったテキストだけ**を持っていて、PDF の実体を
-- 指す列が1つも無い。つまり承認画面は「原本を見ずに金額を承認する」画面だった。
--
-- 実体は **Box に置く** (サーバーのディスクに置くと再デプロイで消える。
-- リアルタイムCG の画像で実際に起きた事故 = v2.9.50 と同じ形)。
-- ここに持つのは Box のファイル ID と、画面に出すためのメタだけ。

ALTER TABLE finance_docs ADD COLUMN IF NOT EXISTS box_file_id TEXT;
ALTER TABLE finance_docs ADD COLUMN IF NOT EXISTS original_name TEXT;
-- pdf = 画面内にそのまま表示できる / image = 写真で回ってきた請求書
ALTER TABLE finance_docs ADD COLUMN IF NOT EXISTS original_kind TEXT
  CHECK (original_kind IS NULL OR original_kind IN ('pdf', 'image'));
ALTER TABLE finance_docs ADD COLUMN IF NOT EXISTS original_size INTEGER;
ALTER TABLE finance_docs ADD COLUMN IF NOT EXISTS original_uploaded_at TIMESTAMP;
ALTER TABLE finance_docs ADD COLUMN IF NOT EXISTS original_uploaded_by TEXT;

CREATE INDEX IF NOT EXISTS idx_finance_docs_has_original
  ON finance_docs(status) WHERE box_file_id IS NOT NULL AND deleted_at IS NULL;
