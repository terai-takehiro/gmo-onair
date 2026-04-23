-- eq_code の UNIQUE 制約を削除済みレコードを除外した部分インデックスに変更
-- ソフトデリート済みの eq_code は再利用可能にする

ALTER TABLE equipment_items DROP CONSTRAINT IF EXISTS equipment_items_eq_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_items_eq_code_active
  ON equipment_items(eq_code)
  WHERE deleted_at IS NULL;
