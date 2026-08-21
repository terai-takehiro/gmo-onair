-- 制作資料 v4 段4 — スケジュール表（当日の枠）
-- 専用テーブル5本＋共有1本。設計: docs/design/v4/qsheet-v4-coding/02-schedule.md §3
-- 実装設計: docs/design/v4/qsheet-v4-coding/impl/04-schedule-impl.md §3
--
-- ⚠️ 時刻は INTEGER（その日の 00:00 JST からの分）。日跨ぎは 25:30 = 1530、上限 2880（48時間）。
--    絶対時刻の TEXT/TIMESTAMPTZ にしないのは、グリッドが持つのが「絶対時刻」ではなく
--    「その日の中の相対位置」だから（§3-1 の注記）。
-- ⚠️ `source_template_*` には FK を張らない（§3-6）。ひな形を消しても当日の表を壊さないための
--    構造上の約束。孤児のまま残すのが正しい。
-- ⚠️ `btree_gist` は入れない。重なりは DB で禁止せず、画面で可視化する。

-- ============================================================
-- 本体
-- ============================================================
CREATE TABLE IF NOT EXISTS qsheet_schedules (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL DEFAULT '',
  doc_no         TEXT,
  service_date   DATE NOT NULL,
  location_id    TEXT REFERENCES studio_locations(id),
  project_id     TEXT REFERENCES projects(id),
  episode_id     TEXT REFERENCES episodes(id),
  view_start_min INTEGER NOT NULL DEFAULT 480,           -- 08:00
  view_end_min   INTEGER NOT NULL DEFAULT 1320,          -- 22:00
  slot_min       INTEGER NOT NULL DEFAULT 5 CHECK (slot_min IN (5, 10, 15, 30)),
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'fixed', 'archived')),
  notes          TEXT,
  created_by     TEXT REFERENCES users(id),
  updated_by     TEXT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,
  CHECK (view_end_min > view_start_min),
  CHECK (view_start_min >= 0 AND view_end_min <= 2880)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_service_date ON qsheet_schedules(service_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_project ON qsheet_schedules(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_location ON qsheet_schedules(location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedules_created_by ON qsheet_schedules(created_by) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_schedules_doc_no ON qsheet_schedules(doc_no) WHERE doc_no IS NOT NULL;

-- ============================================================
-- 列（会場／支度／運営）
-- ============================================================
CREATE TABLE IF NOT EXISTS qsheet_schedule_columns (
  id                     TEXT PRIMARY KEY,
  schedule_id            TEXT NOT NULL REFERENCES qsheet_schedules(id) ON DELETE CASCADE,
  col_group              TEXT NOT NULL CHECK (col_group IN ('venue', 'prep', 'ops')),
  label                  TEXT NOT NULL,
  room_id                TEXT REFERENCES studio_rooms(id),
  color                  TEXT,
  width_px               INTEGER NOT NULL DEFAULT 160 CHECK (width_px BETWEEN 80 AND 640),
  sort_order             INTEGER NOT NULL DEFAULT 0,
  -- ひな形からの由来。FK は張らない（§3-6）
  source_template_id     TEXT,
  source_template_col_id TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ,
  CHECK (col_group = 'venue' OR room_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_schedule_columns_sort
  ON qsheet_schedule_columns(schedule_id, col_group, sort_order) WHERE deleted_at IS NULL;

-- ============================================================
-- 項目
-- ============================================================
CREATE TABLE IF NOT EXISTS qsheet_schedule_items (
  id                      TEXT PRIMARY KEY,
  schedule_id             TEXT NOT NULL REFERENCES qsheet_schedules(id) ON DELETE CASCADE,
  column_id               TEXT NOT NULL REFERENCES qsheet_schedule_columns(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL DEFAULT '',
  kind                    TEXT NOT NULL DEFAULT 'other'
                          CHECK (kind IN ('setup', 'rehearsal', 'onair', 'recording', 'meal', 'standby', 'teardown', 'move', 'other')),
  start_min               INTEGER NOT NULL,
  end_min                 INTEGER NOT NULL,
  -- 自由入力。users を指さない（社外の出演者・「社長」等が入るため。§確認23）
  assignee                TEXT,
  note                    TEXT,
  -- 台本（進行台本）への橋。文書はソフトデリートなので ON DELETE SET NULL はまず発火しない。
  -- 読み出しは必ず deleted_at IS NULL を伴う LEFT JOIN にすること（§3-3）
  qsheet_document_id      TEXT REFERENCES qsheet_documents(id) ON DELETE SET NULL,
  -- ひな形からの由来。FK は張らない（§3-6）
  source_template_id      TEXT,
  source_template_item_id TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ,
  CHECK (end_min > start_min),
  CHECK (start_min >= 0 AND end_min <= 2880)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_schedule_items_column
  ON qsheet_schedule_items(column_id, start_min) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedule_items_schedule
  ON qsheet_schedule_items(schedule_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_schedule_items_document
  ON qsheet_schedule_items(qsheet_document_id) WHERE deleted_at IS NULL;

-- ============================================================
-- ひな形3本（`project_flow_tasks` と意図的に同じ形。§3-4）
-- ⚠️ ひな形の列・項目テーブルには deleted_at も updated_at も無い（履歴を持たない設計）
-- ============================================================
CREATE TABLE IF NOT EXISTS qsheet_schedule_templates (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  location_id  TEXT REFERENCES studio_locations(id),
  is_system    BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT,
  deleted_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS qsheet_schedule_template_columns (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES qsheet_schedule_templates(id) ON DELETE CASCADE,
  col_group   TEXT NOT NULL CHECK (col_group IN ('venue', 'prep', 'ops')),
  label       TEXT NOT NULL,
  room_id     TEXT REFERENCES studio_rooms(id),
  color       TEXT,
  width_px    INTEGER NOT NULL DEFAULT 160 CHECK (width_px BETWEEN 80 AND 640),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  CHECK (col_group = 'venue' OR room_id IS NULL)
);

CREATE TABLE IF NOT EXISTS qsheet_schedule_template_items (
  id           TEXT PRIMARY KEY,
  template_id  TEXT NOT NULL REFERENCES qsheet_schedule_templates(id) ON DELETE CASCADE,
  column_id    TEXT NOT NULL REFERENCES qsheet_schedule_template_columns(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'other'
               CHECK (kind IN ('setup', 'rehearsal', 'onair', 'recording', 'meal', 'standby', 'teardown', 'move', 'other')),
  -- day: その日の 00:00 起点。onair: 本番開始時刻からの符号つきオフセット
  anchor       TEXT NOT NULL DEFAULT 'day' CHECK (anchor IN ('day', 'onair')),
  offset_min   INTEGER NOT NULL DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 30 CHECK (duration_min > 0),
  is_required  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_qsheet_schedule_tpl_columns ON qsheet_schedule_template_columns(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_qsheet_schedule_tpl_items ON qsheet_schedule_template_items(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_qsheet_schedule_tpl_items_column ON qsheet_schedule_template_items(column_id);

-- ============================================================
-- 共有（`qsheet_document_shares` と同じ形。created_at だけ TIMESTAMPTZ）
-- ============================================================
CREATE TABLE IF NOT EXISTS qsheet_schedule_shares (
  schedule_id TEXT NOT NULL REFERENCES qsheet_schedules(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT REFERENCES users(id),
  PRIMARY KEY (schedule_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_schedule_shares_user ON qsheet_schedule_shares(user_id);
