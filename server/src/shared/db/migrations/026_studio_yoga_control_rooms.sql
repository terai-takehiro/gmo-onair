-- ============================================================
-- 026: 用賀スタジオに第1調整室・第2調整室を追加 + パターンA順に整理
-- パターンA: 種別でグルーピング (studio → control → greenroom)
-- ============================================================

DO $$
DECLARE
  v_yoga_id TEXT;
BEGIN
  -- 用賀スタジオのIDを取得
  SELECT id INTO v_yoga_id FROM studio_locations
   WHERE name = '用賀スタジオ' AND deleted_at IS NULL
   LIMIT 1;

  IF v_yoga_id IS NULL THEN
    RAISE NOTICE '用賀スタジオが見つかりません — スキップ';
    RETURN;
  END IF;

  -- 第1調整室（既存なら UPDATE、無ければ INSERT）
  IF NOT EXISTS (SELECT 1 FROM studio_rooms
                  WHERE location_id = v_yoga_id AND name = '第1調整室' AND deleted_at IS NULL) THEN
    INSERT INTO studio_rooms (id, location_id, name, room_type, color, sort_order)
    VALUES (gen_random_uuid()::text, v_yoga_id, '第1調整室', 'control', '#4f46e5', 4);
  END IF;

  -- 第2調整室
  IF NOT EXISTS (SELECT 1 FROM studio_rooms
                  WHERE location_id = v_yoga_id AND name = '第2調整室' AND deleted_at IS NULL) THEN
    INSERT INTO studio_rooms (id, location_id, name, room_type, color, sort_order)
    VALUES (gen_random_uuid()::text, v_yoga_id, '第2調整室', 'control', '#0284c7', 5);
  END IF;

  -- ============================================================
  -- パターンA順に sort_order を再設定
  --   1. WORLD STUDIO      (studio)
  --   2. SKY STUDIO        (studio)
  --   3. LOUNGE STUDIO     (studio)
  --   4. 第1調整室          (control)
  --   5. 第2調整室          (control)
  --   6. MEETING ROOM      (greenroom)
  --   7. ROOM A            (greenroom)
  --   8. ROOM B            (greenroom)
  --   9. ROOM C            (greenroom)
  --  10. VIP LOUNGE        (greenroom)
  -- ============================================================
  UPDATE studio_rooms SET sort_order = 1  WHERE location_id = v_yoga_id AND name = 'WORLD STUDIO'  AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 2  WHERE location_id = v_yoga_id AND name = 'SKY STUDIO'    AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 3  WHERE location_id = v_yoga_id AND name = 'LOUNGE STUDIO' AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 4  WHERE location_id = v_yoga_id AND name = '第1調整室'     AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 5  WHERE location_id = v_yoga_id AND name = '第2調整室'     AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 6  WHERE location_id = v_yoga_id AND name = 'MEETING ROOM'  AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 7  WHERE location_id = v_yoga_id AND name = 'ROOM A'        AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 8  WHERE location_id = v_yoga_id AND name = 'ROOM B'        AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 9  WHERE location_id = v_yoga_id AND name = 'ROOM C'        AND deleted_at IS NULL;
  UPDATE studio_rooms SET sort_order = 10 WHERE location_id = v_yoga_id AND name = 'VIP LOUNGE'    AND deleted_at IS NULL;
END$$;
