-- X-Point 申請 PDF 取込の管理テーブル
-- Box フォルダ内の X-Point (OBIC 経費申請書) PDF を解析し、人間のレビュー・修正を経て
-- 仕入 (purchases) / 販管費 (sga_expenses) に登録するまでの状態を管理する。
CREATE TABLE IF NOT EXISTS xpoint_import_files (
  id SERIAL PRIMARY KEY,
  box_file_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  box_modified_at TEXT,
  -- PDF 本文から抽出した X-Point 番号 (例 177619)。ファイル名とは一致しないことがあるため本文優先。
  xp_number TEXT,
  kind TEXT NOT NULL DEFAULT 'unknown' CHECK (kind IN ('purchase', 'sga', 'unknown')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'parsed', 'registered', 'skipped', 'error')),
  -- 解析結果 (抽出フィールド + マスタ照合 + 警告)。レビュー UI がこれを表示する。
  parsed_data JSONB,
  error_message TEXT,
  -- 登録先 ('purchases' | 'sga_expenses') と登録レコード ID
  registered_table TEXT,
  registered_id TEXT,
  registered_by TEXT,
  registered_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xpoint_files_status ON xpoint_import_files(status);
CREATE INDEX IF NOT EXISTS idx_xpoint_files_xp_number ON xpoint_import_files(xp_number);
