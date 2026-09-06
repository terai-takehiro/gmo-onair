-- 286: お金のルール・月次予算/実績上書きを会社（entity_code）ごとに持てるようにした
-- （2026年10月の事業再編・財務の2社タブ・P2 Round 1）
--
-- 設計の全文: docs/reorg-2026-10-plan.md（§4.5・§4.6・§6 P2）
--
-- money_rules は「id='default' の1行だけ」という前提で作られていた
-- （283 で entity_code 列を足したのは DEFAULT 'GSS' で埋めるためだけで、
-- 複数行にする配線はまだ入れていない）。ここで id そのものを entity_code と
-- 一致させ、GJV・GMO ぶんの行を GSS の設定値の写しで足す（値を分けたくなったら
-- あとで設定画面から個別に直せる。ここでは「揃っている」状態を作るだけ・§4.5）。
--
-- monthly_budgets / monthly_actual_overrides も同様に year_month 単独の PK を
-- (entity_code, year_month) に広げる。既存行は 283 の DEFAULT で全部
-- entity_code='GSS' なので、広げても重複キーにはならない。

-- ── money_rules: id 固定チェックを外し、id = entity_code に付け替える ──────
ALTER TABLE money_rules DROP CONSTRAINT money_rules_id_check;

UPDATE money_rules SET id = 'GSS' WHERE id = 'default';

ALTER TABLE money_rules ADD CONSTRAINT money_rules_id_check CHECK (id = entity_code);

INSERT INTO money_rules (
  id, closing_day, payment_months, payment_day, purchase_payment_months, purchase_payment_day,
  payment_holiday_shift, invoice_issue_rule, standard_tax_rate, tax_unit, tax_rounding,
  estimate_display, currency, amount_unit, labor_unit, updated_at, updated_by, entity_code
)
SELECT 'GJV', closing_day, payment_months, payment_day, purchase_payment_months, purchase_payment_day,
  payment_holiday_shift, invoice_issue_rule, standard_tax_rate, tax_unit, tax_rounding,
  estimate_display, currency, amount_unit, labor_unit, now(), updated_by, 'GJV'
FROM money_rules WHERE id = 'GSS'
ON CONFLICT (id) DO NOTHING;

INSERT INTO money_rules (
  id, closing_day, payment_months, payment_day, purchase_payment_months, purchase_payment_day,
  payment_holiday_shift, invoice_issue_rule, standard_tax_rate, tax_unit, tax_rounding,
  estimate_display, currency, amount_unit, labor_unit, updated_at, updated_by, entity_code
)
SELECT 'GMO', closing_day, payment_months, payment_day, purchase_payment_months, purchase_payment_day,
  payment_holiday_shift, invoice_issue_rule, standard_tax_rate, tax_unit, tax_rounding,
  estimate_display, currency, amount_unit, labor_unit, now(), updated_by, 'GMO'
FROM money_rules WHERE id = 'GSS'
ON CONFLICT (id) DO NOTHING;

-- ── monthly_budgets / monthly_actual_overrides: PK を (entity_code, year_month) に広げる ──
ALTER TABLE monthly_budgets DROP CONSTRAINT monthly_budgets_pkey;
ALTER TABLE monthly_budgets ADD PRIMARY KEY (entity_code, year_month);

ALTER TABLE monthly_actual_overrides DROP CONSTRAINT monthly_actual_overrides_pkey;
ALTER TABLE monthly_actual_overrides ADD PRIMARY KEY (entity_code, year_month);
