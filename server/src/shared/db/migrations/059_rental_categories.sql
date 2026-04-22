-- 059: 貸出機材ラベル分類 + 貸出表示名
CREATE TABLE IF NOT EXISTS equipment_rental_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE equipment_items
  ADD COLUMN IF NOT EXISTS rental_category_id TEXT REFERENCES equipment_rental_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rental_display_name TEXT;
