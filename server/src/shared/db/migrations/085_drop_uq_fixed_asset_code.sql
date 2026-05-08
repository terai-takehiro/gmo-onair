-- ============================================================
-- 085: fixed_asset_code のユニーク制約を撤廃
-- 業務実態として 1 つの固定資産コードが複数機材で共有されるケースがあるため
-- (045_equipment_integrity_fixes.sql で導入したインデックスを削除)
-- ============================================================

DROP INDEX IF EXISTS uq_fixed_asset_code;

-- 検索性は維持したいので非ユニークインデックスに置き換え
CREATE INDEX IF NOT EXISTS idx_fixed_asset_code
  ON equipment_items(fixed_asset_code)
  WHERE fixed_asset_code IS NOT NULL
    AND fixed_asset_code != ''
    AND deleted_at IS NULL;
