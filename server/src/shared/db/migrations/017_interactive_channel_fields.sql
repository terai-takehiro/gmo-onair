-- 017: interactive_events にチャンネル情報フィールド追加
-- (YouTube URL, バナー画像URL, 管理者コメント)

ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS admin_comment TEXT;
