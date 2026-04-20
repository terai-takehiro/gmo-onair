-- ============================================================
-- 049: スタッフ権限補完 (047 の安全ネット)
--
-- 047 が何らかの理由でスキップされたユーザーや、
-- 047 実行後にロール変更されたユーザーへの補完。
-- ON CONFLICT DO NOTHING で既存の意図的設定は保持。
-- ============================================================

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
