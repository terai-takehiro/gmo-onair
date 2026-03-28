-- Phase 1: 営業強化
-- 営業活動記録、失注理由、営業目標

-- ============================================================
-- 営業活動記録
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT REFERENCES opportunities(id),
  customer_id      TEXT REFERENCES customers(id),
  activity_type    TEXT NOT NULL CHECK (activity_type IN (
    'call','email','visit','meeting','proposal','demo','follow_up','other'
  )),
  activity_date    TEXT NOT NULL,
  duration_minutes INTEGER,
  subject          TEXT NOT NULL,
  description      TEXT,
  next_action      TEXT,
  next_action_date TEXT,
  performed_by     TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_opportunity ON activity_logs(opportunity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_customer ON activity_logs(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_date ON activity_logs(activity_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_performer ON activity_logs(performed_by) WHERE deleted_at IS NULL;

-- ============================================================
-- 失注理由マスタ
-- ============================================================
CREATE TABLE IF NOT EXISTS lost_reasons (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 失注理由の初期データ
INSERT OR IGNORE INTO lost_reasons (id, name, sort_order) VALUES
  ('lr-001', '価格が合わない', 1),
  ('lr-002', '競合に負けた', 2),
  ('lr-003', 'タイミング・時期が合わない', 3),
  ('lr-004', '要件が合わない', 4),
  ('lr-005', '予算凍結・案件中止', 5),
  ('lr-006', '先方都合（担当変更等）', 6),
  ('lr-007', 'その他', 99);

-- ============================================================
-- 営業目標
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_targets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  fiscal_year  INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL CHECK (fiscal_month BETWEEN 1 AND 12),
  target_amount INTEGER NOT NULL DEFAULT 0,
  target_count  INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT,
  UNIQUE(user_id, fiscal_year, fiscal_month)
);

CREATE INDEX IF NOT EXISTS idx_sales_targets_user ON sales_targets(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_targets_period ON sales_targets(fiscal_year, fiscal_month);
