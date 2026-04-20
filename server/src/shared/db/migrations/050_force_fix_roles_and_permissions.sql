-- ============================================================
-- 050: ロール/権限 強制修正 (047/048/049 の補完)
--
-- 背景: migration 047 は deleted_at IS NULL のユーザーのみ
-- ロール更新したが、CHECK 制約は全行に適用されるため、
-- ソフトデリート済みの旧ロールユーザーが存在すると 047 が
-- ロールバックしていた。その場合 048/049 も未実行のまま。
--
-- 本マイグレーションで全行を強制修正する。
-- ============================================================

-- Step 1: ソフトデリート済みを含む全ユーザーの旧ロールを統一
UPDATE users
SET role = 'staff', updated_at = NOW()
WHERE role NOT IN ('system_admin', 'staff');

-- Step 2: users.role CHECK 制約を NOT VALID で安全に再作成
--         (NOT VALID = 既存行の再検証をスキップ)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('system_admin', 'staff')) NOT VALID;

-- Step 3: アクセスレベルを3段階に正規化 (048 のバックアップ)
UPDATE user_permissions SET access_level = 'reader', updated_at = NOW()
WHERE access_level = 'exporter';

UPDATE user_permissions SET access_level = 'manager', updated_at = NOW()
WHERE access_level = 'owner';

-- Step 4: user_permissions.access_level CHECK 制約を3段階に更新
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_access_level_check;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_access_level_check
  CHECK (access_level IN ('reader', 'editor', 'manager')) NOT VALID;

-- Step 5: 全アクティブ staff ユーザーに欠けている権限を付与
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
