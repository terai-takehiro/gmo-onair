-- GMO ONAiR 初期スキーマ

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('system_admin','staff','viewer','external_client')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  short_name    TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS vendors (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  address                     TEXT,
  vendor_type                 TEXT,
  invoice_registration_number TEXT,
  notes                       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS partners (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  role_title    TEXT,
  specialties   TEXT DEFAULT '[]',
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id                TEXT PRIMARY KEY,
  gls_number        TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  customer_id       TEXT NOT NULL REFERENCES customers(id),
  opportunity_id    TEXT,
  group_id          TEXT,
  rehearsal_start   TEXT,
  rehearsal_end     TEXT,
  event_start       TEXT,
  event_end         TEXT,
  status            TEXT NOT NULL DEFAULT 'tentative'
                    CHECK (status IN ('tentative','confirmed','completed','cancelled')),
  broadcast_type    TEXT DEFAULT 'recording',
  media_platform    TEXT DEFAULT 'other',
  application_form  INTEGER NOT NULL DEFAULT 0,
  logo_permission   INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);

CREATE TABLE IF NOT EXISTS opportunities (
  id                TEXT PRIMARY KEY,
  opp_code          TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  customer_id       TEXT NOT NULL REFERENCES customers(id),
  project_type      TEXT DEFAULT 'other',
  project_type_other TEXT,
  stage             TEXT NOT NULL DEFAULT 'neta'
                    CHECK (stage IN ('neta','d_hold','c_proposal','b_verbal','a_won','s_completed','e_lost')),
  probability       INTEGER DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  expected_amount   INTEGER DEFAULT 0,
  expected_date     TEXT,
  project_id        TEXT REFERENCES projects(id),
  assigned_to       TEXT NOT NULL REFERENCES users(id),
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);

CREATE TABLE IF NOT EXISTS revenues (
  id               TEXT PRIMARY KEY,
  billing_key      TEXT,
  project_id       TEXT NOT NULL REFERENCES projects(id),
  episode_id       TEXT,
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

CREATE TABLE IF NOT EXISTS purchases (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id),
  episode_id          TEXT,
  vendor_id           TEXT NOT NULL REFERENCES vendors(id),
  assigned_to         TEXT,
  settlement_method   TEXT CHECK (settlement_method IN ('rakuraku','xpoint','other')),
  settlement_number   TEXT,
  external_ref_id     TEXT,
  tax_category        TEXT NOT NULL DEFAULT 'tax10'
                      CHECK (tax_category IN ('tax10','tax8','exempt')),
  invoice_qualified   INTEGER NOT NULL DEFAULT 1,
  amount              INTEGER NOT NULL DEFAULT 0,
  description         TEXT,
  recognition_date    TEXT,
  inspection_date     TEXT,
  payment_due_date    TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  created_by          TEXT,
  updated_by          TEXT,
  deleted_at          TEXT
);

CREATE TABLE IF NOT EXISTS sequences (
  seq_name    TEXT PRIMARY KEY,
  prefix      TEXT NOT NULL,
  year_month  TEXT NOT NULL,
  counter     INTEGER NOT NULL DEFAULT 0
);

-- 料金カテゴリ
CREATE TABLE IF NOT EXISTS pricing_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

-- 料金項目
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

-- ヨミ日程(複数日対応)
CREATE TABLE IF NOT EXISTS opportunity_dates (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id),
  date_start      TEXT NOT NULL,
  date_end        TEXT,
  label           TEXT,
  sort_order      INTEGER DEFAULT 0
);

-- ヨミ シミュレーション結果
CREATE TABLE IF NOT EXISTS opportunity_simulations (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT NOT NULL REFERENCES opportunities(id),
  pricing_item_id  TEXT NOT NULL REFERENCES pricing_items(id),
  quantity         INTEGER NOT NULL DEFAULT 1,
  days             INTEGER NOT NULL DEFAULT 1,
  unit_price       INTEGER NOT NULL DEFAULT 0,
  subtotal         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 案件グループ(親案件)
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

-- グループ共通仕入
CREATE TABLE IF NOT EXISTS group_purchases (
  id                TEXT PRIMARY KEY,
  group_id          TEXT NOT NULL REFERENCES project_groups(id),
  vendor_id         TEXT NOT NULL REFERENCES vendors(id),
  assigned_to       TEXT,
  settlement_method TEXT CHECK (settlement_method IN ('rakuraku','xpoint','other')),
  tax_category      TEXT NOT NULL DEFAULT 'tax10'
                    CHECK (tax_category IN ('tax10','tax8','exempt')),
  invoice_qualified INTEGER NOT NULL DEFAULT 1,
  amount            INTEGER NOT NULL DEFAULT 0,
  description       TEXT,
  recognition_date  TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT,
  updated_by        TEXT,
  deleted_at        TEXT
);

-- グループ仕入按分
CREATE TABLE IF NOT EXISTS group_purchase_allocations (
  id                 TEXT PRIMARY KEY,
  group_purchase_id  TEXT NOT NULL REFERENCES group_purchases(id),
  project_id         TEXT NOT NULL REFERENCES projects(id),
  allocated_amount   INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_group_purchases_group ON group_purchases(group_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gpa_purchase ON group_purchase_allocations(group_purchase_id);
CREATE INDEX IF NOT EXISTS idx_gpa_project ON group_purchase_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON opportunities(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pricing_items_category ON pricing_items(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opp_dates_opp ON opportunity_dates(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_sims_opp ON opportunity_simulations(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_event_start ON projects(event_start) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_project ON revenues(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_project ON purchases(project_id) WHERE deleted_at IS NULL;
