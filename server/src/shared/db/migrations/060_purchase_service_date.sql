-- 仕入: 役務提供完了日フィールド追加
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS service_completed_date DATE;
