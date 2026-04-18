-- ============================================================
-- 032: 機材セクションを 設備/貸出 の2値に単純化
--   - system, facility → equipment (設備)
--   - general          → rental    (貸出)
--   - 旧CHECK制約を DROP、新CHECK制約を追加
-- 注意: UPDATE より先に CHECK を外さないと旧制約違反になる
-- ============================================================

-- 1. 旧CHECK制約を先に外す
ALTER TABLE equipment_items
  DROP CONSTRAINT IF EXISTS equipment_items_section_check;

-- 2. 既存データ移行
UPDATE equipment_items
  SET equipment_section = 'equipment'
  WHERE equipment_section IN ('system', 'facility');

UPDATE equipment_items
  SET equipment_section = 'rental'
  WHERE equipment_section = 'general';

-- 3. 新CHECK制約を追加
ALTER TABLE equipment_items
  ADD CONSTRAINT equipment_items_section_check
  CHECK (equipment_section IS NULL OR equipment_section IN ('equipment', 'rental'));
