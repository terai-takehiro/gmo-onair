-- 015: Fix interactive_events FK type mismatch (UUID → TEXT)
-- This migration is now a no-op for fresh databases (013 already uses TEXT).
-- Kept for existing databases that ran the old 013 with UUID columns.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'interactive_events' AND column_name = 'project_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE interactive_events
      ALTER COLUMN project_id TYPE TEXT USING project_id::text,
      ALTER COLUMN episode_id TYPE TEXT USING episode_id::text,
      ALTER COLUMN created_by TYPE TEXT USING created_by::text,
      ALTER COLUMN updated_by TYPE TEXT USING updated_by::text,
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
  END IF;
END $$;
