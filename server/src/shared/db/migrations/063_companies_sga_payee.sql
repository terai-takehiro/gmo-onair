-- 063: 取引先マスターに「販管費支払先」フラグを追加
-- 既存: is_customer (顧客), is_vendor (仕入先)
-- 追加: is_sga_payee (販管費支払先)
-- 「その他」は 3 フラグすべて false の状態で表現

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_sga_payee BOOLEAN NOT NULL DEFAULT FALSE;

-- 既に sga_expenses.vendor_id に登録されている vendor に対応する company を is_sga_payee=TRUE に
UPDATE companies c
SET is_sga_payee = TRUE
WHERE EXISTS (
  SELECT 1 FROM vendors v
  WHERE v.company_id = c.id
  AND v.id IN (
    SELECT DISTINCT vendor_id FROM sga_expenses
    WHERE vendor_id IS NOT NULL AND deleted_at IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_companies_is_sga_payee ON companies(is_sga_payee) WHERE deleted_at IS NULL;
