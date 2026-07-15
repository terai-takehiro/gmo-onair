-- 124: マイカレンダー Outlook (Microsoft 365) カレンダー OAuth 連携
--
-- v2.9.190 の Google OAuth 連携の Microsoft 版。会社の Microsoft 365 テナントが
-- ICS 公開を禁止していても、Microsoft Graph の OAuth (委任・Calendars.Read) で
-- ユーザー本人のカレンダーを取り込む。
--   ・personal_ms_accounts — ユーザーごとの OAuth 連携 (refresh_token は暗号化保存)
--   ・personal_events に ms_account_id を追加 (source='outlook' の取込分を紐づけ)
--   ・source CHECK を 'outlook' 追加に拡張
--
-- 構造は personal_google_accounts (migration 123) と対称。

-- 1. Outlook 連携アカウント (ユーザーごと 1 件)
CREATE TABLE IF NOT EXISTS personal_ms_accounts (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL UNIQUE REFERENCES users(id),
  ms_email           TEXT,
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

CREATE INDEX IF NOT EXISTS idx_personal_ms_accounts_user
  ON personal_ms_accounts(user_id) WHERE deleted_at IS NULL;

-- 2. personal_events に Outlook 連携由来の予定を紐づける列
ALTER TABLE personal_events ADD COLUMN IF NOT EXISTS ms_account_id TEXT;

-- Graph event.id を ics_key に使い重複排除 (google/feed 系とは独立の partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_events_ms_key
  ON personal_events(ms_account_id, ics_key)
  WHERE ms_account_id IS NOT NULL AND deleted_at IS NULL;

-- 3. source CHECK を 'outlook' を含むよう拡張 (既存行は manual/ics/google のみなので無条件安全)
ALTER TABLE personal_events DROP CONSTRAINT IF EXISTS personal_events_source_check;
ALTER TABLE personal_events ADD CONSTRAINT personal_events_source_check
  CHECK (source IN ('manual','ics','google','outlook'));
