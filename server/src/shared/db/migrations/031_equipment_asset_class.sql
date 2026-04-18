-- asset_class を固定資産/消耗品/リース/譲渡 の4択に統一
ALTER TABLE equipment_items
  DROP CONSTRAINT IF EXISTS equipment_items_asset_class_check;

UPDATE equipment_items SET asset_class = 'fixed_asset'
  WHERE asset_class NOT IN ('fixed_asset','consumable','leased','transferred');

ALTER TABLE equipment_items
  ADD CONSTRAINT equipment_items_asset_class_check
  CHECK (asset_class IN ('fixed_asset','consumable','leased','transferred'));
