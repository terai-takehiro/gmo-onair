-- 025: Add custom messages for waiting/ended screens
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS waiting_message TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS ended_message TEXT;
