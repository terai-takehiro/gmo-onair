-- 機材に「貸出機材一覧」表示フラグを追加
-- is_rental_listed = true の機材のみ 貸出機材一覧・貸出管理 に表示される

ALTER TABLE equipment_items
  ADD COLUMN IF NOT EXISTS is_rental_listed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_equipment_items_rental_listed
  ON equipment_items(is_rental_listed)
  WHERE is_rental_listed = true;
