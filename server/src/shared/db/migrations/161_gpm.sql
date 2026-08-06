-- ============================================================
-- 161: プロジェクト管理（GPM）— 工程で管理する構築案件
--
-- 決めの根拠は `docs/design/gpm-model.md`。要点だけ再掲する。
--
-- ── なぜ `projects` に相乗りさせないか（実測）────────────────
--
--   server/src で `FROM projects` を書いている箇所            94
--   そのうち stage / gls_category / gls_number で絞っていない  75 (80%)
--   MCP・集計・ダッシュボード・決算取込・週報から来ているもの  38
--
-- 75 か所が「projects にある行はすべて案件だ」という前提で書かれている。
-- 混ぜると案件一覧・財務の集計・決算取込・検索・MCP の list_projects・週報が
-- 全部これを拾う。`gls_category` に値を足す案では 75 か所に除外条件が要り、
-- **1 か所忘れるとエラーにならずに数字が狂う**。
-- migration 138（見積を revenues に相乗りさせなかった）と同じ判断。
--
-- ── フェーズ配下のタスクは既存 project_tasks を使う ──────────
--
-- `project_tasks` は親子・開始/終了日・progress・is_milestone・work_state を
-- 既に持っている。**足りないものは無い。** ただし migration 137 が明記するとおり
-- 6つの書き手が直接 SQL で読み書きしているので、**フェーズ行を混ぜると
-- 案件管理のタスク一覧・カンバン・ガント・MCP・依頼フロー・週報に出てしまう**。
-- → フェーズは別テーブル、タスクは `project_tasks` に列を1つ足して紐づける。
-- ============================================================

