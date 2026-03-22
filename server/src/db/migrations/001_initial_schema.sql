-- GMO ONAiR 統合スキーマ v2
-- テーブル数: 17(中間テーブル含む)

-- ============================================================
-- マスター (7テーブル)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('system_admin','staff','viewer','external_client')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  short_name TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS vendors (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  address                     TEXT,
  vendor_type                 TEXT,
  invoice_registration_number TEXT,
  notes                       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS partners (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  role_title  TEXT,
  specialties TEXT DEFAULT '[]',
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  TEXT,
  updated_by  TEXT,
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS pricing_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS pricing_items (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES pricing_categories(id),
  name        TEXT NOT NULL,
  sub_label   TEXT,
  unit_price  INTEGER NOT NULL DEFAULT 0,
  calc_type   TEXT NOT NULL DEFAULT 'days'
              CHECK (calc_type IN ('days','hours','fixed','days_qty','days_people','toggle')),
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS sequences (
  seq_name   TEXT PRIMARY KEY,
  prefix     TEXT NOT NULL,
  year_month TEXT NOT NULL,
  counter    INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 営業 (3テーブル)
-- ============================================================

CREATE TABLE IF NOT EXISTS opportunities (
  id                 TEXT PRIMARY KEY,
  opp_code           TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  customer_id        TEXT NOT NULL REFERENCES customers(id),
  project_type       TEXT DEFAULT 'other',
  project_type_other TEXT,
  stage              TEXT NOT NULL DEFAULT 'neta'
                     CHECK (stage IN ('neta','d_hold','c_proposal','b_verbal','a_won','s_completed','e_lost')),
  expected_amount    INTEGER DEFAULT 0,
  expected_date      TEXT,
  project_id         TEXT REFERENCES projects(id),
  assigned_to        TEXT NOT NULL REFERENCES users(id),
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_by         TEXT,
  updated_by         TEXT,
  deleted_at         TEXT
);

CREATE TABLE IF NOT EXISTS opportunity_dates (
  id             TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  date_start     TEXT NOT NULL,
  date_end       TEXT,
  label          TEXT,
  sort_order     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS opportunity_simulations (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id),
  pricing_item_id TEXT NOT NULL REFERENCES pricing_items(id),
  quantity        INTEGER NOT NULL DEFAULT 1,
  days            INTEGER NOT NULL DEFAULT 1,
  unit_price      INTEGER NOT NULL DEFAULT 0,
  subtotal        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 案件 (6テーブル: メイン4 + 中間2)
-- ============================================================

CREATE TABLE IF NOT EXISTS project_groups (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  period_start TEXT,
  period_end   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_by   TEXT,
  updated_by   TEXT,
  deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  gls_number       TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  group_id         TEXT REFERENCES project_groups(id),
  rehearsal_start  TEXT,
  rehearsal_end    TEXT,
  event_start      TEXT,
  event_end        TEXT,
  status           TEXT NOT NULL DEFAULT 'tentative'
                   CHECK (status IN ('tentative','confirmed','completed','cancelled')),
  broadcast_type   TEXT DEFAULT 'recording',
  media_platform   TEXT DEFAULT 'other',
  application_form INTEGER NOT NULL DEFAULT 0,
  logo_permission  INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       TEXT,
  updated_by       TEXT,
  deleted_at       TEXT
);

CREATE TABLE IF NOT EXISTS episodes (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id),
  episode_number INTEGER NOT NULL,
  episode_code   TEXT NOT NULL UNIQUE,
  recording_date TEXT,
  broadcast_date TEXT,
  delivery_date  TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_by     TEXT,
  updated_by     TEXT,
  deleted_at     TEXT
);

CREATE TABLE IF NOT EXISTS episode_orders (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  order_date    TEXT NOT NULL,
  episode_count INTEGER NOT NULL,
  start_episode INTEGER NOT NULL,
  end_episode   INTEGER NOT NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS invoice_groups (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  title        TEXT NOT NULL,
  invoice_date TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','sent','paid')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_by   TEXT,
  updated_by   TEXT,
  deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS invoice_group_episodes (
  invoice_group_id TEXT NOT NULL REFERENCES invoice_groups(id),
  episode_id       TEXT NOT NULL REFERENCES episodes(id),
  PRIMARY KEY (invoice_group_id, episode_id)
);

-- ============================================================
-- お金 (3テーブル: 売上1 + 仕入統合2)
-- ============================================================

CREATE TABLE IF NOT EXISTS revenues (
  id               TEXT PRIMARY KEY,
  billing_key      TEXT,
  project_id       TEXT NOT NULL REFERENCES projects(id),
  episode_id       TEXT REFERENCES episodes(id),
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  assigned_to      TEXT,
  tax_category     TEXT NOT NULL DEFAULT 'tax10'
                   CHECK (tax_category IN ('tax10','tax8','exempt')),
  amount           INTEGER NOT NULL DEFAULT 0,
  recognition_date TEXT,
  billing_date     TEXT,
  payment_due_date TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       TEXT,
  updated_by       TEXT,
  deleted_at       TEXT
);

-- 仕入(統合テーブル: 案件仕入 + グループ共通仕入)
-- project_id: 案件紐付き(通常仕入)
-- group_id: グループ紐付き(共通仕入) → purchase_allocationsで按分
-- episode_id: 話数紐付き(話数仕入)
CREATE TABLE IF NOT EXISTS purchases (
  id                TEXT PRIMARY KEY,
  billing_key       TEXT,
  project_id        TEXT REFERENCES projects(id),
  group_id          TEXT REFERENCES project_groups(id),
  episode_id        TEXT REFERENCES episodes(id),
  vendor_id         TEXT NOT NULL REFERENCES vendors(id),
  assigned_to       TEXT,
  settlement_method TEXT CHECK (settlement_method IN ('rakuraku','xpoint','other')),
  settlement_number TEXT,
  external_ref_id   TEXT,
  tax_category      TEXT NOT NULL DEFAULT 'tax10'
                    CHECK (tax_category IN ('tax10','tax8','exempt')),
  invoice_qualified INTEGER NOT NULL DEFAULT 1,
  amount            INTEGER NOT NULL DEFAULT 0,
  description       TEXT,
  recognition_date  TEXT,
  inspection_date   TEXT,
  payment_due_date  TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);

-- 仕入按分(グループ共通仕入 → 案件への配分)
CREATE TABLE IF NOT EXISTS purchase_allocations (
  id               TEXT PRIMARY KEY,
  purchase_id      TEXT NOT NULL REFERENCES purchases(id),
  project_id       TEXT NOT NULL REFERENCES projects(id),
  allocated_amount INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 仕入の話数按分(1仕入 → 複数話数への配分)
CREATE TABLE IF NOT EXISTS purchase_episode_allocations (
  id               TEXT PRIMARY KEY,
  purchase_id      TEXT NOT NULL REFERENCES purchases(id),
  episode_id       TEXT NOT NULL REFERENCES episodes(id),
  allocated_amount INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 販管費
CREATE TABLE IF NOT EXISTS sga_expenses (
  id                TEXT PRIMARY KEY,
  billing_key       TEXT NOT NULL,
  assigned_to       TEXT,
  settlement_method TEXT CHECK (settlement_method IN ('xpoint','rakuraku','other')),
  settlement_number TEXT,
  vendor_name       TEXT NOT NULL,
  vendor_id         TEXT REFERENCES vendors(id),
  description       TEXT,
  notes             TEXT,
  expense_type      TEXT NOT NULL DEFAULT 'spot'
                    CHECK (expense_type IN ('fixed','spot')),
  source            TEXT NOT NULL DEFAULT 'staff'
                    CHECK (source IN ('staff','accounting')),
  recognition_date  TEXT,
  payment_due_date  TEXT,
  amortize_start    TEXT,
  amortize_end      TEXT,
  tax_category      TEXT NOT NULL DEFAULT 'tax10'
                    CHECK (tax_category IN ('tax10','tax8','exempt')),
  invoice_qualified INTEGER NOT NULL DEFAULT 1,
  amount            INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);

-- ============================================================
-- インデックス
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON opportunities(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opp_dates_opp ON opportunity_dates(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_sims_opp ON opportunity_simulations(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_pricing_items_category ON pricing_items(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_event_start ON projects(event_start) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_code ON episodes(episode_code);
CREATE INDEX IF NOT EXISTS idx_episode_orders_project ON episode_orders(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_groups_project ON invoice_groups(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_project ON revenues(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_episode ON revenues(episode_id);
CREATE INDEX IF NOT EXISTS idx_purchases_project ON purchases(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_group ON purchases(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_episode ON purchases(episode_id);
CREATE INDEX IF NOT EXISTS idx_pa_purchase ON purchase_allocations(purchase_id);
CREATE INDEX IF NOT EXISTS idx_pa_project ON purchase_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_pea_purchase ON purchase_episode_allocations(purchase_id);
CREATE INDEX IF NOT EXISTS idx_pea_episode ON purchase_episode_allocations(episode_id);
CREATE INDEX IF NOT EXISTS idx_sga_recognition ON sga_expenses(recognition_date) WHERE deleted_at IS NULL;
