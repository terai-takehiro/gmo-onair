-- v2.9.206: プロジェクト管理強化 Phase 3
-- タスクに マイルストーン / 進捗% を追加し、タスク間の依存関係 (先行→後続) を新設。

-- 進捗% (0-100) と マイルストーン フラグ
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS progress     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN NOT NULL DEFAULT FALSE;

-- タスク依存関係 (predecessor が先行、successor が後続。ガントの → 線に使う)
CREATE TABLE IF NOT EXISTS task_dependencies (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_id TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,  -- 先行タスク
  successor_id   TEXT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,  -- 後続タスク
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by     TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies
  ON task_dependencies(predecessor_id, successor_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_project
  ON task_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_successor
  ON task_dependencies(successor_id);
