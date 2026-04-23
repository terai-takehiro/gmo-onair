-- 024: Add rehearsal status to interactive_events
ALTER TABLE interactive_events DROP CONSTRAINT IF EXISTS interactive_events_status_check;
ALTER TABLE interactive_events ADD CONSTRAINT interactive_events_status_check
  CHECK (status IN ('draft', 'rehearsal', 'live', 'ended', 'archived'));
