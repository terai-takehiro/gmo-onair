-- ========================================================
-- 機材の親子関係（ケース/セットのグルーピング）
-- ========================================================

ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES equipment_items(id);

CREATE INDEX IF NOT EXISTS idx_equipment_items_parent ON equipment_items(parent_id);
