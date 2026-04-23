-- 色マスタ
CREATE TABLE IF NOT EXISTS equipment_colors (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color_hex   TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

-- 設置場所のラック属性
ALTER TABLE equipment_locations
  ADD COLUMN IF NOT EXISTS is_rack         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rack_units      INTEGER,
  ADD COLUMN IF NOT EXISTS rack_sort_order INTEGER NOT NULL DEFAULT 0;

-- 機材のラック位置・色
ALTER TABLE equipment_items
  ADD COLUMN IF NOT EXISTS rack_position INTEGER,
  ADD COLUMN IF NOT EXISTS rack_height   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rack_slot     TEXT    NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS rack_side     TEXT    NOT NULL DEFAULT 'front',
  ADD COLUMN IF NOT EXISTS color_id      TEXT REFERENCES equipment_colors(id);

ALTER TABLE equipment_items DROP CONSTRAINT IF EXISTS equipment_items_rack_slot_check;
ALTER TABLE equipment_items ADD CONSTRAINT equipment_items_rack_slot_check
  CHECK (rack_slot IN ('full','left-1_2','right-1_2','left-1_3','mid-1_3','right-1_3'));

ALTER TABLE equipment_items DROP CONSTRAINT IF EXISTS equipment_items_rack_side_check;
ALTER TABLE equipment_items ADD CONSTRAINT equipment_items_rack_side_check
  CHECK (rack_side IN ('front','back'));

CREATE INDEX IF NOT EXISTS idx_equipment_items_rack
  ON equipment_items(location_id, rack_side, rack_position)
  WHERE rack_position IS NOT NULL AND deleted_at IS NULL;
