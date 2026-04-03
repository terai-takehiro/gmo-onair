-- ========================================================
-- 設備・機材: 設置/保管場所マスター
-- ========================================================

CREATE TABLE IF NOT EXISTS equipment_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  building TEXT,
  floor TEXT,
  area TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (NOW()),
  updated_at TEXT NOT NULL DEFAULT (NOW()),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_equipment_locations_name ON equipment_locations(name);
