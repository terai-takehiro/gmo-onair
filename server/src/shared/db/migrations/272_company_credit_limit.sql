-- 272: 取引先マスターに「与信限度額」「最新与信確認日」を追加（登録は任意）
--
-- ご依頼: 「取引先マスターに『与信限度額』『最新与信確認日』を登録出来るように
-- する（登録自体は任意）」。実装対象の「取引先マスター」は
-- `client/src/contexts/sales/pages/CompanyListPage.tsx`（`/sales/companies`）で、
-- companies テーブルを直接編集する。customers/vendors は migration 208 で
-- 削除済み・companies が唯一の正のため、063 と同じ単純な列追加1本で足りる
-- （192/196/198 のような複数テーブルへの同期は不要）。
--
-- credit_limit_amount: 与信限度額（円単位）。NULL = 未設定
-- credit_check_date:   最新与信確認日。NULL = 未確認
-- どちらも初期値は入れず、既存行はすべて NULL のまま（完全に任意項目）。

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS credit_limit_amount INTEGER,
  ADD COLUMN IF NOT EXISTS credit_check_date DATE;

COMMENT ON COLUMN companies.credit_limit_amount IS '与信限度額（円）。NULL=未設定・登録は任意';
COMMENT ON COLUMN companies.credit_check_date IS '最新与信確認日。NULL=未確認・登録は任意';

-- 0未満は不正値（マイナスの与信限度額は意味を持たない）。196/198 と同じ
-- DO $$ ブロックで「無ければ足す」形にし、再実行しても安全にする
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_credit_limit_amount_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_credit_limit_amount_check
      CHECK (credit_limit_amount IS NULL OR credit_limit_amount >= 0);
  END IF;
END $$;
