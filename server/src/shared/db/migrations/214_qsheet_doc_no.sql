-- ============================================================
-- 214: 制作資料 v4 段3 — 資料番号 (doc_no)
--
--   案件に紐づかない資料 (project_id IS NULL) に配る、口頭で言える番号。
--   書式は SB-202608-0001 (接頭辞-年月6桁-連番4桁。
--   server/src/contexts/qsheet/services/docNo.service.ts が生成する)。
--
--   ⚠️ 既存行への一括バックフィルはしない
--   (docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md §5-4)。
--   理由:
--     ① 番号は「配ったもの」。誰にも配っていない番号を後から生やすと、
--        「口頭で言われた番号が資料に付いていない」という逆の混乱が起きる。
--     ② generateSequenceNumber() はその月の連番を返す。過去の資料に
--        いまの月の連番を振ると番号の月と資料の月が食い違う。
--   このファイルは ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
--   だけで構成されており、既存行の doc_no は一切書き換えない
--   (=何度流しても・既存データがどんな状態でも安全に冪等)。
-- ============================================================

ALTER TABLE qsheet_documents
  ADD COLUMN IF NOT EXISTS doc_no TEXT;

-- NULL 同士は衝突しないので部分 UNIQUE で足りる。索引には採番済みの行だけが載る
-- (現行の資料はほぼ全部 NULL なので、素の UNIQUE より索引が小さく保てる)。
CREATE UNIQUE INDEX IF NOT EXISTS idx_qsheet_documents_doc_no
  ON qsheet_documents (doc_no) WHERE doc_no IS NOT NULL;
