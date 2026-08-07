-- プロジェクト管理: 体制（組織図）の形 (v4)
--
-- モックの体制は**箱と線の組織図**で、次の3段になっている（`GP_ORG2`）:
--
--   上段  オブザーバー ／ 責任者（オーナー） ／ 管理業務・財務   … 横に3つ
--   中段  全体統括（PM会社）                                    … 1つ
--   下段  設計ユニット ／ テクニカルユニット ／ 施工ユニット      … 横に N 個
--
-- `gpm_members` は 立場 (`side`) と 所属 (`org`) しか持たず、
-- **「どの箱に入るか」と「どの段か」が表せません**でした。
--
--   `tier`        どの段か top / lead / unit
--   `group_label` 箱の名前（「設計ユニット」など）。同じ名前の人が1つの箱に入る
--   `badge`       箱の中で目立たせる印（決裁 / 進行 / 議事録）
--
-- ── 箱を別テーブルにしない ──────────────────────────────────
--
-- 箱は「名前が同じ人の集まり」でしかなく、箱そのものに持たせる値がありません。
-- 表を分けると、人を消したときに空の箱が残り、それを消す画面がまた要ります。

ALTER TABLE gpm_members ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE gpm_members ADD COLUMN IF NOT EXISTS group_label TEXT;
ALTER TABLE gpm_members ADD COLUMN IF NOT EXISTS badge TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_gpm_members_tier') THEN
    ALTER TABLE gpm_members ADD CONSTRAINT chk_gpm_members_tier
      CHECK (tier IN ('top', 'lead', 'unit'));
  END IF;
END $$;

COMMENT ON COLUMN gpm_members.tier IS
  '組織図の段 top=上段（発注者まわり） / lead=中段（全体統括） / unit=下段（実務のユニット）';
COMMENT ON COLUMN gpm_members.group_label IS
  '組織図の箱の名前。同じ名前の人が1つの箱に入る。空なら立場（side）の名前で束ねる';
COMMENT ON COLUMN gpm_members.badge IS
  '箱の中で目立たせる印（決裁 / 進行 / 議事録 など）。無ければ NULL';

-- 段 → 並び順 で読む（組織図は上から下へ描く）
CREATE INDEX IF NOT EXISTS idx_gpm_members_tier
  ON gpm_members(gpm_project_id, tier, sort_order);
