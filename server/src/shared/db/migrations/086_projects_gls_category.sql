-- ============================================================
-- 086: projects.gls_category を追加 (スタジオ案件 GLS-A / ビジネス案件 GLS-B)
--
-- これまでは GLS 発番時に project_type から自動判定して GLS 番号の prefix に焼き付け、
-- 一覧の振り分けは gls_number LIKE 'GLS-A%' / 'GLS-B%' で行っていた。
-- 1) 案件登録 UI で明示的に選択させ、自動分類をやめる
-- 2) 発番後も A↔B を切替可能にする (採番し直し + BOX フォルダ自動リネーム)
-- 3) 一覧フィルタはこのカラムを真実とする
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS gls_category CHAR(1)
  CHECK (gls_category IN ('A', 'B'));

-- 既存データのバックフィル: GLS 番号 prefix から判定
UPDATE projects
  SET gls_category = 'A'
  WHERE gls_category IS NULL AND gls_number LIKE 'GLS-A%';

UPDATE projects
  SET gls_category = 'B'
  WHERE gls_category IS NULL AND gls_number LIKE 'GLS-B%';

-- 一覧フィルタ高速化
CREATE INDEX IF NOT EXISTS idx_projects_gls_category
  ON projects(gls_category)
  WHERE deleted_at IS NULL;

-- A↔B 切替時の旧 GLS 番号履歴 (採番し直し時に push する)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS previous_gls_numbers JSONB NOT NULL DEFAULT '[]'::jsonb;
