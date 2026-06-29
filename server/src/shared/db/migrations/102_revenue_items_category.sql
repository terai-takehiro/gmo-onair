-- 102: 見積/売上明細にカテゴリを追加 (見積書でカテゴリごとに内訳を整理して出力するため)
ALTER TABLE revenue_items ADD COLUMN IF NOT EXISTS category TEXT;
