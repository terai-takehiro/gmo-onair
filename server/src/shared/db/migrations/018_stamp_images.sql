-- Phase 7: スタンプ画像URL対応
-- interactive_stampsテーブルにimage_urlカラムを追加
-- 画像はbase64 data URLまたはhttps URLを格納

ALTER TABLE interactive_stamps
  ADD COLUMN IF NOT EXISTS image_url TEXT;
