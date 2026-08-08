-- 役割 (権限の「型」) — v4 設定 ③ 権限とメンバー
--
-- ── なぜ「型」にとどめるのか ────────────────────────────────
--
-- モックは **役割5種 × 権限8項目 × 3段** で、権限は役割にだけ付きます。
-- いまの ONAiR は **人ごとに 12 区画 × 5 段** を持ち、その判定が
-- **311 か所**にあります。判定そのものを役割ベースに置き換えると、
-- 1 か所でも取りこぼすと「開けない（仕事が止まる）」か
-- 「見えてはいけないものが見える（漏れる）」のどちらかになります。
--
-- そこで**役割は `user_permissions` へ押す型**として持ちます。
--   - 判定は 1 か所も変えない（`requirePermission` はいままでどおり
--     `user_permissions` だけを見る）
--   - 凍結 4 アプリの権限 (`qsheet` / `techsheet` / `liveops` / `awards`) も
--     そのまま残る。モックの 8 項目にはこの 4 つが無いので、
--     項目ごと置き換えると凍結アプリの入口が誰でも通るか誰も通れなくなる
--   - 「この人だけ例外」も引き続きできる（型を押したあとに個別で直せる）
--
-- ── なぜ画面の行が 8 ではなく 12 なのか ─────────────────────
--
-- モックの 8 項目のうち **案件の作成・編集 / 見積の作成・編集 / 工程とタスク /
-- 料金表マスター の 4 つは、実装ではすべて同じ `sales` 権限**です。
-- 8 行に分けて出すと「見積だけ見るだけにした」つもりが案件も工程も変わります。
-- **押した覚えのないものが変わるほうが害が大きい**ので、行は実装の区画
-- (12) に合わせ、ラベルを業務の言葉にします。
--
-- ── `users.role` とは別物 ───────────────────────────────────
--
-- `users.role` は `system_admin` / `staff` の**システム上の区別**で、
-- `system_admin` はすべての判定を素通りします。ここで足すのは業務上の役割
-- なので、混ざらないように列名を `permission_role_id` にしています。

CREATE TABLE IF NOT EXISTS permission_roles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  -- 初期の5つ。名前と説明は直せるが**消せない**（消すと押した人の
  -- 権限が誰の型から来たのか分からなくなる）
  is_builtin  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- 型の中身。**ここに行が無い区画 = 権限なし**（`user_permissions` と同じ約束）
CREATE TABLE IF NOT EXISTS permission_role_modules (
  role_id      TEXT NOT NULL REFERENCES permission_roles(id) ON DELETE CASCADE,
  module       TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('reader', 'editor', 'manager')),
  PRIMARY KEY (role_id, module)
);

-- 誰にどの型を押したか。**権限の正は `user_permissions` のまま**で、
-- この列は「どの型を押したか」の記録（一覧の絞り込みと、型を直したときに
-- 「この役割の人 N 名にも反映しますか」と訊くために要る）。
-- 型を押したあとに個別で直すと中身はずれる。ずれは画面に出す
ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_role_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_permission_role_id_fkey') THEN
    -- 型を消しても人は消さない。ON DELETE SET NULL
    ALTER TABLE users ADD CONSTRAINT users_permission_role_id_fkey
      FOREIGN KEY (permission_role_id) REFERENCES permission_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_permission_role ON users(permission_role_id);

-- ── 初期の5役割（モックの ROLES／PERMS を 12 区画へ写したもの）──────
--
-- モックの PERMS は 直せる／見るだけ／なし の3段。ONAiR の3段は
-- 管理(manager)／編集(editor)／閲覧(reader) なので、
--   直せる  → editor  （「管理」は設定まで触れる段なので、既定では渡さない）
--   見るだけ → reader
--   なし    → 行を作らない
-- とします。**管理者だけ manager**。
--
-- 凍結4アプリ (qsheet / techsheet / liveops / awards) はモックに項目が無いので
-- **どの型にも入れません**。いま持っている人の権限は個別に残ります
-- （型を押しても消えない — 下の service 側で「型が触るのは型が持つ区画だけ」）。

INSERT INTO permission_roles (id, name, description, is_builtin, sort_order) VALUES
  ('role-admin',     '管理者',     'すべてを見て直せる',       TRUE, 1),
  ('role-sales-mgr', '営業管理者', '見積・料金表まで直せる',   TRUE, 2),
  ('role-sales',     '営業担当',   '自分の案件を作る・直す',   TRUE, 3),
  ('role-prod',      '制作・技術', '工程と機材を動かす',       TRUE, 4),
  ('role-account',   '経理',       '請求と入金を扱う',         TRUE, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO permission_role_modules (role_id, module, access_level) VALUES
  -- 管理者 — すべて manager
  ('role-admin', 'sales', 'manager'),
  ('role-admin', 'budget', 'manager'),
  ('role-admin', 'gpm', 'manager'),
  ('role-admin', 'studio', 'manager'),
  ('role-admin', 'partner_schedule', 'manager'),
  ('role-admin', 'equipment', 'manager'),
  ('role-admin', 'dailyops', 'manager'),
  ('role-admin', 'admin', 'manager'),

  -- 営業管理者 — 案件・見積・工程・料金表・予約を直せる／請求と機材は見るだけ
  ('role-sales-mgr', 'sales', 'editor'),
  ('role-sales-mgr', 'gpm', 'editor'),
  ('role-sales-mgr', 'studio', 'editor'),
  ('role-sales-mgr', 'partner_schedule', 'editor'),
  ('role-sales-mgr', 'budget', 'reader'),
  ('role-sales-mgr', 'equipment', 'reader'),
  ('role-sales-mgr', 'dailyops', 'editor'),

  -- 営業担当 — 案件と見積は直せる／工程・予約・機材・請求は見るだけ
  ('role-sales', 'sales', 'editor'),
  ('role-sales', 'gpm', 'reader'),
  ('role-sales', 'studio', 'reader'),
  ('role-sales', 'partner_schedule', 'reader'),
  ('role-sales', 'budget', 'reader'),
  ('role-sales', 'equipment', 'reader'),
  ('role-sales', 'dailyops', 'editor'),

  -- 制作・技術 — 工程・予約・機材を動かす／案件と見積は見るだけ／料金表と請求はなし
  ('role-prod', 'sales', 'reader'),
  ('role-prod', 'gpm', 'editor'),
  ('role-prod', 'studio', 'editor'),
  ('role-prod', 'partner_schedule', 'editor'),
  ('role-prod', 'equipment', 'editor'),
  ('role-prod', 'dailyops', 'editor'),

  -- 経理 — 請求・入金を直せる／案件・予約・機材は見るだけ／工程はなし
  ('role-account', 'sales', 'reader'),
  ('role-account', 'budget', 'editor'),
  ('role-account', 'studio', 'reader'),
  ('role-account', 'equipment', 'reader'),
  ('role-account', 'dailyops', 'editor')
ON CONFLICT (role_id, module) DO NOTHING;
