-- 支払条件の例外の旧列を削除する（Phase 3-3-6・不可逆）
--
-- ── 何を消すか ──────────────────────────────────────────────
--
-- migration 196 で支払条件の取引先ごとの例外を `companies`
-- （customer_closing_day/customer_payment_months/customer_payment_day/
-- vendor_payment_months/vendor_payment_day）へ一本化し、`customers`/`vendors`
-- 側の旧列（closing_day/payment_months/payment_day）は「互換のためのリリースを
-- 1回挟んでから消す」として意図的に残していた（migration 196 コメント参照）。
--
-- 互換のためのリリースは v4.1.5（3-2まで含む版）で本番公開済み、Phase 3-3-4 で
-- `companies.routes.ts` の POST/PUT がこの3列への二重書き込みを止めた（PR #225）。
-- 読み込み側（`money-rules.service.ts`）はもともと `companies` 側だけを読んでおり、
-- `customers.closing_day`/`payment_months`/`payment_day`・`vendors.payment_months`/
-- `payment_day` を直接読むコードはこの migration の時点で1つも無いことを
-- `docs/reviews/phase3-2-plan.md` Phase 3-3-4 で再確認済み。
--
-- ⚠️ **このmigrationは不可逆。** マージ前ゲート（本番のオンデマンドバックアップ＋
-- `test`/`typecheck`/`lint`/`verify:fresh` の検証一式）を済ませてからマージすること
-- （`docs/reviews/phase3-2-plan.md` Phase 3-3 工程表「7」「8」参照）。

ALTER TABLE customers DROP COLUMN IF EXISTS closing_day;
ALTER TABLE customers DROP COLUMN IF EXISTS payment_months;
ALTER TABLE customers DROP COLUMN IF EXISTS payment_day;

ALTER TABLE vendors DROP COLUMN IF EXISTS payment_months;
ALTER TABLE vendors DROP COLUMN IF EXISTS payment_day;
