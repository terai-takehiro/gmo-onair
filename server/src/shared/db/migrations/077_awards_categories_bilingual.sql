-- 077: awards_categories に英語名・英語説明を追加（バイリンガル CG 出力対応）
ALTER TABLE awards_categories ADD COLUMN IF NOT EXISTS name_en        VARCHAR(200);
ALTER TABLE awards_categories ADD COLUMN IF NOT EXISTS description_en TEXT;
