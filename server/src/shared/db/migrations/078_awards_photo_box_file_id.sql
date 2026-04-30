-- 078: awards_entries に photo_box_file_id を追加（BOX ミラー保存対応）
-- アップロード時に BOX へも mirror upload し、ローカルキャッシュ消失時の復元キーとして利用する。
ALTER TABLE awards_entries ADD COLUMN IF NOT EXISTS photo_box_file_id VARCHAR(50);
