-- 022: Interactive schema fixes — missing columns and constraints
-- Fixes columns referenced in routes but missing from original migrations

-- interactive_events に youtube_url, banner_url, admin_comment, survey_url カラム追加
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS survey_url TEXT;

-- interactive_stamps に image_url カラム追加
ALTER TABLE interactive_stamps ADD COLUMN IF NOT EXISTS image_url TEXT;

-- interactive_stamp_counts の UPSERT用ユニーク制約
-- (stamp_id + bucket_at で1レコードに集約)
CREATE UNIQUE INDEX IF NOT EXISTS interactive_stamp_counts_bucket_unique
  ON interactive_stamp_counts(stamp_id, bucket_at);
