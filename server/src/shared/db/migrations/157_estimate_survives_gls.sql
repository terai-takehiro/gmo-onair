-- 157: GLS 発番のあとも見積を同じ画面で開けるようにする (v3.1.5 / 利用者依頼)
--
-- ── いま何が起きているか ──────────────────────────────
--
-- 見積の器は `revenues(status='estimate')` + `revenue_items` (migration 145)。
-- 案件化 (GLS 発番) すると `migrateEstimates` が **status を 'confirmed' に変える**。
-- ところが見積画面が見積を引く条件は `status = 'estimate'` の1本だけなので、
-- 発番した瞬間に「見積が無い案件」になり、**画面が空になる**。
-- 作った人からは「見積が消えた」ように見え、もう一度組み直す。
-- 組み直すと `status='estimate'` の行が**もう1本**でき、次に分類を変えて再発番したときに
-- それも確定売上へ変換されるので、**同じ金額の売上が2件**立つ。
--
-- ── 直し方: 「この案件の見積はどの行か」を列で持つ ──────
--
-- status だけでは「見積だった行」を後から言えない (発番で上書きされる)。
-- 見積の入口が作った行に印を付け、**status に関わらずその行を見積として開く**。
-- 確定売上になったあとも、同じ画面で明細・区分・並び・行ごとの仕入を直せる
-- (「見積 = 最終的には売上」を1つのデータで扱う、という依頼のとおり)。
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS is_estimate_origin BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 既存データの埋め戻し ──────────────────────────────
--
-- ① いま見積のままの行 … 見積の入口が作った行そのもの
-- ② 見積の操作の跡がある行 … `estimate_sent_at` / `estimate_confirmed_at` /
--    `estimate_pdf_box_file_id` は**見積の入口しか書かない列** (migration 145)。
--    発番済で status が 'confirmed' に変わっていても、これが入っていれば見積由来と言える。
--
-- `discount_amount` は使わない — 売上の値引きダイアログからも入る余地があり、
-- 見積由来の判定としては当てにならない。
UPDATE revenues
   SET is_estimate_origin = TRUE
 WHERE is_estimate_origin = FALSE
   AND (
     status = 'estimate'
     OR estimate_sent_at IS NOT NULL
     OR estimate_confirmed_at IS NOT NULL
     OR estimate_pdf_box_file_id IS NOT NULL
   );

-- 1案件につき見積は1本という前提だが、**一意索引は張らない**。
-- 上の埋め戻しで1案件に複数の行が立つことがある (発番前に見積を作り直していた案件)。
-- 索引を張ると migration が失敗し、失敗した migration は起動シーケンスを止めるので
-- サーバーが上がらなくなる (v3.1.1 で実測した順序の問題と同じ)。
-- 読む側は `ORDER BY created_at ASC LIMIT 1` で最初の1本に決める。
CREATE INDEX IF NOT EXISTS idx_revenues_project_estimate_origin
  ON revenues(project_id) WHERE is_estimate_origin;
