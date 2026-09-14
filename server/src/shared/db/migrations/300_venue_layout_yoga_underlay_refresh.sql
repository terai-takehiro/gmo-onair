-- ============================================================
-- 300: 制作技術支援 — 会場図面 用賀 26F/27F の下敷き画像を差し替え
--
-- 利用者が用意した新しい原図（不要な注記を削除した清書）を基に、
-- 299 の下敷き PNG（420×584・文字が判読不能）を作り直した（1187×1650）。
-- 校正（calibration・グリッド線の PDF 座標）は新旧の原図で座標が一致した
-- ため据え置き、299 と同じ mm 窓（originMm）を保ったまま高解像度で
-- 再切り出しした。widthPx/heightPx/pxPerMmX/pxPerMmY だけを実寸に更新する。
-- fixtures（LEDウォール・トラス・ELV等）の bboxMm を新画像に重ねて位置が
-- 一致することを確認済み。ON CONFLICT ではなく UPDATE（299 は
-- ON CONFLICT DO NOTHING のため、既に流れた環境には効かない）。
-- ============================================================

UPDATE qsheet_venue_floors
SET underlay = '{"file": "/venue/floor-26f.png", "originMm": {"x": 4493, "y": -1525}, "pxPerMmX": 0.032973, "pxPerMmY": 0.03439, "widthPx": 1187, "heightPx": 1650}'::jsonb
WHERE id = 'venue-yoga-26f';

UPDATE qsheet_venue_floors
SET underlay = '{"file": "/venue/floor-27f.png", "originMm": {"x": 4493, "y": -1525}, "pxPerMmX": 0.032973, "pxPerMmY": 0.03439, "widthPx": 1187, "heightPx": 1650}'::jsonb
WHERE id = 'venue-yoga-27f';
