-- 146: 請求と入金 (デザイン 31章 31a / 仕様書 §7.5)
--
-- ── 足すのは列だけ ────────────────────────────────────
--
-- 請求の対象は既存の確定売上 (`revenues` status='confirmed') がそのまま使える。
-- 足りないのは「いつ出したか」「入金があったか」「検収書を出したか」の3つで、
-- どれも売上1件に1つしか無いので**列で足りる** (新しいテーブルは作らない)。
--
-- `invoice_issued` (BOOLEAN・migration 066) は既にあるが**日付を持っていない**。
-- 「7月締めで何件出したか」を後から数えられないので、日時を足す。
-- 既存の TRUE 行は日付が分からないため NULL のまま残す
-- (分からないものを「今日出した」ことにすると、締めの集計が嘘になる)。
--
-- ── 入金は「日付」で持つ ──────────────────────────────
--
-- 入金は BOOLEAN ではなく日付にする。「入金済み」だけだと
-- 「期日より遅れて入ったか」が分からず、催促の判断に使えない。
-- 一部入金 (paid_amount) も持つ — 分割で払われることがあり、
-- 「全部入ったのか」を金額で判断できないと消し込みができない。

ALTER TABLE revenues ADD COLUMN IF NOT EXISTS invoice_issued_at    TIMESTAMP;
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS paid_at              TIMESTAMP;
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS paid_amount          INTEGER;
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS inspection_issued_at TIMESTAMP;

-- 「請求のしごと」の3つのタブが引く条件 (status + 発行 + 入金) の索引
CREATE INDEX IF NOT EXISTS idx_revenues_billing_work
  ON revenues(status, invoice_issued, paid_at)
  WHERE deleted_at IS NULL;
