-- ============================================================
-- 116: スタジオ施設名の変更 (v2.9.177)
--   GMOグローバルスタジオ                → GMOサムライスタジオ用賀
--   GMOサムライコンテンツスタジオ渋谷    → GMOサムライスタジオ渋谷
--   GMOサムライスタジオ青山              → 新設 (1スタジオのみ、部屋「STUDIO」1件)
-- 062_rename_studio_locations.sql と同方式 (名前一致で UPDATE)。
-- 062 未適用環境向けに旧名 (用賀スタジオ/渋谷スタジオ) もカバーする。
-- ============================================================

UPDATE studio_locations SET name = 'GMOサムライスタジオ用賀'
  WHERE name IN ('GMOグローバルスタジオ', '用賀スタジオ');

UPDATE studio_locations SET name = 'GMOサムライスタジオ渋谷'
  WHERE name IN ('GMOサムライコンテンツスタジオ渋谷', '渋谷スタジオ');

-- 青山 新設 (冪等)。外現場 (sort_order=3) の前に入るよう外現場を後ろへずらす
INSERT INTO studio_locations (id, name, sort_order)
VALUES ('loc-aoyama', 'GMOサムライスタジオ青山', 3)
ON CONFLICT (id) DO NOTHING;

UPDATE studio_locations SET sort_order = 4 WHERE id = 'loc-external' AND sort_order = 3;

-- 青山は1スタジオのみ (部屋の概念なし) だが、予約は部屋単位のモデルのため
-- 施設全体を表す部屋「STUDIO」を1件登録する
INSERT INTO studio_rooms (id, location_id, name, room_type, color, sort_order)
VALUES ('room-aoyama-studio', 'loc-aoyama', 'STUDIO', 'studio', '#16a34a', 1)
ON CONFLICT (id) DO NOTHING;
