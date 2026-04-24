-- 064: 料金表にグループ内価格 (group_price) カラムを追加
-- 案件の customer_type に応じて unit_price (定価・外販) / group_price (グループ内) を使い分ける
-- unit_price も NULL 許容に変更し「設定なし」(その価格帯は提供不可) を表現可能にする

ALTER TABLE pricing_items
  ALTER COLUMN unit_price DROP NOT NULL;

ALTER TABLE pricing_items
  ALTER COLUMN unit_price DROP DEFAULT;

ALTER TABLE pricing_items
  ADD COLUMN IF NOT EXISTS group_price INTEGER;

COMMENT ON COLUMN pricing_items.unit_price IS '定価 (外販・グループ外顧客向け)。NULL は「設定なし」を意味する';
COMMENT ON COLUMN pricing_items.group_price IS 'グループ内価格 (internal 顧客向け)。NULL は「設定なし」を意味する';
