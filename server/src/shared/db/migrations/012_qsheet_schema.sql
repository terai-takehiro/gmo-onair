-- ========================================================
-- Qシート管理システム (v0.7.x)
-- Qsheet Editorの統合: ドキュメント + 立ち位置図テンプレート
-- ========================================================

-- Qシートドキュメント
CREATE TABLE IF NOT EXISTS qsheet_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}',

  -- ONAiR連携
  episode_id TEXT REFERENCES episodes(id),
  project_id TEXT REFERENCES projects(id),

  -- メタデータ
  broadcast_date TEXT,
  episode_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'rehearsal', 'on_air', 'archived')),

  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TEXT
);

-- 立ち位置図テンプレート
CREATE TABLE IF NOT EXISTS qsheet_stage_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  elements JSONB NOT NULL DEFAULT '[]',

  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TEXT
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_qsheet_documents_episode ON qsheet_documents(episode_id);
CREATE INDEX IF NOT EXISTS idx_qsheet_documents_project ON qsheet_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_qsheet_documents_episode_code ON qsheet_documents(episode_code);
CREATE INDEX IF NOT EXISTS idx_qsheet_documents_broadcast_date ON qsheet_documents(broadcast_date);
CREATE INDEX IF NOT EXISTS idx_qsheet_documents_status ON qsheet_documents(status);
CREATE INDEX IF NOT EXISTS idx_qsheet_documents_created_by ON qsheet_documents(created_by);
CREATE INDEX IF NOT EXISTS idx_qsheet_stage_templates_created_by ON qsheet_stage_templates(created_by);
