-- ============================================================
-- 203: 決算取込で作られた案件の gls_category を埋め戻す
--
-- migration 086 は「その時点の行」だけを GLS 番号の prefix で埋めた。
-- 決算取込（`kessan_marker` を持つ案件）は 086 より**あとも**作られ続けており、
-- その回の INSERT（kessan-import.service.ts）は gls_category を書かない。
-- 結果、取込で作られた案件は今も gls_category が NULL のまま残っている。
--
-- 困るのは「NULL は GLS-A 扱い」という決めごと（migration 193 のコメント）が
-- あるのに、**案件台帳の絞り込み・整合性チェックはどちらも `gls_category = 'A'`
-- の完全一致**（`ProjectLedgerPage` の既定フィルタ / `project-integrity.ts` の
-- `no_classification` 等）で、NULL はここに引っかからないこと。
-- → 取込直後の「顧客不明」「分類なし」の行が、案件台帳のどの絞り込みにも
--   一切出てこない（見た目には「無い」ことになっている）。
--
-- 086 と**同じ判定・同じ書き方**（prefix 一致のみ・NULL のまま残す行があってよい）。
-- ここに独自の判断は足さない。
UPDATE projects
  SET gls_category = 'A'
  WHERE gls_category IS NULL AND gls_number LIKE 'GLS-A%';

UPDATE projects
  SET gls_category = 'B'
  WHERE gls_category IS NULL AND gls_number LIKE 'GLS-B%';
