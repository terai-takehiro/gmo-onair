-- v2.9.204: プロジェクト担当メンバー (複数担当・外部の方対応)
-- 従来の projects.assigned_to (単一・users への NOT NULL FK = 主担当) はそのまま残し、
-- 複数の担当メンバーを別テーブルで管理する。
-- - user_id: 登録ユーザーの場合は users.id (ON DELETE SET NULL)。外部の方は NULL。
-- - member_name: 表示名 (登録ユーザーは users.name のスナップショット / 外部の方は手入力名)。
--   常に保持することで、外部の方 (users に居ない) も担当にでき、表示に join を要さない。
-- - is_external: 外部パートナー等のフラグ。
-- 前例: sga_expenses (vendor_id FK + vendor_name TEXT) と同じ「id + 名前」二本立て。

CREATE TABLE IF NOT EXISTS project_members (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,   -- 登録ユーザー (外部の方は NULL)
  member_name TEXT NOT NULL,                                   -- 表示名 (ユーザー名 or 外部手入力)
  role        TEXT,                                            -- 役割 (PM / 制作 / 営業 / 技術 / 外部 等・自由入力)
  is_external BOOLEAN NOT NULL DEFAULT FALSE,                  -- 外部の方フラグ
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  TEXT,
  updated_by  TEXT,
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_members_project
  ON project_members(project_id) WHERE deleted_at IS NULL;

-- 同一案件で同じ登録ユーザーを重複登録しない (外部の方=user_id NULL は対象外)
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_members_user
  ON project_members(project_id, user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
