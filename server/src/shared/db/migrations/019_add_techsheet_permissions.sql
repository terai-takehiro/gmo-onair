-- 019: Add techsheet permissions for existing users
-- Previously missing from seed data, causing 403 errors on techsheet API

INSERT INTO user_permissions (id, user_id, module, access_level)
SELECT gen_random_uuid()::text, u.id, 'techsheet',
  CASE
    WHEN u.role = 'system_admin' THEN 'owner'
    WHEN u.role = 'staff' THEN 'editor'
    WHEN u.role = 'viewer' THEN 'reader'
    ELSE 'reader'
  END
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_permissions up WHERE up.user_id = u.id AND up.module = 'techsheet'
);
