-- ============================================================
-- 087: プロジェクトタスク管理 (Kanban / タスクリスト / ガントチャート)
-- ============================================================

-- テンプレート本体（「制作フロー」「営業フロー」「基本かんばん」など）
CREATE TABLE IF NOT EXISTS task_column_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  TEXT,
  updated_by  TEXT,
  deleted_at  TIMESTAMP
);

-- テンプレート内カラム定義
CREATE TABLE IF NOT EXISTS task_column_template_columns (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES task_column_templates(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_col_tpl_cols_template
  ON task_column_template_columns(template_id);

-- プロジェクト別 Kanban カラム
CREATE TABLE IF NOT EXISTS task_columns (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  TEXT,
  updated_by  TEXT,
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_columns_project
  ON task_columns(project_id) WHERE deleted_at IS NULL;

-- プロジェクトタスク本体
CREATE TABLE IF NOT EXISTS project_tasks (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- GLS-A: NULL = プロジェクト全体、値あり = エピソード絞り込み
  episode_id       TEXT REFERENCES episodes(id) ON DELETE SET NULL,
  column_id        TEXT REFERENCES task_columns(id) ON DELETE SET NULL,

  title            TEXT NOT NULL,
  description      TEXT,

  task_type        TEXT NOT NULL DEFAULT 'free'
                   CHECK (task_type IN ('free', 'checklist', 'production_step', 'sales')),

  -- 制作ステップ種別（task_type='production_step' のときのみ使用）
  production_step  TEXT
                   CHECK (production_step IN ('script', 'materials', 'recording') OR production_step IS NULL),

  -- ガントチャート用日程
  start_date       DATE,
  due_date         DATE,

  -- 担当者
  assigned_to      TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- 完了状態
  is_completed     BOOLEAN NOT NULL DEFAULT false,
  completed_at     TIMESTAMP,

  -- カラム内並び順
  sort_order       INTEGER NOT NULL DEFAULT 0,

  -- チェックリスト子タスク（parent_task_id が NULL = 親タスク）
  parent_task_id   TEXT REFERENCES project_tasks(id) ON DELETE CASCADE,

  -- 監査
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  TEXT,
  updated_by  TEXT,
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project
  ON project_tasks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_episode
  ON project_tasks(episode_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_column
  ON project_tasks(column_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date
  ON project_tasks(project_id, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_parent
  ON project_tasks(parent_task_id) WHERE deleted_at IS NULL;
