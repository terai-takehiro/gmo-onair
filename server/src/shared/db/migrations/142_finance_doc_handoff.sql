-- ============================================================
-- 142: 受け取った書類 → 台帳（仕入 / 販管費）への受け渡しを記録する
--
-- ── なぜ要るか ────────────────────────────────────────────
--
-- `finance_docs`（届いた 請求書/見積書/注文書）は「処理完了」にできるが、
-- **それが実際にどの仕入・販管費になったのかを持っていなかった**。
-- そのため同じ請求書を2回入力し（届いた記録＋台帳の記録）、突き合わせは
-- 記憶頼みだった。届いた書類と台帳の行を結ぶ2列を足す。
--
-- ── なぜ外部キーにしないか ────────────────────────────────
--
-- 行き先が2つのテーブル（`purchases` / `sga_expenses`）に分かれるため、
-- 1本の外部キーでは表せない。**どちらのテーブルか**を `linked_kind` で持ち、
-- id は `linked_id` に入れる。台帳側の行が消されたときは
-- 「渡した先が無くなった」と分かるほうがよいので、追随して消さない
-- （消えていることを画面で気づけるようにする）。
-- ============================================================

ALTER TABLE finance_docs
  ADD COLUMN IF NOT EXISTS linked_kind TEXT,   -- 'purchase' | 'sga'
  ADD COLUMN IF NOT EXISTS linked_id   TEXT;

ALTER TABLE finance_docs DROP CONSTRAINT IF EXISTS finance_docs_linked_kind_check;
ALTER TABLE finance_docs ADD CONSTRAINT finance_docs_linked_kind_check
  CHECK (linked_kind IS NULL OR linked_kind IN ('purchase', 'sga')) NOT VALID;

-- 渡し済みの書類を引くため（一覧で「処理完了」を絞るときに使う）
CREATE INDEX IF NOT EXISTS idx_finance_docs_linked
  ON finance_docs (linked_kind, linked_id)
  WHERE linked_id IS NOT NULL AND deleted_at IS NULL;
