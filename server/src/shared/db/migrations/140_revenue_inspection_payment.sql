-- ============================================================
-- 売上に「検収」と「入金」を持たせる (v4 ⑤ 見積・請求（全案件）)
--
-- ご判断: **入金と検収を ONAiR で持つ**（選択肢 A）。
-- 経理システム側だけで見る案 (B) は採らなかった — 営業が
-- 「あの案件、入金された？」を ONAiR で見たいため。
--
-- ── いまの `revenues` に無かったもの ──────────────────────
--   billing_date       請求日          … ある
--   payment_due_date   支払期日        … ある
--   invoice_issued     請求書を出した  … ある
--   検収したか                          … **無い**
--   いつ入金されたか                    … **無い**
--
-- 仕入側 (`purchases`) には `inspection_date` があるのに、
-- 売上側には無いという非対称だった。**名前と型は仕入に合わせる**
-- (TEXT の YYYY-MM-DD)。ここだけ DATE 型にすると、同じ意味の列を
-- 突き合わせるたびにキャストが要る。
--
-- 「済んだか」のフラグは作らない。**日付が入っていれば済み**とする —
-- フラグと日付の両方を持つと、片方だけ更新されて食い違う
-- (実際に `invoice_issued` と `billing_date` で起きうる形)。
-- ============================================================

ALTER TABLE revenues ADD COLUMN IF NOT EXISTS inspection_date TEXT;  -- 検収日 (YYYY-MM-DD)
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS paid_date       TEXT;  -- 入金日 (YYYY-MM-DD)

-- 「まだ入金されていない請求」を期限順に引く画面 (⑤) のための索引。
-- 入金済みは対象外なので部分索引にする (件数が積み上がっても効く)
CREATE INDEX IF NOT EXISTS idx_revenues_unpaid
  ON revenues (payment_due_date)
  WHERE paid_date IS NULL AND deleted_at IS NULL;
