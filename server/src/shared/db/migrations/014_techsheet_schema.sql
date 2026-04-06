-- 014: TechSheet (技術資料) schema
-- Technical documentation for TV/event productions

CREATE TABLE IF NOT EXISTS techsheet_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL DEFAULT '無題の技術資料',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  production_date TEXT,
  venue TEXT,
  version TEXT DEFAULT 'Ver.1.0',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'archived')),
  data JSONB NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for GLS project lookup
CREATE INDEX IF NOT EXISTS idx_techsheet_documents_project_id ON techsheet_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_techsheet_documents_episode_id ON techsheet_documents(episode_id);
CREATE INDEX IF NOT EXISTS idx_techsheet_documents_status ON techsheet_documents(status);
