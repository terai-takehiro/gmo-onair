-- v2.9.92: 投票結果ポイントの小数保持
-- 投票結果 Excel の「ポイント総計」「自社票」は小数 (例 297.2 / 76.2) を含むため、
-- INTEGER → NUMERIC(10,1) に拡張して小数第一位まで保持する。
-- 既存の整数値はそのまま (例 100 → 100.0) に保たれる (安全な型拡張)。
ALTER TABLE awards_entries ALTER COLUMN points     TYPE NUMERIC(10,1) USING points::numeric;
ALTER TABLE awards_entries ALTER COLUMN own_points TYPE NUMERIC(10,1) USING own_points::numeric;
