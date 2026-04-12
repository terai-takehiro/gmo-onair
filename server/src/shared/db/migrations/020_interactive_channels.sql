-- 020: Interactive channels (多言語チャンネル) + accepting flag
-- 1イベントに複数チャンネル (日本語/英語等) を作成可能
-- チャンネルごとにYouTube URL・バナー・コメント・アンケートを個別設定

CREATE TABLE IF NOT EXISTS interactive_channels (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id TEXT NOT NULL REFERENCES interactive_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'デフォルト',
  language_code TEXT DEFAULT 'ja',
  youtube_url TEXT,
  banner_url TEXT,
  admin_comment TEXT,
  survey_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactive_channels_event ON interactive_channels(event_id);

-- 受付ON/OFF フラグ (スライドスイッチで制御)
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS accepting BOOLEAN NOT NULL DEFAULT false;
