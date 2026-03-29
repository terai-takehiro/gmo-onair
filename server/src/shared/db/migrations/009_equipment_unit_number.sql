-- ========================================================
-- 設備・機材: No.管理カラム追加
-- ========================================================

ALTER TABLE equipment_items ADD COLUMN unit_number INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_items_unit_number ON equipment_items(name, unit_number);
