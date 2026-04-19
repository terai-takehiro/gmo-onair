-- 引き出し種別追加
ALTER TABLE rack_blank_panels DROP CONSTRAINT IF EXISTS rack_blank_panels_panel_type_check;
ALTER TABLE rack_blank_panels
  ADD CONSTRAINT rack_blank_panels_panel_type_check
  CHECK (panel_type IN ('blank', 'cable', 'drawer'));
