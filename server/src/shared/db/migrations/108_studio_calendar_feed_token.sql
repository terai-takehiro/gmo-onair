-- 108: スタジオ予約 カレンダー連携フィードトークンの永続化
-- 従来は環境変数 ICAL_FEED_TOKEN を手動設定する方式だったため、未設定のまま
-- カレンダー連携 (Google Calendar / Outlook への .ics フィード) が機能しないケースがあった。
-- DB にトークンを保持し、未生成なら初回アクセス時に自動発行する方式に変更する。
CREATE TABLE IF NOT EXISTS studio_calendar_settings (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  feed_token TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (id = 1)
);
