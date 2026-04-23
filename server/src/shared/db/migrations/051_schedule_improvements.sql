-- ============================================================
-- 051: スタジオ予約/案件まわりの UX 改善
--
-- 1. studio_bookings に status (confirmed/tentative) 追加
-- 2. booking_type に hold (仮押さえ) / consultation (相談) を追加
--    既存 'project' 値は 'performance' に統一
-- 3. projects に customer_type (internal/external) 追加
-- ============================================================

-- 1. 確定/未確定ステータス
ALTER TABLE studio_bookings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'tentative';

ALTER TABLE studio_bookings DROP CONSTRAINT IF EXISTS studio_bookings_status_check;
ALTER TABLE studio_bookings ADD CONSTRAINT studio_bookings_status_check
  CHECK (status IN ('confirmed', 'tentative')) NOT VALID;

-- 2. 予約種別の再整理
-- CHECK 制約を先に DROP してから UPDATE (旧制約に 'performance' が含まれない場合の違反を防ぐ)
ALTER TABLE studio_bookings DROP CONSTRAINT IF EXISTS studio_bookings_booking_type_check;

-- 既存データ: project → performance にマージ
UPDATE studio_bookings SET booking_type = 'performance' WHERE booking_type = 'project';

-- 新しい CHECK 制約を追加
ALTER TABLE studio_bookings ADD CONSTRAINT studio_bookings_booking_type_check
  CHECK (booking_type IN (
    'performance', 'rehearsal', 'hold', 'tour',
    'consultation', 'maintenance', 'internal', 'other'
  )) NOT VALID;

-- 3. 案件のグループ内/外 区分
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'external';

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_customer_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_customer_type_check
  CHECK (customer_type IN ('internal', 'external')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_projects_customer_type
  ON projects(customer_type) WHERE deleted_at IS NULL;
