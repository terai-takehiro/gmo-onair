-- 123: マイカレンダー Google カレンダー OAuth 連携
--
-- v2.9.186 の ICS 購読 (公開 URL) は会社 Google Workspace のポリシーで外部公開が
-- 無効化されていると使えないため、OAuth (calendar.readonly) でユーザー本人の
-- Google カレンダーを取り込む経路を追加する。
--   ・personal_google_accounts — ユーザーごとの OAuth 連携 (refresh_token は暗号化保存)
--   ・personal_events に google_account_id を追加 (source='google' の取込分を紐づけ)
--   ・source CHECK を 'google' 追加に拡張
--
-- 全員同一 Workspace のため Google Cloud の OAuth アプリは Internal 種別で審査不要。

-- 1. Google 連携アカウント (ユーザーごと 1 件)
CREATE TABLE IF NOT EXISTS personal_google_accounts (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL UNIQUE REFERENCES users(id),
  google_email       TEXT,
  refresh_token_enc  TEXT NOT NULL,                    -- AES-256-GCM 暗号化 (iv:authTag:cipher hex)
  access_token_enc   TEXT,                             -- キャッシュ (失効時のみ再取得)
  token_expiry       TIMESTAMP,
  enabled            INTEGER NOT NULL DEFAULT 1,
  last_synced_at     TIMESTAMP,
  last_error         TEXT,
  event_count        INTEGER,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personal_google_accounts_user
  ON personal_google_accounts(user_id) WHERE deleted_at IS NULL;

-- 2. personal_events に Google 連携由来の予定を紐づける列
ALTER TABLE personal_events ADD COLUMN IF NOT EXISTS google_account_id TEXT;

-- Google event.id を ics_key に使い重複排除 (feed_id 系とは独立の partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_events_google_key
  ON personal_events(google_account_id, ics_key)
  WHERE google_account_id IS NOT NULL AND deleted_at IS NULL;

-- 3. source CHECK を 'google' を含むよう拡張 (既存行は manual/ics のみなので無条件安全)
ALTER TABLE personal_events DROP CONSTRAINT IF EXISTS personal_events_source_check;
ALTER TABLE personal_events ADD CONSTRAINT personal_events_source_check
  CHECK (source IN ('manual','ics','google'));
