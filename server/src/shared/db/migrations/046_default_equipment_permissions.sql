-- ============================================================
-- 046: staffロールのユーザーにデフォルトequipment権限を付与
--
-- 既存の staff ユーザーで equipment 権限が未設定の場合、
-- reader を自動付与する（意図的に設定済みの場合は変更しない）
-- ============================================================

INSERT INTO user_permissions (id, user_id, module, access_level)
SELECT
  gen_random_uuid()::text,
  u.id,
  'equipment',
  'reader'
FROM users u
WHERE u.role IN ('staff', 'viewer')
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions p
    WHERE p.user_id = u.id AND p.module = 'equipment'
  );
