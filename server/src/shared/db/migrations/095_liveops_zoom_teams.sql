-- ============================================================
-- Migration 095: liveops に Zoom / Teams 参加者カウントを追加
-- ============================================================

-- 番組設定に Zoom / Teams の識別子フィールドを追加
ALTER TABLE liveops_programs
  ADD COLUMN IF NOT EXISTS zoom_meeting_id  TEXT,   -- Zoom Meeting ID
  ADD COLUMN IF NOT EXISTS zoom_webinar_id  TEXT,   -- Zoom Webinar ID
  ADD COLUMN IF NOT EXISTS teams_meeting_url TEXT;  -- Teams 会議参加 URL (join link)

-- APIキー設定に Zoom / Teams 認証情報フィールドを追加
ALTER TABLE liveops_settings
  ADD COLUMN IF NOT EXISTS zoom_client_id_enc      TEXT,
  ADD COLUMN IF NOT EXISTS zoom_client_secret_enc  TEXT,
  ADD COLUMN IF NOT EXISTS zoom_account_id_enc     TEXT,
  ADD COLUMN IF NOT EXISTS teams_client_id_enc     TEXT,
  ADD COLUMN IF NOT EXISTS teams_client_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS teams_tenant_id_enc     TEXT;

-- スナップショットに Zoom / Teams カウントを追加
-- GENERATED ALWAYS AS 列は ALTER では変更不可のため DROP → zoom/teams 追加 → 再定義
ALTER TABLE liveops_snapshots DROP COLUMN IF EXISTS total_count;
ALTER TABLE liveops_snapshots
  ADD COLUMN IF NOT EXISTS zoom_count  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teams_count INT NOT NULL DEFAULT 0;
ALTER TABLE liveops_snapshots
  ADD COLUMN IF NOT EXISTS total_count INT
    GENERATED ALWAYS AS (youtube_count + jstream_count + zoom_count + teams_count) STORED;

-- Teams Webhook サブスクリプション永続化テーブル (再起動後の復元用)
CREATE TABLE IF NOT EXISTS liveops_teams_subscriptions (
  id          TEXT PRIMARY KEY,
  program_id  UUID NOT NULL REFERENCES liveops_programs(id) ON DELETE CASCADE,
  meeting_id  TEXT NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_liveops_teams_subs_program
  ON liveops_teams_subscriptions(program_id);
