-- 部屋の略称 (abbreviation) — カレンダーで複数部屋が並ぶ時に使用 (v2.7.5)
-- 未設定 (NULL) の場合は呼び出し側で部屋名先頭2文字等にフォールバック

ALTER TABLE studio_rooms ADD COLUMN IF NOT EXISTS abbreviation VARCHAR(20);
