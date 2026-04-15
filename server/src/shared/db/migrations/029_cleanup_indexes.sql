-- ============================================================
-- 029: 機材テーブル旧カラム整理 + deleted_at インデックス追加
-- ============================================================

-- 旧カラムのデータを新カラムに移行 (NULLの場合のみ)
UPDATE equipment_items SET purchased_at = acquisition_date::date
  WHERE purchased_at IS NULL AND acquisition_date IS NOT NULL;
UPDATE equipment_items SET depreciation_years = useful_life
  WHERE depreciation_years IS NULL AND useful_life IS NOT NULL;

-- 主要テーブルの deleted_at 複合インデックス (ソフトデリートのパフォーマンス)
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_deleted ON customers(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_deleted ON vendors(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_deleted ON revenues(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_deleted ON purchases(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_items_deleted ON equipment_items(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_studio_bookings_deleted ON studio_bookings(deleted_at) WHERE deleted_at IS NULL;
