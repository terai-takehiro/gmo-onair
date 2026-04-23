-- 拠点・種別マスタテーブル
CREATE TABLE IF NOT EXISTS equipment_branches (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_rack_types (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- equipment_locations に拠点ID・種別ID列を追加 (TEXT, 外部キー制約なし)
ALTER TABLE equipment_locations
  ADD COLUMN IF NOT EXISTS branch_id    TEXT,
  ADD COLUMN IF NOT EXISTS rack_type_id TEXT;

-- 既存 is_rack=true のデータは migration 041 で移行
