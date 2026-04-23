-- ============================================================
-- 048: アクセスレベル3段階化
--
-- 5段階 (reader/exporter/editor/manager/owner) を
-- 3段階 (reader/editor/manager) に集約:
--   exporter → reader  (閲覧者もCSV出力可能に)
--   owner    → manager (オーナーとマネージャーを統合)
-- ============================================================

UPDATE user_permissions SET access_level = 'reader',  updated_at = NOW()
WHERE access_level = 'exporter';

UPDATE user_permissions SET access_level = 'manager', updated_at = NOW()
WHERE access_level = 'owner';

-- CHECK 制約を3段階に更新
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_access_level_check;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_access_level_check
  CHECK (access_level IN ('reader', 'editor', 'manager'));