-- ── テンプレート（標準工程）─────────────────────────────
-- 既存 `task_column_templates` は**かんばんの列の定義**で、
-- 日数・担当ロール・タスクの雛形を持たないので使わない。
CREATE TABLE IF NOT EXISTS gpm_templates (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,      -- 'av' / 'studio' など
  name        TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,  -- 既定で入れる雛形（消させない）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  updated_by  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gpm_template_phases (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES gpm_templates(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  days        INTEGER NOT NULL DEFAULT 5,   -- 目安の日数
  role        TEXT,                          -- PM / 技術 / 制作 など
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gpm_tpl_phases ON gpm_template_phases(template_id, sort_order);

CREATE TABLE IF NOT EXISTS gpm_template_tasks (
  id                TEXT PRIMARY KEY,
  template_phase_id TEXT NOT NULL REFERENCES gpm_template_phases(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  days              INTEGER NOT NULL DEFAULT 1,
  role              TEXT,
  is_required       BOOLEAN NOT NULL DEFAULT false,
  sort_order        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gpm_tpl_tasks ON gpm_template_tasks(template_phase_id, sort_order);

-- ── プロジェクト本体 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS gpm_projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  -- 'self_build' 自社構築 / 'group_order' グループ受託
  kind           TEXT NOT NULL DEFAULT 'self_build'
                   CHECK (kind IN ('self_build', 'group_order')),
  client_name    TEXT,                         -- 発注者（自社のときも書く）
  customer_id    TEXT REFERENCES customers(id),-- 既存の顧客マスタ（任意）
  pm_company     TEXT,                         -- PM 会社。自社のときは NULL
  pm_user_id     TEXT REFERENCES users(id),    -- 自社側の PM
  started_on     DATE,
  ends_on        DATE,
  -- 'planning' 準備中 / 'active' 進行中 / 'done' 完了 / 'onhold' 保留
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('planning', 'active', 'done', 'onhold')),
  template_id    TEXT REFERENCES gpm_templates(id),
  -- **既存の案件への任意のリンク。** グループ受託で GLS を採るときに結ぶ。
  -- 自社構築は NULL のまま。ON DELETE SET NULL にしないのは、
  -- 案件を消してもプロジェクトを消さないため（結びつきが切れたと分かるほうがよい）
  project_id     TEXT REFERENCES projects(id),
  box_url_internal TEXT,
  box_url_external TEXT,
  notes          TEXT,
  created_by     TEXT,
  updated_by     TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gpm_projects_status ON gpm_projects(status, ends_on) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gpm_projects_project ON gpm_projects(project_id) WHERE project_id IS NOT NULL;

-- ── 工程（フェーズ）──────────────────────────────────────
-- **進捗 % は列に持たない。** 配下タスクの完了率から導出する
-- （列に持つと同じ数字を2か所で数えることになり、必ず食い違う）。
CREATE TABLE IF NOT EXISTS gpm_phases (
  id              TEXT PRIMARY KEY,
  gpm_project_id  TEXT NOT NULL REFERENCES gpm_projects(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  -- 'done' 完了 / 'doing' 進行中 / 'blocked' 待ち / 'todo' 未着手
  state           TEXT NOT NULL DEFAULT 'todo'
                    CHECK (state IN ('done', 'doing', 'blocked', 'todo')),
  started_on      DATE,
  ends_on         DATE,
  role            TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gpm_phases_project ON gpm_phases(gpm_project_id, sort_order);

-- フェーズ配下のタスクは**既存の project_tasks を使う**（列を1つ足すだけ）。
-- タスクの実装・MCP・依頼フロー・かんばんを二重に持たないため。
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS gpm_phase_id TEXT;
CREATE INDEX IF NOT EXISTS idx_project_tasks_gpm_phase
  ON project_tasks (gpm_phase_id) WHERE gpm_phase_id IS NOT NULL;

-- ── 未確認事項 ────────────────────────────────────────────
-- `project_minutes.open_items`（JSONB）は**その議事録の中の持ち帰り**で、
-- プロジェクトをまたいで「いま何件止まっているか」を引けない。
-- 議事録から送ったときは `source_minutes_id` で結ぶ（同じものを2か所に書かない）。
CREATE TABLE IF NOT EXISTS gpm_open_items (
  id               TEXT PRIMARY KEY,
  gpm_project_id   TEXT NOT NULL REFERENCES gpm_projects(id) ON DELETE CASCADE,
  phase_id         TEXT REFERENCES gpm_phases(id) ON DELETE SET NULL,
  question         TEXT NOT NULL,
  -- 誰に訊いているか。'client' 発注者 / 'pm' PM会社 / 'vendor' 業者 / 'internal' 社内
  to_kind          TEXT NOT NULL DEFAULT 'client'
                     CHECK (to_kind IN ('client', 'pm', 'vendor', 'internal')),
  to_name          TEXT,
  -- 'waiting' 返事待ち / 'checking' 確認中 / 'resolved' 解決
  status           TEXT NOT NULL DEFAULT 'waiting'
                     CHECK (status IN ('waiting', 'checking', 'resolved')),
  blocks           TEXT,                     -- これが止めているもの（例: 調達・工事手配）
  due_date         DATE,
  source_minutes_id TEXT,                    -- 議事録から送ったときの元
  raised_by        TEXT,
  raised_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMP,
  resolved_by      TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gpm_open_items_project
  ON gpm_open_items(gpm_project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gpm_open_items_waiting
  ON gpm_open_items(status, due_date) WHERE status <> 'resolved' AND deleted_at IS NULL;

-- ── 体制（誰が何をする人か）───────────────────────────────
-- 既存 `project_members` は `projects` を指す外部キーなので使えない。
-- モックの体制は**社外（発注者・PM会社・業者）を含む**のが案件のメンバーと違うところ。
CREATE TABLE IF NOT EXISTS gpm_members (
  id             TEXT PRIMARY KEY,
  gpm_project_id TEXT NOT NULL REFERENCES gpm_projects(id) ON DELETE CASCADE,
  user_id        TEXT REFERENCES users(id),  -- ONAiR の利用者なら結ぶ（社外は NULL）
  name           TEXT NOT NULL,
  org            TEXT,                        -- 所属（自社 ／ 技術 など）
  role           TEXT,                        -- PM / 技術 / 発注 など
  email          TEXT,
  -- 'internal' 自社 / 'client' 発注者 / 'pm' PM会社 / 'vendor' 業者
  side           TEXT NOT NULL DEFAULT 'internal'
                   CHECK (side IN ('internal', 'client', 'pm', 'vendor')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gpm_members_project ON gpm_members(gpm_project_id, sort_order);
