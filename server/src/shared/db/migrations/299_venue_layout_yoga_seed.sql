-- ============================================================
-- 299: 制作技術支援 — 会場図面の用賀マスタ（会場・階・エリア・固定物・備品カタログ）
--
-- 設計: docs/design/v4/venue-layout.md §10・§11。用賀の実データを流し込む。
-- 本番は SKIP_SEED=true のため、マスタは（テナント個別データではなく参照データとして）
-- migration で入れる。ON CONFLICT DO NOTHING で冪等（何度流しても増えない）。
-- 校正・エリア・固定物の実測値の根拠は venue-layout.md §10、備品カタログの根拠は §11。
-- 下敷き PNG 4枚は client-techops/public/venue/ に置く（§10-5）。
-- ============================================================

-- ── 階（用賀 26F・27F） ─────────────────────────────────────
INSERT INTO qsheet_venue_floors (id, venue_name, floor_label, grid, calibration, underlay, fixtures, verified_at, verified_by, sort_order)
VALUES ('venue-yoga-26f', 'GMOサムライスタジオ 用賀', '26F', '{"x": ["X16", "X15", "X14", "X13", "X12", "X11", "X10", "X9"], "y": ["Y16", "Y15", "Y14", "Y13", "Y12", "Y11", "Y10", "Y9"], "pitchMm": 6400, "totalMm": 44800, "subTickMm": {"x": [3200], "y": [1600, 4800]}, "extra": {"X12b": 22400, "Y14a": 11200, "note": "X12b は p-4 の中間通り芯(X13 と X12 の中央)。Y14a は p-4 の補助線で Y14 の 1600 北と推定"}}'::jsonb, '{"mmPerPtX": 63.199, "mmPerPtY": 60.577, "originPt": {"x": 26.56, "y": 208.27}, "gridLinePt": {"X16": 26.56, "X9": 735.43, "Y16": 208.27, "Y9": 947.82}, "method": "p-2 と同じ値。p-1 は文字が抽出できないため、p-1 と p-2 を 144dpi で描画して壁の列・行の濃度分布を相互相関した結果、ずれ −1〜+2px(0.5〜1pt 以下)＝同一配置。LED ウォール幅 8530.2 の描画幅(135.0pt→8532mm)でも X 縮尺が一致。**p-1 上端の X16〜X9 ラベル列は 648.9pt 幅(69.0mm/pt)で建物と合わない飾り。校正に使ってはいけない**"}'::jsonb, '{"file": "/venue/floor-26f.png", "originMm": {"x": 4493, "y": -1525}, "pxPerMmX": 0.011667, "pxPerMmY": 0.012172, "widthPx": 420, "heightPx": 584}'::jsonb, '[{"key": "led-wall", "floor": "26f", "area": "world-studio", "label": "LEDウォール", "kind": "wall", "bboxMm": {"x": 18135, "y": 30150, "w": 8530, "h": 150}, "sizeMm": {"w": 8530.2, "h": 4876.8}, "estimated": true, "note": "幅 8530.2 は図の寸法、中心は X12b(22400)。4876.8 は壁の高さ(縦)で、平面図には立面の絵が y 25460〜30150 に貼られている。平面上の壁の位置はトラス南列(y≈30300)に吊ると読み、厚み 150 は仮置き。断面(p-3)で下端 ▽26FL、上端は ▽27FL とほぼ同じ高さ"}, {"key": "truss", "floor": "26f", "area": "world-studio", "label": "450角パワートラス", "kind": "truss", "bboxMm": {"x": 17495, "y": 17248, "w": 9810, "h": 13250}, "legSizeMm": 450, "legsMm": [{"cx": 17720, "cy": 17473}, {"cx": 27080, "cy": 17473}, {"cx": 17720, "cy": 20673}, {"cx": 27080, "cy": 20673}, {"cx": 17720, "cy": 23873}, {"cx": 27080, "cy": 23873}, {"cx": 17720, "cy": 27073}, {"cx": 27080, "cy": 27073}, {"cx": 17720, "cy": 30273}, {"cx": 27080, "cy": 30273}], "topChordNodeOffsetsMm": [0, 3095, 6265, 9360], "rowPitchMm": 3200, "heightMm": 7100, "estimated": true, "note": "外寸 9810×13250 は p-4 の寸法(450/2645/450/2720/450/2645/450 ＝ 9810、450+2750 ×4+450 ＝ 13250)。脚は各列2本(東西)×5列＝10本で p-1 の10個の■と一致。中央の2節点は上弦材のみ(p-3 A-A 断面)。高さ 7100 と y 位置(Y14 の 1600 北の補助線 11200 から 6048)は p-3/p-4 の画素から推定"}, {"key": "spiral-stair", "floor": "26f", "area": "sky-studio", "label": "らせん階段（既存）", "kind": "stair", "bboxMm": {"x": 14490, "y": 3950, "w": 3070, "h": 5690}, "sizeMm": {"w": 3200, "h": 5360}, "note": "p-2 に 既存3200・既存5360 の寸法。bbox は目視(±100)。26F〜27F をつなぐ"}, {"key": "elv13", "floor": "both", "area": null, "label": "ELV13（搬入用）", "kind": "elevator", "bboxMm": {"x": 9995, "y": 37700, "w": 1850, "h": 2010}, "sizeMm": {"w": 1850, "d": 2010, "h": 2770}, "loadKg": 2150, "note": "かご内寸 1850×2010・高さ 2770・積載 2150kg は図の記載。扉は西側(搬入ルート側)。図の矩形の奥行は 1740 程度で 2010 より短い(扉・敷居を含む寸法と読む)"}, {"key": "loading-route", "floor": "26f", "area": null, "label": "搬入ルート", "kind": "route", "polylineMm": [[8790, 36630], [8790, 38680], [9995, 38680]], "estimated": true, "note": "p-1 の赤い矢印。西側の附室・PS 脇の通路(x≈8800)を南下し ELV13 へ。屋上側の出入口からの経路は図にない"}, {"key": "elv12", "floor": "both", "label": "ELV12", "kind": "elevator", "bboxMm": {"x": 23320, "y": 37440, "w": 2000, "h": 2000}, "estimated": true, "note": "ELVホール西列・北"}, {"key": "elv11", "floor": "both", "label": "ELV11", "kind": "elevator", "bboxMm": {"x": 23320, "y": 40290, "w": 2000, "h": 1900}, "estimated": true, "note": "ELVホール西列・中"}, {"key": "elv10", "floor": "both", "label": "ELV10", "kind": "elevator", "bboxMm": {"x": 23320, "y": 42630, "w": 2000, "h": 1900}, "estimated": true, "note": "ELVホール西列・南"}, {"key": "elv9", "floor": "both", "label": "ELV9", "kind": "elevator", "bboxMm": {"x": 29080, "y": 37440, "w": 2100, "h": 2000}, "estimated": true, "note": "ELVホール東列・北"}, {"key": "elv8", "floor": "both", "label": "ELV8", "kind": "elevator", "bboxMm": {"x": 29080, "y": 40290, "w": 2100, "h": 1900}, "estimated": true, "note": "ELVホール東列・中"}, {"key": "elv7", "floor": "both", "label": "ELV7", "kind": "elevator", "bboxMm": {"x": 29080, "y": 42630, "w": 2100, "h": 1900}, "estimated": true, "note": "ELVホール東列・南"}, {"key": "elv14", "floor": "both", "label": "ELV14", "kind": "elevator", "bboxMm": {"x": 32570, "y": 37440, "w": 2100, "h": 2000}, "estimated": true, "note": "東の附室の隣(非常用と推定・用途は図に無い)"}, {"key": "stair-a", "floor": "both", "label": "階段室A", "kind": "stair", "bboxMm": {"x": 32050, "y": 40950, "w": 3670, "h": 3850}, "estimated": true, "note": "南東"}, {"key": "stair-b", "floor": "both", "label": "階段室B", "kind": "stair", "bboxMm": {"x": 9180, "y": 40950, "w": 3665, "h": 3850}, "estimated": true, "note": "南西"}, {"key": "stair-c", "floor": "both", "label": "階段室C", "kind": "stair", "bboxMm": {"x": 30760, "y": -570, "w": 4540, "h": 5520}, "estimated": true, "note": "北東。建物は Y16 より北に約 750 出ている"}, {"key": "stair-d", "floor": "both", "label": "階段室D", "kind": "stair", "bboxMm": {"x": 9250, "y": -570, "w": 4540, "h": 5520}, "estimated": true, "note": "北西"}]'::jsonb, NOW(), NULL, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO qsheet_venue_floors (id, venue_name, floor_label, grid, calibration, underlay, fixtures, verified_at, verified_by, sort_order)
VALUES ('venue-yoga-27f', 'GMOサムライスタジオ 用賀', '27F', '{"x": ["X16", "X15", "X14", "X13", "X12", "X11", "X10", "X9"], "y": ["Y16", "Y15", "Y14", "Y13", "Y12", "Y11", "Y10", "Y9"], "pitchMm": 6400, "totalMm": 44800, "subTickMm": {"x": [3200], "y": [1600, 4800]}, "extra": {"X12b": 22400, "Y14a": 11200, "note": "X12b は p-4 の中間通り芯(X13 と X12 の中央)。Y14a は p-4 の補助線で Y14 の 1600 北と推定"}}'::jsonb, '{"mmPerPtX": 63.199, "mmPerPtY": 60.577, "originPt": {"x": 26.56, "y": 208.27}, "gridLinePt": {"X16": 26.56, "X9": 735.43, "Y16": 208.27, "Y9": 947.82}, "method": "page2.svg の赤い一点鎖線(stroke rgb(94.75%,31.76%,23.37%)・dasharray 42.52…)の通り芯線の座標。X16=26.56pt, X9=735.43pt(差 708.87pt)、Y16=208.27pt, Y9=947.82pt(差 739.55pt)。pdftotext のラベル中心(27.18/736.39/207.97/947.78)とは 0.6pt 以内で一致"}'::jsonb, '{"file": "/venue/floor-27f.png", "originMm": {"x": 4493, "y": -1525}, "pxPerMmX": 0.011667, "pxPerMmY": 0.012172, "widthPx": 420, "heightPx": 584}'::jsonb, '[{"key": "blackout-screen", "floor": "27f", "area": "atrium-north", "label": "遮光ロールスクリーン", "kind": "screen", "lineMm": [[13850, 2543], [31060, 2543]], "note": "p-2 の吹き抜け北辺の線(250.25pt)。26F では同じ線が SKY STUDIO の窓壁"}, {"key": "auto-door", "floor": "27f", "area": "lounge-studio", "label": "自動ドア", "kind": "door", "bboxMm": {"x": 29000, "y": 12900, "w": 2100, "h": 160}, "estimated": true, "note": "LOUNGE STUDIO 北壁。通路側から入る"}, {"key": "wine-cellar", "floor": "27f", "area": "lounge-studio", "label": "ワインセラー", "kind": "furniture", "bboxMm": {"x": 35000, "y": 12000, "w": 900, "h": 980}, "estimated": true, "note": "ラウンジ北東角。目視"}, {"key": "elv13", "floor": "both", "area": null, "label": "ELV13（搬入用）", "kind": "elevator", "bboxMm": {"x": 9995, "y": 37700, "w": 1850, "h": 2010}, "sizeMm": {"w": 1850, "d": 2010, "h": 2770}, "loadKg": 2150, "note": "かご内寸 1850×2010・高さ 2770・積載 2150kg は図の記載。扉は西側(搬入ルート側)。図の矩形の奥行は 1740 程度で 2010 より短い(扉・敷居を含む寸法と読む)"}, {"key": "elv12", "floor": "both", "label": "ELV12", "kind": "elevator", "bboxMm": {"x": 23320, "y": 37440, "w": 2000, "h": 2000}, "estimated": true, "note": "ELVホール西列・北"}, {"key": "elv11", "floor": "both", "label": "ELV11", "kind": "elevator", "bboxMm": {"x": 23320, "y": 40290, "w": 2000, "h": 1900}, "estimated": true, "note": "ELVホール西列・中"}, {"key": "elv10", "floor": "both", "label": "ELV10", "kind": "elevator", "bboxMm": {"x": 23320, "y": 42630, "w": 2000, "h": 1900}, "estimated": true, "note": "ELVホール西列・南"}, {"key": "elv9", "floor": "both", "label": "ELV9", "kind": "elevator", "bboxMm": {"x": 29080, "y": 37440, "w": 2100, "h": 2000}, "estimated": true, "note": "ELVホール東列・北"}, {"key": "elv8", "floor": "both", "label": "ELV8", "kind": "elevator", "bboxMm": {"x": 29080, "y": 40290, "w": 2100, "h": 1900}, "estimated": true, "note": "ELVホール東列・中"}, {"key": "elv7", "floor": "both", "label": "ELV7", "kind": "elevator", "bboxMm": {"x": 29080, "y": 42630, "w": 2100, "h": 1900}, "estimated": true, "note": "ELVホール東列・南"}, {"key": "elv14", "floor": "both", "label": "ELV14", "kind": "elevator", "bboxMm": {"x": 32570, "y": 37440, "w": 2100, "h": 2000}, "estimated": true, "note": "東の附室の隣(非常用と推定・用途は図に無い)"}, {"key": "stair-a", "floor": "both", "label": "階段室A", "kind": "stair", "bboxMm": {"x": 32050, "y": 40950, "w": 3670, "h": 3850}, "estimated": true, "note": "南東"}, {"key": "stair-b", "floor": "both", "label": "階段室B", "kind": "stair", "bboxMm": {"x": 9180, "y": 40950, "w": 3665, "h": 3850}, "estimated": true, "note": "南西"}, {"key": "stair-c", "floor": "both", "label": "階段室C", "kind": "stair", "bboxMm": {"x": 30760, "y": -570, "w": 4540, "h": 5520}, "estimated": true, "note": "北東。建物は Y16 より北に約 750 出ている"}, {"key": "stair-d", "floor": "both", "label": "階段室D", "kind": "stair", "bboxMm": {"x": 9250, "y": -570, "w": 4540, "h": 5520}, "estimated": true, "note": "北西"}]'::jsonb, NOW(), NULL, 1)
ON CONFLICT (id) DO NOTHING;

-- ── エリア（各階の区画。§10-2） ─────────────────────────────
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-26f-world-studio', 'venue-yoga-26f', 'world-studio', 'WORLD STUDIO', '{"x": 13680, "y": 11900, "w": 17440, "h": 18480}'::jsonb, '[[13680, 11900], [31120, 11900], [31120, 30380], [13680, 30380]]'::jsonb, 322.3, NULL, '{"file": "/venue/world-26f.png", "originMm": {"x": 12193, "y": 10995}, "pxPerMmX": 0.039216, "pxPerMmY": 0.040913, "widthPx": 800, "heightPx": 966}'::jsonb, false, 0)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-26f-sky-studio', 'venue-yoga-26f', 'sky-studio', 'SKY STUDIO', '{"x": 13680, "y": 3070, "w": 17440, "h": 8696}'::jsonb, '[[13680, 3070], [31120, 3070], [31120, 11766], [13680, 11766]]'::jsonb, 151.7, NULL, NULL, false, 1)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-26f-control-room-1', 'venue-yoga-26f', 'control-room-1', '第1調整室', '{"x": 10960, "y": 11826, "w": 2560, "h": 8936}'::jsonb, '[[10960, 11826], [13520, 11826], [13520, 20762], [10960, 20762]]'::jsonb, 22.9, NULL, NULL, false, 2)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-26f-control-room-2', 'venue-yoga-26f', 'control-room-2', '第2調整室', '{"x": 10960, "y": 20913, "w": 2560, "h": 2423}'::jsonb, '[[10960, 20913], [13520, 20913], [13520, 23336], [10960, 23336]]'::jsonb, 6.2, NULL, NULL, false, 3)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-26f-machine-room', 'venue-yoga-26f', 'machine-room', 'マシンルーム', '{"x": 10960, "y": 23488, "w": 2560, "h": 4785}'::jsonb, '[[10960, 23488], [13520, 23488], [13520, 28273], [10960, 28273]]'::jsonb, 12.2, NULL, NULL, false, 4)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-26f-network-room', 'venue-yoga-26f', 'network-room', 'ネットワークルーム', '{"x": 10960, "y": 28273, "w": 2560, "h": 2575}'::jsonb, '[[10960, 28273], [13520, 28273], [13520, 30848], [10960, 30848]]'::jsonb, 6.6, NULL, NULL, false, 5)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-26f-tech-storage', 'venue-yoga-26f', 'tech-storage', '制作/技術倉庫', '{"x": 31280, "y": 11826, "w": 3823, "h": 21051}'::jsonb, '[[31280, 11826], [35103, 11826], [35103, 32877], [31280, 32877]]'::jsonb, 80.5, NULL, NULL, false, 6)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-26f-elv-hall-26f', 'venue-yoga-26f', 'elv-hall-26f', 'ELVホール', '{"x": 25313, "y": 36760, "w": 3768, "h": 8040}'::jsonb, '[[25313, 36760], [29081, 36760], [29081, 44800], [25313, 44800]]'::jsonb, 30.3, NULL, NULL, false, 7)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-corridor-27f', 'venue-yoga-27f', 'corridor-27f', '通路', '{"x": 13850, "y": 9680, "w": 16500, "h": 1970}'::jsonb, '[[13850, 9680], [30350, 9680], [30350, 11650], [13850, 11650]]'::jsonb, 32.5, NULL, NULL, false, 0)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-atrium-north', 'venue-yoga-27f', 'atrium-north', '吹き抜け（北・SKY STUDIO 上）', '{"x": 13680, "y": 2590, "w": 17440, "h": 6830}'::jsonb, '[[13680, 2590], [31120, 2590], [31120, 9420], [13680, 9420]]'::jsonb, 119.1, NULL, NULL, false, 1)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-atrium-center', 'venue-yoga-27f', 'atrium-center', '吹き抜け（中央・WORLD STUDIO 上）', '{"x": 14400, "y": 11900, "w": 14080, "h": 20300}'::jsonb, '[[14400, 11900], [28480, 11900], [28480, 32200], [14400, 32200]]'::jsonb, 285.8, NULL, NULL, true, 2)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-west-corridor-27f', 'venue-yoga-27f', 'west-corridor-27f', '西側通路（27F）', '{"x": 13460, "y": 11900, "w": 940, "h": 21100}'::jsonb, '[[13460, 11900], [14400, 11900], [14400, 33000], [13460, 33000]]'::jsonb, 19.8, NULL, NULL, true, 3)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-meeting-room', 'venue-yoga-27f', 'meeting-room', 'MEETING ROOM', '{"x": 6380, "y": 11990, "w": 7080, "h": 3775}'::jsonb, '[[6380, 11990], [9970, 11990], [9970, 13250], [13460, 13250], [13460, 15765], [6380, 15765]]'::jsonb, 26.7, 26.98, NULL, false, 4)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-room-a', 'venue-yoga-27f', 'room-a', 'ROOM A', '{"x": 6380, "y": 16130, "w": 7080, "h": 2935}'::jsonb, '[[6380, 16130], [13460, 16130], [13460, 19065], [6380, 19065]]'::jsonb, 20.8, 25.1, NULL, false, 5)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-room-b', 'venue-yoga-27f', 'room-b', 'ROOM B', '{"x": 6380, "y": 19340, "w": 7080, "h": 2935}'::jsonb, '[[6380, 19340], [13460, 19340], [13460, 22275], [6380, 22275]]'::jsonb, 20.8, 25.1, NULL, false, 6)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-room-c', 'venue-yoga-27f', 'room-c', 'ROOM C', '{"x": 6380, "y": 22520, "w": 7080, "h": 2980}'::jsonb, '[[6380, 22520], [13460, 22520], [13460, 25500], [6380, 25500]]'::jsonb, 21.1, 25.1, NULL, false, 7)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-vip-lounge', 'venue-yoga-27f', 'vip-lounge', 'VIP LOUNGE', '{"x": 6380, "y": 25730, "w": 7080, "h": 4530}'::jsonb, '[[6380, 25730], [13460, 25730], [13460, 30260], [6380, 30260]]'::jsonb, 32.1, 37.66, NULL, false, 8)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-storage-27f', 'venue-yoga-27f', 'storage-27f', '倉庫', '{"x": 6380, "y": 30500, "w": 7080, "h": 2400}'::jsonb, '[[6380, 30500], [13460, 30500], [13460, 32900], [6380, 32900]]'::jsonb, 17.0, NULL, NULL, false, 9)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-lounge-studio', 'venue-yoga-27f', 'lounge-studio', 'LOUNGE STUDIO', '{"x": 28480, "y": 12980, "w": 9910, "h": 15690}'::jsonb, '[[28480, 12980], [38390, 12980], [38390, 28670], [28480, 28670]]'::jsonb, 155.5, NULL, '{"file": "/venue/lounge-27f.png", "originMm": {"x": 27296, "y": 10402}, "pxPerMmX": 0.048387, "pxPerMmY": 0.050481, "widthPx": 600, "heightPx": 1232}'::jsonb, false, 10)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-pantry', 'venue-yoga-27f', 'pantry', 'パントリー', '{"x": 31120, "y": 28790, "w": 7270, "h": 4070}'::jsonb, '[[31120, 28790], [38390, 28790], [38390, 32860], [31120, 32860]]'::jsonb, 29.6, NULL, '{"file": "/venue/lounge-27f.png", "originMm": {"x": 27296, "y": 10402}, "pxPerMmX": 0.048387, "pxPerMmY": 0.050481, "widthPx": 600, "heightPx": 1232}'::jsonb, false, 11)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-office', 'venue-yoga-27f', 'office', '執務室', '{"x": 12845, "y": 36760, "w": 9430, "h": 7870}'::jsonb, '[[12845, 36760], [22275, 36760], [22275, 44630], [12845, 44630]]'::jsonb, 74.2, 84.76, NULL, false, 12)
ON CONFLICT (floor_id, key) DO NOTHING;
INSERT INTO qsheet_venue_areas (id, floor_id, key, label, bbox_mm, polygon_mm, drawn_area_m2, shown_area_m2, underlay, estimated, sort_order)
VALUES ('venue-yoga-27f-elv-hall-27f', 'venue-yoga-27f', 'elv-hall-27f', 'ELVホール', '{"x": 25313, "y": 36760, "w": 3768, "h": 8040}'::jsonb, '[[25313, 36760], [29081, 36760], [29081, 44800], [25313, 44800]]'::jsonb, 30.3, NULL, NULL, false, 13)
ON CONFLICT (floor_id, key) DO NOTHING;

