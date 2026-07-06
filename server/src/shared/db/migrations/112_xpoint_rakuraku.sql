-- 精算 PDF 取込: 楽楽精算フォーマット対応
-- 1 伝票から複数の登録単位 (税区分/GLS ごと) が生まれるため、登録レコードを配列で保持する。
ALTER TABLE xpoint_import_files ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'xpoint';
ALTER TABLE xpoint_import_files ADD COLUMN IF NOT EXISTS registered_records JSONB NOT NULL DEFAULT '[]'::jsonb;
