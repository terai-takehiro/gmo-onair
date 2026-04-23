-- 機材セル表示設定をサーバーサイドで保持（デバイス間共有のため localStorage から移行）
ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS display_config JSONB;
