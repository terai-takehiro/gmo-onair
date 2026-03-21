-- GMO ONAiR 話数(エピソード)管理スキーマ
-- NOTE: broadcast_type, media_platform, episode_id columns are in 001_initial_schema.sql

-- 話数(エピソード)
CREATE TABLE IF NOT EXISTS episodes (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id),
  episode_number   INTEGER NOT NULL,
  episode_code     TEXT NOT NULL UNIQUE,
  recording_date   TEXT,
  broadcast_date   TEXT,
  delivery_date    TEXT,
  revenue_budget   INTEGER NOT NULL DEFAULT 0,
  cost_budget      INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       TEXT,
  updated_by       TEXT,
  deleted_at       TEXT
);

-- 発注バッチ
CREATE TABLE IF NOT EXISTS episode_orders (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id),
  order_date       TEXT NOT NULL,
  episode_count    INTEGER NOT NULL,
  start_episode    INTEGER NOT NULL,
  end_episode      INTEGER NOT NULL,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       TEXT,
  updated_by       TEXT,
  deleted_at       TEXT
);

-- 請求グループ
CREATE TABLE IF NOT EXISTS invoice_groups (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id),
  title            TEXT NOT NULL,
  invoice_date     TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','sent','paid')),
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       TEXT,
  updated_by       TEXT,
  deleted_at       TEXT
);

-- 請求グループ ↔ 話数 中間テーブル
CREATE TABLE IF NOT EXISTS invoice_group_episodes (
  invoice_group_id TEXT NOT NULL REFERENCES invoice_groups(id),
  episode_id       TEXT NOT NULL REFERENCES episodes(id),
  PRIMARY KEY (invoice_group_id, episode_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_code ON episodes(episode_code);
CREATE INDEX IF NOT EXISTS idx_episode_orders_project ON episode_orders(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_groups_project ON invoice_groups(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_episode ON revenues(episode_id);
CREATE INDEX IF NOT EXISTS idx_purchases_episode ON purchases(episode_id);
