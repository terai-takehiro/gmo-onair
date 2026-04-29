-- ========================================================
-- 機材管理: ケーブル管理 + コネクタ管理
-- ========================================================
-- 機材一覧 (equipment_items) とは別 DB として管理。
-- 共通の equipment_locations / equipment_manufacturers を引用する。
--
-- カテゴリ (kind):
--   video    映像
--   audio    音声
--   network  NW
--   lighting 照明
--   power    電源
--   other    その他

-- ── ケーブル管理 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_cables (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('video','audio','network','lighting','power','other')),
  location_id     TEXT REFERENCES equipment_locations(id),
  name            TEXT NOT NULL,
  manufacturer_id TEXT REFERENCES equipment_manufacturers(id),
  model_number    TEXT,
  length_m        NUMERIC(10, 2),
  color           TEXT,
  quantity        INTEGER NOT NULL DEFAULT 0,
  storage_method  TEXT,
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_cables_kind        ON equipment_cables(kind)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_cables_location    ON equipment_cables(location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_cables_manufacturer ON equipment_cables(manufacturer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_cables_name        ON equipment_cables(name)        WHERE deleted_at IS NULL;

-- ── コネクタ管理 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_connectors (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('video','audio','network','lighting','power','other')),
  location_id     TEXT REFERENCES equipment_locations(id),
  name            TEXT NOT NULL,
  manufacturer_id TEXT REFERENCES equipment_manufacturers(id),
  model_number    TEXT,
  quantity        INTEGER NOT NULL DEFAULT 0,
  storage_method  TEXT,
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_connectors_kind        ON equipment_connectors(kind)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_connectors_location    ON equipment_connectors(location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_connectors_manufacturer ON equipment_connectors(manufacturer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_connectors_name        ON equipment_connectors(name)        WHERE deleted_at IS NULL;
