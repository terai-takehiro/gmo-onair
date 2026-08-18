-- 支払条件の取引先ごとの例外を companies に一本化する（Phase 3-1）
--
-- ── 何を直しているか ──────────────────────────────────────────
--
-- migration 175 で「支払期日は会社ぜんぶで1本 ＋ 取引先ごとに例外」と決め、
-- 例外の列を `customers.closing_day/payment_months/payment_day` と
-- `vendors.payment_months/payment_day` に別々に足した。ところが2026-08 の
-- 取引先マスター一本化（Phase 1/2）で `companies` を唯一の正のマスターに
-- 寄せたのに、この3列だけ寄せ忘れていた（`money-rules.service.ts` は今も
-- `customers`/`vendors` を直接読んでいる）。
--
-- 1社が顧客と仕入先を両方兼ねるとき、`customers.payment_day` と
-- `vendors.payment_day` は**別の値を持てる**が、どちらも「この会社への／から
-- の支払い」という同じ意味の列名なので、1つの `companies` にまとめるときは
-- **役割で列名を分ける**必要がある（顧客としての受け取り例外と、仕入先としての
-- 支払い例外は別物）。
--
-- ⚠️ **この3列に値を書き込む画面は今のところ1つも無い**（`customers.routes.ts` /
-- `vendors.routes.ts` の PUT はどちらもこの列を受け取っていない）。
-- そのため実データはほぼ確実に全行 NULL だが、直接 SQL で入れた値が
-- あった場合に備えて **バックフィルする**（無ければ何も起きない）。

ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_closing_day    INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_payment_months INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_payment_day    INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vendor_payment_months   INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vendor_payment_day      INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_customer_payment_day_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_customer_payment_day_check
      CHECK (customer_payment_day IS NULL OR customer_payment_day BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_customer_closing_day_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_customer_closing_day_check
      CHECK (customer_closing_day IS NULL OR customer_closing_day BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_vendor_payment_day_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_vendor_payment_day_check
      CHECK (vendor_payment_day IS NULL OR vendor_payment_day BETWEEN 1 AND 31);
  END IF;
END $$;

-- バックフィル（customers/vendors 側に値が残っている行だけ動く。無ければ no-op）
UPDATE companies co SET
  customer_closing_day    = cu.closing_day,
  customer_payment_months = cu.payment_months,
  customer_payment_day    = cu.payment_day
FROM customers cu
WHERE cu.company_id = co.id
  AND (cu.closing_day IS NOT NULL OR cu.payment_months IS NOT NULL OR cu.payment_day IS NOT NULL);

UPDATE companies co SET
  vendor_payment_months = v.payment_months,
  vendor_payment_day    = v.payment_day
FROM vendors v
WHERE v.company_id = co.id
  AND (v.payment_months IS NOT NULL OR v.payment_day IS NOT NULL);

-- **正はもう companies だけ。** 列を customers/vendors に残すと、次にこの列へ
-- 書く経路を足す人が「どちらに書けばいいか」を選べる状態になり、
-- 「取引先マスターでは例外あり・顧客一覧では例外なし」という食い違いが起きる。
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_payment_day_check;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_closing_day_check;
ALTER TABLE customers DROP COLUMN IF EXISTS payment_months;
ALTER TABLE customers DROP COLUMN IF EXISTS payment_day;
ALTER TABLE customers DROP COLUMN IF EXISTS closing_day;

ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_payment_day_check;
ALTER TABLE vendors DROP COLUMN IF EXISTS payment_months;
ALTER TABLE vendors DROP COLUMN IF EXISTS payment_day;
