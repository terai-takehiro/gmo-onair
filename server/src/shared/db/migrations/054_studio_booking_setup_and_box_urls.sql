-- ============================================================
-- 054: 設営/準備 予約種別追加 + 案件Box URL フィールド追加
-- ============================================================

-- 1. booking_type に setup (設営/準備) を追加
ALTER TABLE studio_bookings DROP CONSTRAINT IF EXISTS studio_bookings_booking_type_check;
ALTER TABLE studio_bookings ADD CONSTRAINT studio_bookings_booking_type_check
  CHECK (booking_type IN (
    'performance', 'rehearsal', 'hold', 'tour',
    'consultation', 'maintenance', 'internal', 'setup', 'other'
  )) NOT VALID;

-- 2. 案件にBOXリンクフィールドを追加
ALTER TABLE projects ADD COLUMN IF NOT EXISTS box_url_internal TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS box_url_external TEXT;
