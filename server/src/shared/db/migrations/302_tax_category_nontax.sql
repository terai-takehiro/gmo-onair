-- ============================================================
-- 302: revenues / purchases / sga_expenses の tax_category に
--      'nontax'（不課税）を許可する
--
-- ── なぜ要るか ────────────────────────────────────────────
--
-- shared/services/tax-category.service.ts は「非課税(exempt)」と
-- 「不課税(nontax)」を区別する前提（TAX_CATEGORIES に 'nontax' を含み、
-- 税率・税枝番・帳票ラベルも区別済み）で書かれており、同ファイルのコメントは
-- 「CHECK 制約は migration 156 で nontax を許可した」としていたが、**その
-- マイグレーションは実在しない**（欠番ではなく、一度も作られていない —
-- docs/version-history.md の v3.2.0 の記述はこの前提で書かれたアプリ層の
-- 修正だけを指しており、DB 側は追随していなかった）。
--
-- 実際には revenues/purchases/sga_expenses の CHECK 制約は今も
-- ('tax10','tax8','exempt') の3値のみで、'nontax' を書き込もうとすると
-- 即座に制約違反で失敗する（決算取込 kessan-import.service.ts の
-- mapTax() が「不課税」を 'nontax' と判定するコードパスで発覚。検証用DBで
-- 実際に `purchases_tax_category_check` 違反を再現した）。取込に限らず、
-- 'nontax' を書き込もうとする経路はすべて同じ理由で失敗する。
-- ============================================================

ALTER TABLE revenues DROP CONSTRAINT IF EXISTS revenues_tax_category_check;
ALTER TABLE revenues ADD CONSTRAINT revenues_tax_category_check
  CHECK (tax_category IN ('tax10','tax8','exempt','nontax')) NOT VALID;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_tax_category_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_tax_category_check
  CHECK (tax_category IN ('tax10','tax8','exempt','nontax')) NOT VALID;

ALTER TABLE sga_expenses DROP CONSTRAINT IF EXISTS sga_expenses_tax_category_check;
ALTER TABLE sga_expenses ADD CONSTRAINT sga_expenses_tax_category_check
  CHECK (tax_category IN ('tax10','tax8','exempt','nontax')) NOT VALID;
