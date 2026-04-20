-- ============================================================
-- Migration 052: 計時LIVE (LiveOps) schema
-- YouTube/Jstream viewer counter + countdown timer management
-- NOTE: users.id and projects.id are TEXT type in this DB
-- ============================================================

-- Per-user API key settings (API keys stored AES-256-GCM encrypted)
CREATE TABLE IF NOT EXISTS liveops_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  youtube_api_key_enc TEXT,
  jstream_token_enc TEXT,
  polling_interval_sec INT NOT NULL DEFAULT 10,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Program presets (viewer counter programs)
CREATE TABLE IF NOT EXISTS liveops_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  youtube_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  jstream_lpid TEXT,
  singular_app_token_enc TEXT,
  singular_model_cache JSONB,
  singular_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Viewer count snapshots (for chart history)
CREATE TABLE IF NOT EXISTS liveops_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES liveops_programs(id) ON DELETE CASCADE,
  captured_at TIMESTAMP NOT NULL DEFAULT NOW(),
  youtube_count INT NOT NULL DEFAULT 0,
  jstream_count INT NOT NULL DEFAULT 0,
  total_count INT GENERATED ALWAYS AS (youtube_count + jstream_count) STORED,
  details JSONB
);
CREATE INDEX IF NOT EXISTS idx_liveops_snapshots_program_time
  ON liveops_snapshots(program_id, captured_at DESC);

-- Timers (countdown / overtime display)
CREATE TABLE IF NOT EXISTS liveops_timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  total_seconds INT NOT NULL DEFAULT 0,
  remaining_ms BIGINT NOT NULL DEFAULT 0,
  running BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMP,
  paused_remaining_ms BIGINT NOT NULL DEFAULT 0,
  warning_threshold_sec INT NOT NULL DEFAULT 60,
  phase TEXT NOT NULL DEFAULT 'idle' CHECK (phase IN ('idle','countdown','yellow','red')),
  viewer_overlay_program_id UUID REFERENCES liveops_programs(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Register liveops permissions for existing system_admin users
INSERT INTO user_permissions (id, user_id, module, access_level)
SELECT gen_random_uuid()::text, id, 'liveops', 'manager'
FROM users
WHERE role = 'system_admin'
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions up WHERE up.user_id = users.id AND up.module = 'liveops'
  );
