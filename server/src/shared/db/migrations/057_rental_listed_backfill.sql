-- equipment_section = 'rental' の既存機材に is_rental_listed フラグを付与
-- 設備機材 (equipment_section = 'equipment' or NULL) はそのまま false

UPDATE equipment_items
  SET is_rental_listed = true
  WHERE equipment_section = 'rental'
    AND deleted_at IS NULL;
