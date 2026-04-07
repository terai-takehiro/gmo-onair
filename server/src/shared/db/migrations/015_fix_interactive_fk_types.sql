-- 015: Fix interactive_events FK type mismatch (UUID → TEXT)
-- projects.id and episodes.id are TEXT, but interactive_events referenced them as UUID

-- Drop existing FK constraints and re-create columns as TEXT
ALTER TABLE interactive_events
  ALTER COLUMN project_id TYPE TEXT USING project_id::text,
  ALTER COLUMN episode_id TYPE TEXT USING episode_id::text,
  ALTER COLUMN created_by TYPE TEXT USING created_by::text,
  ALTER COLUMN updated_by TYPE TEXT USING updated_by::text;

-- Also fix the primary key and other UUID columns to TEXT for consistency
ALTER TABLE interactive_events
  ALTER COLUMN id TYPE TEXT USING id::text;

ALTER TABLE interactive_stamps
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN event_id TYPE TEXT USING event_id::text;

ALTER TABLE interactive_stamp_counts
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN stamp_id TYPE TEXT USING stamp_id::text,
  ALTER COLUMN event_id TYPE TEXT USING event_id::text;

ALTER TABLE interactive_sessions
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN event_id TYPE TEXT USING event_id::text;

ALTER TABLE interactive_overlay_templates
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN created_by TYPE TEXT USING created_by::text;
