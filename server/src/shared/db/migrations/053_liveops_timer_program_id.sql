-- Migration 053: add program_id to liveops_timers
-- Timers are now scoped to a program (session), not just a project.
-- This allows standalone programs (no project) to have their own timers.

ALTER TABLE liveops_timers
  ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES liveops_programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_liveops_timers_program_id ON liveops_timers(program_id);

-- Link existing timers to their program via shared project_id (first program per project)
WITH first_programs AS (
  SELECT DISTINCT ON (project_id) id, project_id
  FROM liveops_programs
  WHERE project_id IS NOT NULL AND deleted_at IS NULL
  ORDER BY project_id, created_at ASC
)
UPDATE liveops_timers t
SET program_id = fp.id
FROM first_programs fp
WHERE t.project_id = fp.project_id
  AND t.program_id IS NULL
  AND t.deleted_at IS NULL;
