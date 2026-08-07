-- 見積をプロジェクト管理でも持てるようにする (v4 大⑤)
--
-- モックの GPM ⑥ 見積・請求は、**提出先**（自社／依頼元／PM会社）ごとに
-- 個別見積を出す形です。いまの `estimates` は `project_id NOT NULL` で
-- **案件（GLS）にしかぶら下がれません**。
--
-- ── 先に「案件がある前提の読み手」を実測した ────────────────
--
-- `revenues` で 53 か所のうち 41 か所が `status` を見ておらず、見積の行を
-- 混ぜたら当月売上に足された、という前例があります（migration 138 の冒頭）。
-- 同じことを繰り返さないよう、`estimates` を読む場所を数えました。**3 か所**:
--
--   1. `estimate.service.ts`         案件 id で引く（`listByProject`）。混ざらない
--   2. `billing.routes.ts /estimates` `JOIN projects` の**内部結合**。
--                                     project_id が NULL の行は自然に落ちる。
--                                     ただし**偶然そうなっている**ので、
--                                     `gpm_project_id IS NULL` を明示で足した
--   3. `salesOverview.service.ts`    「見積の返事待ち」が
--                                     `FROM estimates WHERE status='sent'` だけ。
--                                     **案件の結合が無い** — ここに GPM の見積を
--                                     入れると、案件管理のダッシュボードの
--                                     返事待ち件数と金額に足されます。
--                                     → `project_id IS NOT NULL` を足して塞いだ
--
-- 41 か所ではなく **1 か所**だったので、同じ表を使います。
-- 別表にすると版・明細・合計の作りが2つになり、片方だけ直る形が生まれます。
--
-- ── どちらか一方だけを持つ ──────────────────────────────────
--
-- `project_id`（案件）と `gpm_project_id`（プロジェクト）は**排他**です。
-- 両方入っていると、案件管理とプロジェクト管理の両方に同じ見積が出て、
-- **合計が二重になります**。CHECK で止めます。

ALTER TABLE estimates ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS gpm_project_id TEXT REFERENCES gpm_projects(id);

-- 提出先。モックの3つ（自社 / 依頼元 / PM会社）。案件の見積では使わない
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS submit_to TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_estimates_owner') THEN
    ALTER TABLE estimates ADD CONSTRAINT chk_estimates_owner
      CHECK ((project_id IS NOT NULL) <> (gpm_project_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_estimates_submit_to') THEN
    ALTER TABLE estimates ADD CONSTRAINT chk_estimates_submit_to
      CHECK (submit_to IS NULL OR submit_to IN ('self', 'client', 'pm'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_estimates_gpm
  ON estimates(gpm_project_id, status) WHERE deleted_at IS NULL AND gpm_project_id IS NOT NULL;

COMMENT ON COLUMN estimates.gpm_project_id IS
  'プロジェクト管理の見積。project_id とは**排他**（両方入ると合計が二重になる）';
COMMENT ON COLUMN estimates.submit_to IS
  '提出先 self=自社 / client=依頼元 / pm=PM会社。案件（GLS）の見積では使わない';
