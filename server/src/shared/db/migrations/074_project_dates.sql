-- 074: project_dates テーブル追加（仮スケジュール 飛び日対応）
-- 案件ごとに複数の日程（連続しない日も含む）を保持できるようにする
-- 既存の projects.event_start / event_end は保持し、
-- アプリケーション側で MIN(date) / MAX(date) を同期する

CREATE TABLE IF NOT EXISTS project_dates (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,        -- YYYY-MM-DD
  label       TEXT,                 -- 例: '本番', 'リハ', '撤去'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_dates_project ON project_dates(project_id);
CREATE INDEX IF NOT EXISTS idx_project_dates_date    ON project_dates(date);

COMMENT ON TABLE project_dates IS '案件ごとの仮スケジュール（飛び日対応）';
COMMENT ON COLUMN project_dates.label IS '日程ラベル: 本番/リハ/撤去/その他';
