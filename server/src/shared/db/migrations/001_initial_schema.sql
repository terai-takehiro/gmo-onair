-- GMO ONAiR 統合スキーマ v3
-- ヨミ(opportunities)と案件(projects)を統合
-- テーブル数: 14(中間テーブル含む)

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
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  short_name     TEXT,
  contact_name   TEXT,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  notes          TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS vendors (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  contact_name                TEXT,
  email                       TEXT,
  phone                       TEXT,
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
-- 案件（統合: ヨミ〜完了まで1テーブルで管理）
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  gls_number         TEXT UNIQUE,
  name               TEXT NOT NULL,
  customer_id        TEXT NOT NULL REFERENCES customers(id),
  stage              TEXT NOT NULL DEFAULT 'neta'
                     CHECK (stage IN ('neta','d_hold','c_proposal','b_verbal','a_won','s_completed','e_lost')),
  project_type       TEXT DEFAULT 'other',
  project_type_other TEXT,
  expected_amount    INTEGER DEFAULT 0,
  event_start        TEXT,
  event_end          TEXT,
  broadcast_type     TEXT,
  media_platform     TEXT,
  assigned_to        TEXT NOT NULL REFERENCES users(id),
  tags               TEXT DEFAULT '',
  lost_reason        TEXT,
  lost_reason_note   TEXT,
  application_form   INTEGER NOT NULL DEFAULT 0,
  logo_permission    INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_by         TEXT,
  updated_by         TEXT,
  deleted_at         TEXT
);

-- ============================================================
-- エピソード (3テーブル + 中間1)
-- ============================================================

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
-- お金 (売上 + 仕入 + 販管費)
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

CREATE TABLE IF NOT EXISTS purchases (
  id                TEXT PRIMARY KEY,
  billing_key       TEXT,
  project_id        TEXT NOT NULL REFERENCES projects(id),
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
-- 営業支援 (2テーブル)
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id),
  customer_id   TEXT REFERENCES customers(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call','email','meeting','visit','proposal','followup','other')),
  subject       TEXT NOT NULL,
  description   TEXT,
  activity_date TEXT NOT NULL,
  next_action   TEXT,
  next_action_date TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS sales_targets (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  target_year   INTEGER NOT NULL,
  target_month  INTEGER NOT NULL,
  target_amount INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, target_year, target_month)
);

-- ============================================================
-- 料金シミュレーション（独立機能）
-- ============================================================

CREATE TABLE IF NOT EXISTS simulations (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id),
  pricing_item_id TEXT NOT NULL REFERENCES pricing_items(id),
  quantity        INTEGER NOT NULL DEFAULT 1,
  days            INTEGER NOT NULL DEFAULT 1,
  unit_price      INTEGER NOT NULL DEFAULT 0,
  subtotal        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- スタジオ予約
-- ============================================================

CREATE TABLE IF NOT EXISTS studio_locations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS studio_rooms (
  id          TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES studio_locations(id),
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#3b82f6',
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS studio_bookings (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  booking_type  TEXT NOT NULL DEFAULT 'project'
                CHECK (booking_type IN ('project','maintenance','tour','internal','other')),
  project_id    TEXT REFERENCES projects(id),
  episode_id    TEXT REFERENCES episodes(id),
  all_day       INTEGER NOT NULL DEFAULT 0,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  location_note TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT,
  updated_by    TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS studio_booking_rooms (
  booking_id TEXT NOT NULL REFERENCES studio_bookings(id),
  room_id    TEXT NOT NULL REFERENCES studio_rooms(id),
  PRIMARY KEY (booking_id, room_id)
);

-- ============================================================
-- インデックス
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_assigned ON projects(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_gls ON projects(gls_number) WHERE gls_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pricing_items_category ON pricing_items(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_code ON episodes(episode_code);
CREATE INDEX IF NOT EXISTS idx_episode_orders_project ON episode_orders(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_groups_project ON invoice_groups(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_project ON revenues(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_revenues_episode ON revenues(episode_id);
CREATE INDEX IF NOT EXISTS idx_purchases_project ON purchases(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_episode ON purchases(episode_id);
CREATE INDEX IF NOT EXISTS idx_sga_recognition ON sga_expenses(recognition_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_project ON activity_logs(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_simulations_project ON simulations(project_id);
CREATE INDEX IF NOT EXISTS idx_studio_rooms_location ON studio_rooms(location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_studio_bookings_time ON studio_bookings(start_time, end_time) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_studio_bookings_project ON studio_bookings(project_id) WHERE deleted_at IS NULL;
