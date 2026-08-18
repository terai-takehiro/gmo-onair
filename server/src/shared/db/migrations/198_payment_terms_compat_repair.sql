-- migration 196 の互換性・検査を、すでに196を実行済みの環境にも届ける（PR #190 レビュー・P1）
--
-- ── なぜ196を直接直すのでは足りないか ──────────────────────────
--
-- `server/src/shared/db/migrate.ts` の `runMigrations()` は
-- `_migrations` に記録済みのファイル名を二度と実行しない。PR #188 が
-- マージされて検証環境（`main` へのマージで自動デプロイ）で一度 196 が
-- 走った環境では、**196ファイルの中身をあとから書き換えても、
-- その環境では二度と実行されない**。つまり PR #190 で 196 に足した
-- ①旧列を消さない ②月数の範囲チェック ③論理削除済み行の除外は、
-- 「196を実行したことがある環境」には一切届かない。
-- **新しい migration として届ける必要がある**（このファイル）。
--
-- ── このファイルの安全性 ──────────────────────────────────────
--
-- すべて `IF NOT EXISTS` / 条件つき UPDATE なので、以下のどちらの環境でも
-- 安全に働く:
--   A) 196を「古い内容」で実行済み（列が消えている・範囲チェックが無い）
--   B) 196を「PR #190 で直した内容」で初めて実行した（すでに列も
--      チェックもある）→ このファイルはすべて no-op になる

-- ① 旧列が消えていたら戻す（A の環境向け）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS closing_day    INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_months INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_day    INTEGER;
ALTER TABLE vendors   ADD COLUMN IF NOT EXISTS payment_months INTEGER;
ALTER TABLE vendors   ADD COLUMN IF NOT EXISTS payment_day    INTEGER;

DO $$
BEGIN
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

-- ② 旧列を companies から埋め直す（A の環境は 196 が companies へ移したあとに
-- 消してしまったので、companies が正のいまの値を持っている。196時点の
-- バックフィルは customers/vendors → companies の一方向だったので、
-- ここでは向きを逆にして legacy 列を復元する）
UPDATE customers cu SET
  closing_day    = co.customer_closing_day,
  payment_months = co.customer_payment_months,
  payment_day    = co.customer_payment_day
FROM companies co
WHERE co.id = cu.company_id AND cu.deleted_at IS NULL
  AND (co.customer_closing_day IS NOT NULL
       OR co.customer_payment_months IS NOT NULL
       OR co.customer_payment_day IS NOT NULL);

UPDATE vendors v SET
  payment_months = co.vendor_payment_months,
  payment_day    = co.vendor_payment_day
FROM companies co
WHERE co.id = v.company_id AND v.deleted_at IS NULL
  AND (co.vendor_payment_months IS NOT NULL OR co.vendor_payment_day IS NOT NULL);

-- ③ 月数チェックを足す前に、範囲外の既存値を壊れた入力として捨てる
-- （レビュー指摘・PR #190 P2）。migration 175 は customers/vendors の
-- payment_months に範囲チェックを持たなかったので、companies へ移った
-- 値が 0〜6 の外にある可能性がある。CHECK を足す前に正規化しないと
-- 移行そのものが失敗する。**丸めない** — 範囲外は「何を意図していたか
-- 分からない」ので、既定値へこっそり倒さず NULL（決めていない）に落とす
UPDATE companies SET customer_payment_months = NULL
  WHERE customer_payment_months IS NOT NULL
    AND customer_payment_months NOT BETWEEN 0 AND 6;
UPDATE companies SET vendor_payment_months = NULL
  WHERE vendor_payment_months IS NOT NULL
    AND vendor_payment_months NOT BETWEEN 0 AND 6;

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
END $$;
