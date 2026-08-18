-- migration 196 の初版を適用済みの環境に、支払条件の互換列と制約を補う。
--
-- migration ファイルは `_migrations.name` で一度だけ実行されるため、196 を後から
-- 修正しても、初版を適用済みの DB には変更が届かない。初版の 196 は companies へ
-- 値を移したあと customers/vendors の旧列を削除していたので、この新しい migration
-- で旧イメージへのロールバックに必要な列を作り直し、正である companies から戻す。

ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_months INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_day    INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS closing_day    INTEGER;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_months INTEGER;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_day    INTEGER;

-- 196 の初版には無かった「月数は 0〜6」の検査を、適用済み DB にも追加する。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_customer_payment_months_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_customer_payment_months_check
      CHECK (customer_payment_months IS NULL OR customer_payment_months BETWEEN 0 AND 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_vendor_payment_months_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_vendor_payment_months_check
      CHECK (vendor_payment_months IS NULL OR vendor_payment_months BETWEEN 0 AND 6);
  END IF;

  -- 196 の初版は旧列と一緒に日付制約も削除したため、互換列にも元の検査を戻す。
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_payment_day_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_payment_day_check
      CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_closing_day_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_closing_day_check
      CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendors_payment_day_check') THEN
    ALTER TABLE vendors ADD CONSTRAINT vendors_payment_day_check
      CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31);
  END IF;
END $$;

-- companies が唯一の正なので、削除されていない互換行へ現在値を戻す。
-- NULL も書き戻し、古い値が互換列に残って正と食い違わないようにする。
UPDATE customers cu SET
  closing_day    = co.customer_closing_day,
  payment_months = co.customer_payment_months,
  payment_day    = co.customer_payment_day
FROM companies co
WHERE cu.company_id = co.id
  AND cu.deleted_at IS NULL;

UPDATE vendors v SET
  payment_months = co.vendor_payment_months,
  payment_day    = co.vendor_payment_day
FROM companies co
WHERE v.company_id = co.id
  AND v.deleted_at IS NULL;
