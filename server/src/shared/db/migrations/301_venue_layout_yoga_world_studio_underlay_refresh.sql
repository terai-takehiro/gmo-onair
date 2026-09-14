-- ============================================================
-- 301: 制作技術支援 — 会場図面 用賀26F WORLD STUDIO の下敷き画像を差し替え
--
-- 300 で階全体の下敷き（floor-26f/27f）は清書版に差し替えたが、
-- エリア別の下敷き（WORLD STUDIO の world-26f.png）は対象外だった
-- ため、そこだけ旧画像（文字が読めない・切れている）が残っていた
-- （利用者からのご指摘）。300 と同じ新原図・同じ校正（calibration）
-- から、WORLD STUDIO のエリアの mm 窓（originMm）はそのまま保ち、
-- 高解像度で再切り出しした。widthPx/heightPx/pxPerMmX/pxPerMmY だけ
-- 実寸に更新する。ファイル名は 300 と同様の理由（静的配信の1年
-- キャッシュ）で -v2 にしてキャッシュバストする。
-- LEDウォール・トラス脚10本の bboxMm を新画像に重ねて位置が一致
-- することを確認済み。
--
-- LOUNGE STUDIO・パントリー（lounge-27f.png）はこの時点で既に
-- 判読できる画像だったため対象外（利用者からの指摘も無い）。
-- ============================================================

UPDATE qsheet_venue_areas
SET underlay = '{"file": "/venue/world-26f-v2.png", "originMm": {"x": 12193, "y": 10995}, "pxPerMmX": 0.043953, "pxPerMmY": 0.045855, "widthPx": 897, "heightPx": 1083}'::jsonb
WHERE id = 'venue-yoga-26f-world-studio';