-- ── 備品カタログ（組織共通。§11） ────────────────────────────
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('long-table-white', 'furniture', '01-1', '長机（白）', '{"w": 1800, "d": 600, "h": 720}'::jsonb, '{"shape": "rect", "w": 1800, "d": 600}'::jsonb, 20, '点', 'SKY STUDIO', 'table', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 0)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('rubeck-chair', 'furniture', '01-2', 'ルベックチェア', '{"w": 535, "d": 490, "seatH": 430}'::jsonb, '{"shape": "rect", "w": 535, "d": 490}'::jsonb, 80, '脚', '倉庫', 'chair', true, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 1)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('cafe-chair', 'furniture', '01-3', 'カフェチェア', '{"w": 500, "d": 430, "seatH": 440}'::jsonb, '{"shape": "rect", "w": 500, "d": 430}'::jsonb, 40, '脚', '倉庫', 'chair', true, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 2)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('high-table', 'furniture', '01-4', 'ハイテーブル', '{"diameter": 600, "h": null, "variable": true}'::jsonb, '{"shape": "circle", "diameter": 600}'::jsonb, 1, '台', '倉庫', 'round-table', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 3)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('high-chair', 'furniture', '01-5', 'ハイチェア', '{"w": 400, "d": 400, "h": null, "variable": true}'::jsonb, '{"shape": "rect", "w": 400, "d": 400}'::jsonb, 5, '脚', '倉庫', 'stool', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 4)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('stage', 'furniture', '01-6', 'ステージ', '{"w": 2400, "d": 1200, "h": [200, 400], "variable": true}'::jsonb, '{"shape": "rect", "w": 2400, "d": 1200}'::jsonb, 1, '台', '倉庫', 'stage', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 5)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('monitor-75-world', 'monitor', '02-1', 'ハイモニター 75型', '{"screenInch": 75, "screenW": 1660, "screenH": 934, "w": 1700, "d": 700, "h": 1800}'::jsonb, '{"shape": "rect", "w": 1700, "d": 700}'::jsonb, 2, '台', 'WORLD STUDIO', 'monitor', true, false, true, 'スタンド（キャスター台）の幅・奥行と全高（現物）', '{}'::jsonb, '{}'::jsonb, 6)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('monitor-75-lounge', 'monitor', '02-2', 'ハイモニター 75型', '{"screenInch": 75, "screenW": 1660, "screenH": 934, "w": 1700, "d": 700, "h": 1800}'::jsonb, '{"shape": "rect", "w": 1700, "d": 700}'::jsonb, 2, '台', 'LOUNGE STUDIO', 'monitor', true, false, true, 'スタンドの幅・奥行と全高（現物）。WORLD STUDIO のものとスタンドが同型か', '{}'::jsonb, '{}'::jsonb, 7)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('monitor-55', 'monitor', '02-3', 'ハイモニター 55型', '{"screenInch": 55, "screenW": 1218, "screenH": 685, "w": 1250, "d": 600, "h": 1700}'::jsonb, '{"shape": "rect", "w": 1250, "d": 600}'::jsonb, 1, '台', '倉庫', 'monitor', true, false, true, 'スタンドの幅・奥行と全高（現物）', '{}'::jsonb, '{}'::jsonb, 8)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('monitor-43-low', 'monitor', '02-4', 'ローモニター 43型', '{"screenInch": 43, "screenW": 952, "screenH": 535, "w": 1000, "d": 500, "h": 900}'::jsonb, '{"shape": "rect", "w": 1000, "d": 500}'::jsonb, 3, '台', 'WORLD STUDIO', 'monitor', true, false, true, 'スタンド（キャスター台）の幅・奥行と全高（現物）', '{}'::jsonb, '{}'::jsonb, 9)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('microwave', 'appliance', '03-1', '電子レンジ', '{"w": 500, "d": 400, "h": 300}'::jsonb, '{"shape": "rect", "w": 500, "d": 400}'::jsonb, 1, '台', 'LOUNGE STUDIO（パントリー内）', 'box', false, true, true, '寸法（現物）', '{}'::jsonb, '{}'::jsonb, 10)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('hair-dryer', 'appliance', '03-2', 'ドライヤー', '{"w": 250, "d": 100, "h": 200}'::jsonb, '{"shape": "rect", "w": 250, "d": 100}'::jsonb, 4, '台', 'ROOM A,B,C・VIP LOUNGE', 'box', false, true, true, '寸法（現物）', '{}'::jsonb, '{}'::jsonb, 11)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('kettle', 'appliance', '03-3', '電気ケトル', '{"w": 250, "d": 150, "h": 250}'::jsonb, '{"shape": "rect", "w": 250, "d": 150}'::jsonb, 4, '台', 'ROOM A,B,C・VIP LOUNGE', 'box', false, true, true, '寸法（現物）', '{}'::jsonb, '{}'::jsonb, 12)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('hot-water-pot', 'appliance', '03-4', 'ポット', '{"w": 250, "d": 350, "h": 350}'::jsonb, '{"shape": "rect", "w": 250, "d": 350}'::jsonb, 1, '台', 'LOUNGE STUDIO（パントリー内）', 'box', false, true, true, '寸法（現物）', '{}'::jsonb, '{}'::jsonb, 13)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('lectern', 'sign', '04-1', '司会台', '{"w": 700, "d": 490, "h": 1270}'::jsonb, '{"shape": "rect", "w": 700, "d": 490}'::jsonb, 1, '台', '倉庫', 'lectern', true, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 14)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('standing-sign', 'sign', '04-2', '立て看板', '{"w": 600, "d": 450, "h": 1500}'::jsonb, '{"shape": "rect", "w": 600, "d": 450}'::jsonb, 1, '台', '倉庫', 'sign', true, false, true, 'パネル幅・脚の奥行・全高（現物）', '{}'::jsonb, '{}'::jsonb, 15)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('easel', 'sign', '04-3', 'イーゼル', '{"w": 600, "d": 600, "h": 1200}'::jsonb, '{"shape": "rect", "w": 600, "d": 600}'::jsonb, 4, '台', '倉庫', 'easel', true, false, true, '脚を開いたときの幅・奥行（現物）。H1200 はリスト確定', '{}'::jsonb, '{}'::jsonb, 16)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('l-floor-stand', 'sign', '04-4', 'L字 フロアスタンド', '{"w": 300, "d": 300, "h": 1200}'::jsonb, '{"shape": "rect", "w": 300, "d": 300}'::jsonb, 9, '台', '倉庫', 'sign', true, false, true, 'ベースの寸法・掲示面のサイズ（現物）', '{}'::jsonb, '{}'::jsonb, 17)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('belt-partition', 'sign', '04-5', 'ベルトパーテーション', '{"h": 860, "beltMaxLength": 2000, "baseDiameter": 350}'::jsonb, '{"shape": "line", "length": 2000, "postDiameter": 350}'::jsonb, 10, '台', 'SKY STUDIO', 'belt-partition', false, false, true, '支柱ベースの直径（現物）。H860・最大ベルト長 2000 はリスト確定', '{}'::jsonb, '{}'::jsonb, 18)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('partition', 'sign', '04-6', 'パーテーション', '{"w": 1200, "d": 400, "h": 1600}'::jsonb, '{"shape": "rect", "w": 1200, "d": 400}'::jsonb, 6, '台', 'SKY STUDIO', 'partition', false, false, true, '脚（安定脚）の奥行（現物）。W1200・H1600 はリスト確定', '{}'::jsonb, '{}'::jsonb, 19)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('umbrella-stand', 'service', '05-1', '傘立て', '{"w": 500, "d": 350}'::jsonb, '{"shape": "rect", "w": 500, "d": 350}'::jsonb, 3, '台', 'RECEPTION', 'box', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 20)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('hanger-rack', 'service', '05-2', '可動式ハンガーラック', '{"w": 1230, "d": 500, "h": null, "variable": true}'::jsonb, '{"shape": "rect", "w": 1230, "d": 500}'::jsonb, 3, '台', '倉庫', 'hanger-rack', false, false, true, '奥行（脚の張り出し・現物）。W1230 はリスト確定', '{}'::jsonb, '{}'::jsonb, 21)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('full-length-mirror', 'service', '05-3', '姿見', '{"w": 350, "d": 360, "h": 1600}'::jsonb, '{"shape": "rect", "w": 350, "d": 360}'::jsonb, 2, '台', '倉庫', 'mirror', true, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 22)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('hand-truck', 'service', '05-4', '台車', '{"w": 480, "d": 750}'::jsonb, '{"shape": "rect", "w": 480, "d": 750}'::jsonb, 2, '台', '倉庫', 'cart', true, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 23)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('pedestal-tp90b', 'camera', NULL, 'ペデスタル TP-90B', '{"baseDiameter": 900, "minLensHeight": 600, "maxLensHeight": 1550, "massKg": 90}'::jsonb, '{"shape": "circle", "diameter": 900}'::jsonb, NULL, NULL, NULL, 'pedestal', true, false, true, 'ベース径（三輪スキッドの外接円）・最低/最高高（レンズ軸）・質量（昭特のメーカー寸法図）。カメラ本体の俯瞰寸法は搭載機種で変わる（機材管理アプリのカメラ台帳と突き合わせ）', '{"columnStages": 3, "drive": "空圧", "payloadKg": 60, "payloadNote": "雲台込み", "strokeMm": 945}'::jsonb, '{"maker": "昭特", "model": "TP-90B", "kind": "studio-pedestal", "camera": {"shape": "rect", "w": 350, "d": 1100, "offsetD": 150, "note": "スタジオカメラ＋ボックスレンズ＋ビューファインダーの俯瞰。d はレンズ先端〜VF 後端。offsetD はコラム中心からレンズ方向へ矩形中心をずらす量"}, "estimateRange": {"baseDiameterMm": [850, 1050], "minLensHeightMm": [550, 700], "maxLensHeightMm": [1500, 1650], "massKg": [70, 110]}}'::jsonb, 24)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('crane-tk53a', 'camera', NULL, 'クレーン TK-53A', '{"dollyW": 900, "dollyD": 1200, "armLengthMm": 2500, "tailLengthMm": 1100, "massKg": 250}'::jsonb, '{"shape": "rect", "w": 900, "d": 1200}'::jsonb, NULL, NULL, NULL, 'crane', true, false, true, 'アーム長・台車 TI-04B の縦横と質量・カウンターウェイト後端までの長さ（昭特のメーカー寸法図）', '{"maxLensHeightMm": 3099, "dolly": "TI-04B（操舵式スタジオクレーン台車・ペデスタル型・小型ベース）"}'::jsonb, '{"maker": "昭特", "model": "TK-53A", "kind": "studio-crane", "arm": {"lengthMm": 2500, "estimated": true, "note": "旋回中心（台車の中央）からカメラ取付点まで"}, "tail": {"lengthMm": 1100, "estimated": true, "note": "旋回中心からカウンターウェイト後端まで"}, "camera": {"shape": "rect", "w": 350, "d": 800, "note": "クレーン先端のカメラ（ボックスレンズ無し・ENG/スタジオ小型を想定）"}, "sweepRadiusMm": 3100, "estimateRange": {"armLengthMm": [2200, 2800], "dollyWMm": [800, 1000], "dollyDMm": [1100, 1400]}}'::jsonb, 25)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('crane-tk53al', 'camera', NULL, 'クレーン TK-53AL', '{"dollyW": 900, "dollyD": 1200, "armLengthMm": 3200, "tailLengthMm": 1300, "massKg": 280}'::jsonb, '{"shape": "rect", "w": 900, "d": 1200}'::jsonb, NULL, NULL, NULL, 'crane', true, false, true, 'アーム長・テール長・質量（昭特のメーカー寸法図）。台車は TK-53A と共通か', '{"maxLensHeightMm": 3850, "dolly": "TI-04B（操舵式スタジオクレーン台車・ペデスタル型・小型ベース）"}'::jsonb, '{"maker": "昭特", "model": "TK-53AL", "kind": "studio-crane", "arm": {"lengthMm": 3200, "estimated": true, "note": "L はロングアーム。TK-53A との差（最高高 +751）をアーム長に比例させて仮置き"}, "tail": {"lengthMm": 1300, "estimated": true}, "camera": {"shape": "rect", "w": 350, "d": 800}, "sweepRadiusMm": 3800, "estimateRange": {"armLengthMm": [2900, 3600]}}'::jsonb, 26)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('crane-dolly-ti04b', 'camera', NULL, 'クレーン台車 TI-04B', '{"w": 900, "d": 1200, "h": 700}'::jsonb, '{"shape": "rect", "w": 900, "d": 1200}'::jsonb, NULL, NULL, NULL, 'dolly', true, false, true, '縦横・高さ・質量（昭特のメーカー寸法図）', '{"type": "操舵式スタジオクレーン台車・ペデスタル型・小型ベース"}'::jsonb, '{"maker": "昭特", "model": "TI-04B", "kind": "crane-dolly"}'::jsonb, 27)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('person-standing', 'people', NULL, '人（立位）', '{"w": 450, "d": 300, "headDiameter": 180}'::jsonb, '{"shape": "rect", "w": 450, "d": 300}'::jsonb, NULL, NULL, NULL, 'person-standing', true, false, true, '一般的な人体寸法（肩幅 450・胸厚 300）を採用。実測不要', '{}'::jsonb, '{}'::jsonb, 28)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('person-seated', 'people', NULL, '人（着席）', '{"w": 500, "d": 800}'::jsonb, '{"shape": "rect", "w": 500, "d": 800}'::jsonb, NULL, NULL, NULL, 'person-seated', true, false, true, '一般的な着席寸法（椅子込み・膝先まで 800）を採用', '{}'::jsonb, '{}'::jsonb, 29)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('wheelchair', 'people', NULL, '車椅子', '{"w": 700, "d": 1200}'::jsonb, '{"shape": "rect", "w": 700, "d": 1200}'::jsonb, NULL, NULL, NULL, 'wheelchair', true, false, true, 'JIS T 9201 の手動車椅子の全幅 700 以下・全長 1200 以下を採用', '{}'::jsonb, '{}'::jsonb, 30)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('rect', 'generic', NULL, '四角', '{"w": 1000, "d": 1000}'::jsonb, '{"shape": "rect", "w": 1000, "d": 1000}'::jsonb, NULL, NULL, NULL, 'generic-rect', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 31)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('circle', 'generic', NULL, '丸', '{"diameter": 1000}'::jsonb, '{"shape": "circle"}'::jsonb, NULL, NULL, NULL, 'generic-circle', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 32)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('line', 'generic', NULL, '線', '{"length": 2000, "style": "solid"}'::jsonb, '{"shape": "line"}'::jsonb, NULL, NULL, NULL, 'generic-line', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 33)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('text', 'generic', NULL, '文字', '{"text": "", "fontMm": 200}'::jsonb, '{"shape": "none"}'::jsonb, NULL, NULL, NULL, 'generic-text', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 34)
ON CONFLICT (key) DO NOTHING;
INSERT INTO qsheet_venue_catalog_items (key, category, list_no, label, size_mm, footprint, qty, unit, storage, symbol, front, fixed, estimated, to_confirm, confirmed, extra, sort_order)
VALUES ('dimension', 'generic', NULL, '寸法線', '{"length": 2000}'::jsonb, '{"shape": "line"}'::jsonb, NULL, NULL, NULL, 'generic-dimension', false, false, false, NULL, '{}'::jsonb, '{}'::jsonb, 35)
ON CONFLICT (key) DO NOTHING;
