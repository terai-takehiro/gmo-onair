-- 売上に概算見積/確定ステータスを追加
ALTER TABLE revenues ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
