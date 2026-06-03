-- v2.9.48: 仕入・販管費に「申請URL」(精算申請ページ等の任意 URL) を追加
ALTER TABLE purchases    ADD COLUMN IF NOT EXISTS settlement_url TEXT;
ALTER TABLE sga_expenses ADD COLUMN IF NOT EXISTS settlement_url TEXT;
