-- ========================================================
-- モジュール別パーミッション
-- ========================================================

CREATE TABLE IF NOT EXISTS user_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'view' CHECK(access_level IN ('view', 'edit', 'full')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);

-- モジュール一覧:
--   dashboard    - ダッシュボード
--   projects     - 案件管理
--   calendar     - スタジオ予約
--   equipment    - 機材管理
--   revenues     - 売上
--   purchases    - 仕入
--   sga          - 販管費
--   masters      - マスター（顧客/仕入先/パートナー/料金表）
--   reports      - レポート
--   admin        - 管理（ユーザー管理/データビューア）
