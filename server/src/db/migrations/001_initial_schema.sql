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
  id              TEXT PRIMARY KEY,
  opp_code        TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  customer_id     TEXT NOT NULL REFERENCES customers(id),
  stage           TEXT NOT NULL DEFAULT 'lead'
                  CHECK (stage IN ('lead','proposal','negotiation','won','lost')),
  probability     INTEGER DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  expected_amount INTEGER DEFAULT 0,
  expected_date   TEXT,
  project_id      TEXT REFERENCES projects(id),
  assigned_to     TEXT NOT NULL REFERENCES users(id),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by      TEXT,
  updated_by      TEXT,
  deleted_at      TEXT
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

-- インデックス
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON opportunities(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_event_start ON projects(event_start) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_project ON revenues(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_project ON purchases(project_id) WHERE deleted_at IS NULL;
