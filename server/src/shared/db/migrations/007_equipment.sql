-- ========================================================
-- 設備・機材管理システム
-- ========================================================

-- カテゴリ・分類
CREATE TABLE IF NOT EXISTS equipment_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'both' CHECK(item_type IN ('facility', 'rental', 'both')),
  parent_id TEXT REFERENCES equipment_categories(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 機材マスター
CREATE TABLE IF NOT EXISTS equipment_items (
  id TEXT PRIMARY KEY,
  eq_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES equipment_categories(id),
  item_type TEXT NOT NULL CHECK(item_type IN ('facility', 'rental')),

  -- 基本情報
  manufacturer TEXT,
  model_number TEXT,
  serial_number TEXT,
  description TEXT,
  image_url TEXT,

  -- 資産管理
  asset_number TEXT,
  acquisition_date TEXT,
  acquisition_cost INTEGER,
  depreciation_method TEXT CHECK(depreciation_method IN ('straight_line', 'declining', 'none')),
  useful_life INTEGER,
  book_value INTEGER,
  asset_class TEXT NOT NULL DEFAULT 'fixed_asset' CHECK(asset_class IN ('fixed_asset', 'consumable', 'low_value')),

  -- 状態管理
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'in_repair', 'retired', 'disposed', 'lost')),
  condition TEXT NOT NULL DEFAULT 'good' CHECK(condition IN ('excellent', 'good', 'fair', 'poor')),
  location_id TEXT,
  location_detail TEXT,
  notes TEXT,

  -- 貸出系
  is_lendable INTEGER NOT NULL DEFAULT 0,
  lending_rules TEXT,

  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- EQコード用シーケンス
INSERT OR IGNORE INTO sequences (seq_name, prefix, year_month, counter)
VALUES ('eq_code', 'EQ', '000000', 0);

-- 棚卸し
CREATE TABLE IF NOT EXISTS inventory_checks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  check_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'in_progress', 'completed')),
  checked_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_check_items (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES inventory_checks(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES equipment_items(id),
  expected_location TEXT,
  actual_location TEXT,
  found INTEGER NOT NULL DEFAULT 0 CHECK(found IN (0, 1, 2)),
  condition TEXT,
  note TEXT,
  checked_at TEXT
);

-- 故障・修理・メンテナンス
CREATE TABLE IF NOT EXISTS maintenance_records (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment_items(id),
  record_type TEXT NOT NULL CHECK(record_type IN ('breakdown', 'repair', 'maintenance', 'inspection')),
  title TEXT NOT NULL,
  description TEXT,
  reported_by TEXT,
  reported_at TEXT NOT NULL DEFAULT (datetime('now')),

  assigned_to TEXT,
  vendor_name TEXT,
  repair_cost INTEGER,
  started_at TEXT,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'reported' CHECK(status IN ('reported', 'in_progress', 'completed', 'cancelled')),
  result TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 貸出管理
CREATE TABLE IF NOT EXISTS equipment_lendings (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment_items(id),

  project_id TEXT REFERENCES projects(id),
  borrower_name TEXT NOT NULL,
  purpose TEXT,

  lent_at TEXT NOT NULL,
  due_date TEXT,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'lent' CHECK(status IN ('lent', 'returned', 'overdue', 'lost')),

  condition_out TEXT,
  condition_in TEXT,
  notes TEXT,

  lent_by TEXT,
  returned_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 付属品・セット管理
CREATE TABLE IF NOT EXISTS equipment_accessories (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES equipment_items(id),
  child_id TEXT NOT NULL REFERENCES equipment_items(id),
  note TEXT,
  UNIQUE(parent_id, child_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_equipment_items_eq_code ON equipment_items(eq_code);
CREATE INDEX IF NOT EXISTS idx_equipment_items_category ON equipment_items(category_id);
CREATE INDEX IF NOT EXISTS idx_equipment_items_status ON equipment_items(status);
CREATE INDEX IF NOT EXISTS idx_equipment_items_item_type ON equipment_items(item_type);
CREATE INDEX IF NOT EXISTS idx_equipment_lendings_equipment ON equipment_lendings(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_lendings_project ON equipment_lendings(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_lendings_status ON equipment_lendings(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_equipment ON maintenance_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_status ON maintenance_records(status);
CREATE INDEX IF NOT EXISTS idx_inventory_check_items_check ON inventory_check_items(check_id);
