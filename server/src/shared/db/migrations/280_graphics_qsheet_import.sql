-- ============================================================
-- 280: テロップCG — 台本からの取り込み（コーナー・紐づけ）
--
-- docs/design/v4/graphics-redesign.md §9「進行台本との連携」1〜2番（段C）の最小実装。
--   - section: コーナー見出し。取り込み時に台本の sections[].label をそのまま写す
--     （NULL = コーナー無し・手動作成したページは触らないので既存行は全て NULL のまま）
--   - qsheet_doc_id / qsheet_row_id: 取り込み元の台本ドキュメントと行の ID。
--     台本側の文言が変わったときの「台本と違います」バッジ（差分検出）に使う。
--     qsheet_row_id は qsheet_documents.data（JSONB）の中の行 id を指すだけで、
--     行そのものは別テーブルに無いため FK は張れない・張らない。qsheet_doc_id だけ
--     FK を張り、ドキュメントが削除されたら SET NULL にする（取り込みは「コピー」で
--     「参照」ではないため、ドキュメント削除でページ自体まで消す必要はない —
--     単に「もう追跡できない＝以後は差分検出をしない」扱いにする）。
--
-- §9 3番「本番で追従」・4番「依頼のタイミング選択」はスコープ外（段E/段D で別途）。
-- ============================================================

ALTER TABLE graphics_pages
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS qsheet_doc_id TEXT REFERENCES qsheet_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qsheet_row_id TEXT;

CREATE INDEX IF NOT EXISTS idx_graphics_pages_qsheet_doc
  ON graphics_pages (qsheet_doc_id) WHERE qsheet_doc_id IS NOT NULL;
