-- 071: awards_entries に自社票ポイント列を追加
ALTER TABLE awards_entries ADD COLUMN IF NOT EXISTS own_points INTEGER;
