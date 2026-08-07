-- 料金表を場所ごとに持つ (v4 大③)
--
-- モックの ⑧ 料金表は**上辺に場所のタブ**があり、用賀・渋谷・青山で別々の表を
-- 持ちます（渋谷・青山は「料金は未定」で空）。いまの `pricing_categories` には
-- 場所の列が無く、**1つの表を全部の案件で使っています**。
--
-- ── どこに持たせるか — 分類（カテゴリ）に持たせる ────────────
--
-- 品目 (`pricing_items`) 側に持たせると、同じ分類の中に用賀の品目と渋谷の品目が
-- 混ざります。分類名（「基本料金」「技術スタッフ」）は場所ごとに作り直すのが
-- 自然で、モックも**分類ごと場所に属している**形（空の場所は分類も0）です。
--
-- ── 既存の 78 品目は用賀に割り当てる ────────────────────────
--
-- いま入っている値は**すべて用賀の料金**です（渋谷・青山は料金未定）。
-- `loc-yoga` は migration 030 で必ず入るので、そこへ寄せます。
-- **NULL のままにしません** — 「どの場所か決まっていない表」があると、
-- どのタブにも出ないか、全部のタブに二重で出るかのどちらかになります。
--
-- ── 場所を消しても料金表は残す ──────────────────────────────
--
-- `studio_locations` は論理削除（`deleted_at`）なので行は消えません。
-- 外部キーは張りますが、**削除連鎖はしません**（過去の見積の根拠が消える）。

ALTER TABLE pricing_categories ADD COLUMN IF NOT EXISTS location_id TEXT;

UPDATE pricing_categories SET location_id = 'loc-yoga' WHERE location_id IS NULL;

DO $$
BEGIN
  -- 万一 loc-yoga が無い環境では NOT NULL にできない（入れる値が決まらない）。
  -- その場合は列だけ足して終わる — **推測で別の場所に入れない**
  IF NOT EXISTS (SELECT 1 FROM pricing_categories WHERE location_id IS NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_categories_location_id_fkey') THEN
      ALTER TABLE pricing_categories ADD CONSTRAINT pricing_categories_location_id_fkey
        FOREIGN KEY (location_id) REFERENCES studio_locations(id);
    END IF;
    ALTER TABLE pricing_categories ALTER COLUMN location_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pricing_categories_location
  ON pricing_categories(location_id, sort_order) WHERE deleted_at IS NULL;

COMMENT ON COLUMN pricing_categories.location_id IS
  'この分類がどの場所の料金表か。品目ではなく分類に持たせる（分類名ごと場所に属するため）';
