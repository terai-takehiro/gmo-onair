-- ========================================================
-- モジュール別パーミッション
-- ========================================================

CREATE TABLE IF NOT EXISTS user_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'viewer' CHECK(access_level IN ('viewer', 'editor', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);

-- モジュール一覧:
--   sales        - 営業（案件管理/ダッシュボード/顧客/料金表）
--   budget       - 予算（売上/仕入/販管費/仕入先/パートナー/レポート）
--   studio       - スタジオ（カレンダー/予約）
--   equipment    - 機材管理
--   admin        - 管理（ユーザー管理/データビューア）
