-- 070: awards モジュール権限をスタッフ全員に付与 (editor)
INSERT INTO user_permissions (id, user_id, module, access_level)
SELECT
  gen_random_uuid()::text,
  u.id,
  'awards',
  'editor'
FROM users u
WHERE u.role = 'staff'
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions p
    WHERE p.user_id = u.id AND p.module = 'awards'
  );
