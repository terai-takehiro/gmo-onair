-- ブランクパネル・通線口の種別列追加
ALTER TABLE rack_blank_panels
  ADD COLUMN IF NOT EXISTS panel_type TEXT NOT NULL DEFAULT 'blank'
    CHECK (panel_type IN ('blank', 'cable'));
