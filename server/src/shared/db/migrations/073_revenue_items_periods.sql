-- 073: revenue_items に期間・備考フィールドを追加（御見積書 PDF 対応）
-- 冪等: IF NOT EXISTS で既存環境に安全適用

ALTER TABLE revenue_items
  ADD COLUMN IF NOT EXISTS period_start TEXT,
  ADD COLUMN IF NOT EXISTS period_end   TEXT,
  ADD COLUMN IF NOT EXISTS item_notes   TEXT;
