-- 会社DB統合後に実施した列単位のドリフト監査（npm run db:drift-sql）で見つかった、
-- migrationファイルには存在しないのに実DB（dev）にあった22列を後始末する。
--
-- 実データの有無を1列ずつ確認した（docs/reviews/phase3-2-plan.md 参照）:
--   ① revenues.is_estimate_origin / estimate_confirmed_at / estimate_pdf_box_file_id
--      … 136件中7件に実データがあり、estimatesテーブルにも対応レコードが無い
--        （唯一の記録）。**追認するだけで、列もデータも消さない**
--   ② それ以外19列 … 全行が列の既定値のまま、または一度も値が入っていない
--        （dev環境で実測済み）。削除する

-- ── ① 追認（実DBに既にある列と同じ形。fresh DB にも作られるようにする）──────
ALTER TABLE revenues
  ADD COLUMN IF NOT EXISTS is_estimate_origin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimate_confirmed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS estimate_pdf_box_file_id TEXT;

-- ── ② 削除（実データ0件を確認済み）──────────────────────────────────
ALTER TABLE revenues
  DROP COLUMN IF EXISTS discount_amount,
  DROP COLUMN IF EXISTS estimate_version,
  DROP COLUMN IF EXISTS estimate_sent_at,
  DROP COLUMN IF EXISTS paid_amount,
  DROP COLUMN IF EXISTS paid_at,
  DROP COLUMN IF EXISTS inspection_issued_at,
  DROP COLUMN IF EXISTS invoice_issued_at;

ALTER TABLE finance_docs
  DROP COLUMN IF EXISTS box_file_id,
  DROP COLUMN IF EXISTS original_kind,
  DROP COLUMN IF EXISTS original_name,
  DROP COLUMN IF EXISTS original_size,
  DROP COLUMN IF EXISTS original_uploaded_at,
  DROP COLUMN IF EXISTS original_uploaded_by;

ALTER TABLE misc_inquiries
  DROP COLUMN IF EXISTS promoted_at,
  DROP COLUMN IF EXISTS promoted_by;

ALTER TABLE qsheet_documents
  DROP COLUMN IF EXISTS audio_share_revoked_at,
  DROP COLUMN IF EXISTS audio_share_revoked_by;

ALTER TABLE awards_events
  DROP COLUMN IF EXISTS template;
