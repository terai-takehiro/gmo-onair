-- デフォルト種別マスタ（なければ挿入）
INSERT INTO equipment_rack_types (id, name, sort_order) VALUES
  ('rt-rack',     'ラック',   0),
  ('rt-ope-desk', 'オペ卓',   1),
  ('rt-av-panel', 'AV盤',     2)
ON CONFLICT (id) DO NOTHING;

-- 既存 is_rack=true のロケーションをラック種別に紐づけ
UPDATE equipment_locations
  SET rack_type_id = 'rt-rack'
  WHERE is_rack = TRUE AND rack_type_id IS NULL;
