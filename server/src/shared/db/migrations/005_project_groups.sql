-- 案件グループ（複数案件の費用按分用）
CREATE TABLE IF NOT EXISTS project_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  TEXT,
  updated_by  TEXT,
  deleted_at  TEXT
);

-- グループ所属案件
CREATE TABLE IF NOT EXISTS project_group_members (
  group_id   TEXT NOT NULL REFERENCES project_groups(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  PRIMARY KEY (group_id, project_id)
);

-- 仕入按分明細
CREATE TABLE IF NOT EXISTS purchase_allocations (
  id               TEXT PRIMARY KEY,
  purchase_id      TEXT NOT NULL REFERENCES purchases(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  allocated_amount INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 仕入にグループID追加
ALTER TABLE purchases ADD COLUMN group_id TEXT REFERENCES project_groups(id);

CREATE INDEX IF NOT EXISTS idx_project_groups_deleted ON project_groups(deleted_at);
CREATE INDEX IF NOT EXISTS idx_project_group_members_project ON project_group_members(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_allocations_purchase ON purchase_allocations(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_allocations_project ON purchase_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_purchases_group ON purchases(group_id) WHERE group_id IS NOT NULL;
