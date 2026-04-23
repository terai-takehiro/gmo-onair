-- 018: スタジオロケーション名を正式名称に変更
-- 用賀スタジオ → GMOグローバルスタジオ
-- 渋谷スタジオ → GMOサムライコンテンツスタジオ渋谷

UPDATE studio_locations SET name = 'GMOグローバルスタジオ' WHERE name = '用賀スタジオ';
UPDATE studio_locations SET name = 'GMOサムライコンテンツスタジオ渋谷' WHERE name = '渋谷スタジオ';
