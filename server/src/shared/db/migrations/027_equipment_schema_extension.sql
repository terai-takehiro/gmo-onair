-- ============================================================
-- 027: 機材管理スキーマ拡張
--   - 機材メーカーマスタ追加
--   - 拠社/固定資産コード/償却年数/機材セクション/種別コード/購入年月/保証期間 等の項目追加
--   - 機材ID形式 Y-V-00001 (location-type-連番) 用のシーケンステーブル
-- ============================================================

-- ============================================================
-- 1. メーカーマスタ
-- ============================================================
CREATE TABLE IF NOT EXISTS equipment_manufacturers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  notes      TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- ============================================================
-- 2. 機材アイテム拡張
-- ============================================================
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS branch_code TEXT;
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS fixed_asset_code TEXT;
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS depreciation_years INTEGER;
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS equipment_section TEXT;
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS equipment_type_code TEXT;
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS location_code TEXT;
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS manufacturer_id TEXT REFERENCES equipment_manufacturers(id);
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS purchased_at DATE;
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS warranty_years INTEGER;

-- CHECK制約 (既存データは無効値が入っている可能性があるのでaddは慎重に)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'equipment_items_section_check') THEN
    -- 既存のNULLや旧データはOK、新規に入る値だけCHECKしたい場合は下記を使う
    ALTER TABLE equipment_items ADD CONSTRAINT equipment_items_section_check
      CHECK (equipment_section IS NULL OR equipment_section IN ('system','general','facility'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'equipment_items_typecode_check') THEN
    ALTER TABLE equipment_items ADD CONSTRAINT equipment_items_typecode_check
      CHECK (equipment_type_code IS NULL OR equipment_type_code IN ('V','C','A','IC','NW','L','XR','E'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'equipment_items_loccode_check') THEN
    ALTER TABLE equipment_items ADD CONSTRAINT equipment_items_loccode_check
      CHECK (location_code IS NULL OR location_code IN ('Y','S'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_equipment_items_location_type
  ON equipment_items(location_code, equipment_type_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_items_section
  ON equipment_items(equipment_section) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_items_manufacturer
  ON equipment_items(manufacturer_id) WHERE deleted_at IS NULL;

-- ============================================================
-- 3. 機材ID採番シーケンス (Y-V等のprefix別)
-- ============================================================
CREATE TABLE IF NOT EXISTS equipment_id_sequences (
  prefix  TEXT PRIMARY KEY,        -- 'Y-V', 'Y-C', 'S-V' 等
  counter INTEGER NOT NULL DEFAULT 0
);
