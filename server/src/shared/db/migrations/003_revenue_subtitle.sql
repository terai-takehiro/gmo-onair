-- 売上明細にサブタイトル（番号ラベル）を追加
-- A系案件で -001 = "2025年株主総会", -002 = "2026年株主総会" などの小見出しを保持
ALTER TABLE revenues ADD COLUMN subtitle TEXT;
