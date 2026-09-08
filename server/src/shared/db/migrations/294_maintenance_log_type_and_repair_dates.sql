-- 294: メンテナンスの記録に「記録」種別と修理引取／発送日・修理受取／返送日を追加
--
-- 「記録」種別: リセットや再起動などクリティカルではないが、再現・頻発する際は
-- メンテナンス対応が必要な機材の履歴を残すための種別（故障・修理・メンテナンス・点検とは別）。
ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_record_type_check;
ALTER TABLE maintenance_records ADD CONSTRAINT maintenance_records_record_type_check
  CHECK (record_type IN ('breakdown', 'repair', 'maintenance', 'inspection', 'log'));

ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS repair_sent_at TEXT;
ALTER TABLE maintenance_records ADD COLUMN IF NOT EXISTS repair_returned_at TEXT;
