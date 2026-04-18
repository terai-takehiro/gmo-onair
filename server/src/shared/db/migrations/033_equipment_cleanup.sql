-- ============================================================
-- 033: 機材管理の不要カラム/テーブルを削除
--   - 新スキーマ (equipment_type_code + equipment_section) に完全移行
--   - 旧フィールド・旧カテゴリマスタ・旧accessoriesテーブルを撤去
-- ============================================================

-- 1. 依存インデックスを削除
DROP INDEX IF EXISTS idx_equipment_items_item_type;
DROP INDEX IF EXISTS idx_equipment_items_category;

-- 2. equipment_items の不要カラムを削除
ALTER TABLE equipment_items DROP COLUMN IF EXISTS acquisition_cost;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS acquisition_date;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS asset_number;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS depreciation_method;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS useful_life;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS book_value;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS image_url;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS description;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS is_lendable;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS lending_rules;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS item_type;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS category_id;
ALTER TABLE equipment_items DROP COLUMN IF EXISTS manufacturer;  -- TEXT field, superseded by manufacturer_id FK

-- 3. 不要テーブルを削除
DROP TABLE IF EXISTS equipment_accessories CASCADE;
DROP TABLE IF EXISTS equipment_categories CASCADE;
