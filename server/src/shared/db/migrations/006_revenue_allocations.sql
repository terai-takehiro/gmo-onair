-- 売上按分明細
CREATE TABLE IF NOT EXISTS revenue_allocations (
  id               TEXT PRIMARY KEY,
  revenue_id       TEXT NOT NULL REFERENCES revenues(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  allocated_amount INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (NOW())
);

-- 売上にグループID追加
ALTER TABLE revenues ADD COLUMN group_id TEXT REFERENCES project_groups(id);

CREATE INDEX IF NOT EXISTS idx_revenue_allocations_revenue ON revenue_allocations(revenue_id);
CREATE INDEX IF NOT EXISTS idx_revenue_allocations_project ON revenue_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_revenues_group ON revenues(group_id) WHERE group_id IS NOT NULL;
