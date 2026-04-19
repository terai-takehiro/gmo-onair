-- ============================================================
-- 045: DB整合性修正
--  1. equipment_branches / equipment_rack_types にソフトデリート追加
--  2. equipment_locations の branch_id / rack_type_id に FK制約追加
--  3. equipment_items.color_id FK を ON DELETE SET NULL に変更
--  4. fixed_asset_code に部分ユニークインデックス追加
-- ============================================================

-- 1. ソフトデリート列追加
ALTER TABLE equipment_branches
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE equipment_rack_types
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- 2. FK制約: equipment_locations.branch_id → equipment_branches
--    既存データに孤立行があっても失敗しないよう NOT VALID で追加
ALTER TABLE equipment_locations
  DROP CONSTRAINT IF EXISTS fk_location_branch;
ALTER TABLE equipment_locations
  ADD CONSTRAINT fk_location_branch
    FOREIGN KEY (branch_id) REFERENCES equipment_branches(id) ON DELETE SET NULL
    NOT VALID;

-- 3. FK制約: equipment_locations.rack_type_id → equipment_rack_types
ALTER TABLE equipment_locations
  DROP CONSTRAINT IF EXISTS fk_location_rack_type;
ALTER TABLE equipment_locations
  ADD CONSTRAINT fk_location_rack_type
    FOREIGN KEY (rack_type_id) REFERENCES equipment_rack_types(id) ON DELETE SET NULL
    NOT VALID;

-- 4. color_id FK を ON DELETE SET NULL に変更
ALTER TABLE equipment_items
  DROP CONSTRAINT IF EXISTS equipment_items_color_id_fkey;
ALTER TABLE equipment_items
  ADD CONSTRAINT equipment_items_color_id_fkey
    FOREIGN KEY (color_id) REFERENCES equipment_colors(id) ON DELETE SET NULL
    NOT VALID;

-- 5. fixed_asset_code 部分ユニークインデックス
--    重複が存在する場合は古い方を NULL にしてからインデックスを作成
UPDATE equipment_items ei
SET fixed_asset_code = NULL
WHERE fixed_asset_code IS NOT NULL
  AND fixed_asset_code != ''
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT ON (fixed_asset_code) id
    FROM equipment_items
    WHERE fixed_asset_code IS NOT NULL
      AND fixed_asset_code != ''
      AND deleted_at IS NULL
    ORDER BY fixed_asset_code, created_at ASC
  );

DROP INDEX IF EXISTS uq_fixed_asset_code;
CREATE UNIQUE INDEX uq_fixed_asset_code
  ON equipment_items(fixed_asset_code)
  WHERE fixed_asset_code IS NOT NULL
    AND fixed_asset_code != ''
    AND deleted_at IS NULL;
