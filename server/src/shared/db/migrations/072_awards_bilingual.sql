-- 072: awards_entries にバイリンガル + 画像ID列を追加
ALTER TABLE awards_entries ADD COLUMN IF NOT EXISTS name_en  VARCHAR(300);
ALTER TABLE awards_entries ADD COLUMN IF NOT EXISTS org_en   VARCHAR(300);
ALTER TABLE awards_entries ADD COLUMN IF NOT EXISTS image_id VARCHAR(200);
