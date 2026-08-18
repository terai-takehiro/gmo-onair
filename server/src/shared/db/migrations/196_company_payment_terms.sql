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
--
-- ⚠️ **`customers`/`vendors` の旧列はこの回では消さない**（レビュー指摘・PR #188 P1）。
-- `docs/deploy-pipeline.md` の「その場でイメージだけ差し替える (急ぎ)」ロールバックは
-- **DB はそのまま・イメージだけ古いものに戻す**運用なので、この migration が走った
-- あとに1つ前のイメージへ戻すと、旧コードの `SELECT closing_day, payment_months,
-- payment_day FROM customers` が `undefined_column` で落ちる（売上の作成・
-- 支払期日の下見が全滅する）。**旧列は互換のためのリリースを1回挟んでから**
-- 別の migration で消す（このリリースがロールバック対象で無くなったあと）。

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
  -- **月数にも上限を掛ける**（レビュー指摘・PR #188 P2）。`money_rules.payment_months`
  -- は 0〜6 の CHECK を持つのに、取引先ごとの例外にはこれまで無かった。
  -- 範囲外（負数・極端に大きい値）が入ると `dueDateOf` が壊れた日付を作る
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_customer_payment_months_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_customer_payment_months_check
      CHECK (customer_payment_months IS NULL OR customer_payment_months BETWEEN 0 AND 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_vendor_payment_months_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_vendor_payment_months_check
      CHECK (vendor_payment_months IS NULL OR vendor_payment_months BETWEEN 0 AND 6);
  END IF;
END $$;

-- バックフィル（customers/vendors 側に値が残っている行だけ動く。無ければ no-op）。
-- **削除済みの子行は対象にしない**（レビュー指摘・PR #188 P2）。company はそのまま
-- 残しつつ customers/vendors 側だけ削除された行の古い例外値を、生きている会社の
-- 正の値へ紛れ込ませない
UPDATE companies co SET
  customer_closing_day    = cu.closing_day,
  customer_payment_months = cu.payment_months,
  customer_payment_day    = cu.payment_day
FROM customers cu
WHERE cu.company_id = co.id
  AND cu.deleted_at IS NULL
  AND (cu.closing_day IS NOT NULL OR cu.payment_months IS NOT NULL OR cu.payment_day IS NOT NULL);

UPDATE companies co SET
  vendor_payment_months = v.payment_months,
  vendor_payment_day    = v.payment_day
FROM vendors v
WHERE v.company_id = co.id
  AND v.deleted_at IS NULL
  AND (v.payment_months IS NOT NULL OR v.payment_day IS NOT NULL);

-- **読み込みの正はもう companies**（`money-rules.service.ts` 参照）。
-- customers/vendors の列は上のとおり互換のため残すが、以後ここへは書かない
-- （書く経路を2つ持つと「取引先マスターでは例外あり・顧客一覧では例外なし」が起きる）。
