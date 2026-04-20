-- ============================================================
-- 047: ロール簡略化 + 全モジュールのデフォルト権限付与
--
-- 1. viewer / external_client → staff に統一
-- 2. 既存 staff ユーザーに全モジュールのデフォルト権限を付与
--    （既に設定済みのモジュールは変更しない）
-- 3. users.role CHECK 制約を system_admin / staff のみに変更
-- ============================================================

-- 1. ロール統一: viewer / external_client → staff
UPDATE users
SET role = 'staff', updated_at = NOW()
WHERE role IN ('viewer', 'external_client')
  AND deleted_at IS NULL;

-- 2. staff ユーザー全員に全モジュールのデフォルト権限を付与
--    （ON CONFLICT DO NOTHING で既存設定は保持）
INSERT INTO user_permissions (id, user_id, module, access_level)
SELECT
  gen_random_uuid()::text,
  u.id,
  m.module,
  m.access_level
FROM users u
CROSS JOIN (VALUES
  ('sales',       'reader'),
  ('budget',      'reader'),
  ('studio',      'editor'),
  ('equipment',   'reader'),
  ('qsheet',      'editor'),
  ('techsheet',   'editor'),
  ('interactive', 'editor')
) AS m(module, access_level)
WHERE u.role = 'staff'
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions p
    WHERE p.user_id = u.id AND p.module = m.module
  );

-- 3. CHECK 制約を更新: system_admin / staff のみ許可
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('system_admin', 'staff'));
