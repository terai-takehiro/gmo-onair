-- ============================================================
-- 210: 権限モデルの単純化（区画をブロックアプリ単位の7つに統合・型だけに一本化）
--
-- 経緯: docs/reviews/permission-model-simplification-plan.md。
-- ユーザーから「管理権限がアプリ単位で分かりにくい、シンプルにしたい」との
-- 指示を受け、AskUserQuestion で方向性を確認した:
--   1) 区画を12（sales/budget/gpm/studio/partner_schedule/equipment/dailyops/
--      admin/qsheet/techsheet/liveops/awards）から、ブロックアプリ単位の7つ
--      （sales/equipment/dailyops/qsheet/techsheet/liveops/awards）へ統合する。
--      `sales` が budget/gpm/studio/partner_schedule を吸収する
--   2) 「型（プリセット）」だけに一本化し、個人ごとの例外編集は廃止する
--   3) 「権限とメンバーの管理」は system_admin だけに絞る（`admin` 区画は廃止）
--   4) 「原則チームメンバーはフルアクセス。一部だけ特定アプリに絞った臨時
--      アクセスもある」という実態を踏まえ、型は「フルアクセス」1つを基本にし、
--      絞りたいときだけ個別の型を作る運用にする
--
-- 移行の考え方（実データを見ずに安全側に倒す）:
--   - 区画の統合は MAX 集約（複数のレベルが1つに潰れるとき、レベルを
--     下げる方向には倒さない。誰かが急に締め出される事故を避ける）
--   - 旧5つの組み込み型（role-admin/role-sales-mgr/role-sales/role-prod/
--     role-account）のいずれかが押してあった人は「フルアクセス」型へ移す。
--     型を押してもらっていた＝実業務で使う正規メンバーだった、という
--     シグナルとして扱う（ユーザーの実態説明と一致する）
--   - 型を押されていない（`permission_role_id IS NULL`）が個人ごとの
--     例外設定だけ持っている人は「一部だけ特定アプリに絞った臨時アクセス」の
--     実例とみなし、いまの実効権限を1文字も変えずに、そのプロファイルを
--     そのまま captures する型を自動生成して割り当てる（同じプロファイルの
--     人は1つの型を共有する）。名前は「限定アクセス（自動移行 N）」とし、
--     中身の確認・名前の付け直しは運用側に委ねる
-- ============================================================

-- ── ① user_permissions（実際の判定テーブル）の区画を統合 ──────────────
-- budget/gpm/studio/partner_schedule と既存の sales を1つの sales へ
-- MAX 集約する。admin は区画そのものを廃止するので単純に削除する。
CREATE TEMP TABLE _sales_collapsed AS
SELECT user_id,
       MAX(CASE access_level
             WHEN 'owner' THEN 3 WHEN 'manager' THEN 3
             WHEN 'editor' THEN 2
             ELSE 1
           END) AS rank
  FROM user_permissions
 WHERE module IN ('sales', 'budget', 'gpm', 'studio', 'partner_schedule')
 GROUP BY user_id;

DELETE FROM user_permissions
 WHERE module IN ('sales', 'budget', 'gpm', 'studio', 'partner_schedule', 'admin');

INSERT INTO user_permissions (id, user_id, module, access_level)
SELECT gen_random_uuid()::text, user_id, 'sales',
       CASE rank WHEN 3 THEN 'manager' WHEN 2 THEN 'editor' ELSE 'reader' END
  FROM _sales_collapsed;

DROP TABLE _sales_collapsed;

-- ── ② permission_role_modules（型の中身）も同じ形で統合 ────────────────
-- 旧5つの組み込み型・すでに作られていたかもしれないカスタム型、どちらも
-- 対象。カスタム型の中身が budget/studio 等をまたいでいた場合も、意図した
-- 最大のレベルを引き継ぐ（下げない）。
CREATE TEMP TABLE _role_sales_collapsed AS
SELECT role_id,
       MAX(CASE access_level WHEN 'manager' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END) AS rank
  FROM permission_role_modules
 WHERE module IN ('sales', 'budget', 'gpm', 'studio', 'partner_schedule')
 GROUP BY role_id;

DELETE FROM permission_role_modules
 WHERE module IN ('sales', 'budget', 'gpm', 'studio', 'partner_schedule', 'admin');

INSERT INTO permission_role_modules (role_id, module, access_level)
SELECT role_id, 'sales', CASE rank WHEN 3 THEN 'manager' WHEN 2 THEN 'editor' ELSE 'reader' END
  FROM _role_sales_collapsed;

DROP TABLE _role_sales_collapsed;

-- ── ③ 「フルアクセス」型を新設。全7区画（凍結4アプリを含む）を manager ──
-- 旧の5型は「案件だけ」「経理だけ」のように意図的にレベルを割っていたが、
-- 実態は「原則チームメンバーはフルアクセス」（ユーザーの説明）なので、
-- 型の基本形はこの1つにする。
INSERT INTO permission_roles (id, name, description, is_builtin, sort_order) VALUES
  ('role-full-access', 'フルアクセス', 'チームメンバーの既定。すべてのアプリを管理できる', TRUE, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO permission_role_modules (role_id, module, access_level)
SELECT 'role-full-access', m, 'manager'
  FROM unnest(ARRAY['sales', 'equipment', 'dailyops', 'qsheet', 'techsheet', 'liveops', 'awards']) AS m
ON CONFLICT (role_id, module) DO UPDATE SET access_level = 'manager';

-- ── ④ 旧5つの組み込み型を押されていた人を「フルアクセス」へ移す ────────
-- 型を押してもらっていた＝実業務で使う正規メンバーだった、というシグナルとして
-- 扱う。カスタム型（is_builtin=FALSE）を押されていた人は対象外
-- （管理者が意図して絞った可能性があるため、その型の定義は②で統合済みのまま
-- 維持し、割り当ても変えない）。
UPDATE users SET permission_role_id = 'role-full-access', updated_at = NOW()
 WHERE permission_role_id IN ('role-admin', 'role-sales-mgr', 'role-sales', 'role-prod', 'role-account')
   AND deleted_at IS NULL;

INSERT INTO user_permissions (id, user_id, module, access_level)
SELECT gen_random_uuid()::text, u.id, m, 'manager'
  FROM users u, unnest(ARRAY['sales', 'equipment', 'dailyops', 'qsheet', 'techsheet', 'liveops', 'awards']) AS m
 WHERE u.permission_role_id = 'role-full-access' AND u.deleted_at IS NULL
ON CONFLICT (user_id, module) DO UPDATE SET access_level = 'manager', updated_at = NOW();

-- 旧5つの組み込み型は、もう誰にも押されていないので消す（履歴は permission_roles
-- の deleted_at で追える。列は残す＝物理削除しない）
UPDATE permission_roles SET deleted_at = NOW()
 WHERE id IN ('role-admin', 'role-sales-mgr', 'role-sales', 'role-prod', 'role-account');

-- ── ⑤ 型を押されていない・個人設定だけの人に、その実効プロファイルを
--      そのまま captures する型を自動生成して割り当てる ────────────────
-- 「一部だけ特定アプリに絞った臨時アクセス」の実例とみなす。実際の
-- user_permissions の中身は1文字も変えない（型の割り当ては記録のためだけ）。
CREATE TEMP TABLE _needs_role AS
SELECT u.id AS user_id,
       string_agg(up.module || ':' || up.access_level, ',' ORDER BY up.module) AS signature
  FROM users u
  JOIN user_permissions up ON up.user_id = u.id
 WHERE u.permission_role_id IS NULL
   AND u.deleted_at IS NULL
 GROUP BY u.id;

CREATE TEMP TABLE _generated_roles AS
SELECT signature, 'role-migrated-' || substr(md5(signature), 1, 10) AS role_id,
       ROW_NUMBER() OVER (ORDER BY signature) AS n
  FROM (SELECT DISTINCT signature FROM _needs_role) s;

INSERT INTO permission_roles (id, name, description, is_builtin, sort_order)
SELECT role_id,
       '限定アクセス（自動移行 ' || n || '）',
       '権限モデル単純化（migration 210）で、個人ごとの例外設定から自動生成した型です。中身を確認し、必要なら名前を付け直してください。',
       FALSE, 1000 + n
  FROM _generated_roles;

INSERT INTO permission_role_modules (role_id, module, access_level)
SELECT g.role_id, split_part(pair, ':', 1), split_part(pair, ':', 2)
  FROM _generated_roles g,
       LATERAL unnest(string_to_array(g.signature, ',')) AS pair;

UPDATE users u SET permission_role_id = g.role_id, updated_at = NOW()
  FROM _needs_role n JOIN _generated_roles g ON g.signature = n.signature
 WHERE u.id = n.user_id;

DROP TABLE _needs_role;
DROP TABLE _generated_roles;
