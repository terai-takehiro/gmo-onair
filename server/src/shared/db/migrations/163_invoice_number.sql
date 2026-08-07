-- 請求書番号 (v4)
--
-- モックは請求の一覧・詳細に請求書番号を出すが、`revenues` に列が無かった。
-- 決めごと (2026-08-07 承認):
--   ① 年度ごとの通し番号。年度は**暦年** (GMO インターネットグループの決算期に合わせる)
--   ② 取り消しても番号は**欠番のまま**にする。詰めると過去に発行した請求書と食い違う
--   ③ 既存の行は空のまま。**新しく発行するぶんから採る** — 経理が使っている番号と
--      二重にならないようにするため (突き合わせは経理側の番号で続ける)
--
-- 採番の実体は `sequences` テーブル (`seq_name = 'invoice_<年>'`)。
-- `ON CONFLICT DO UPDATE ... RETURNING` でアトミックに採るので、
-- 画面と MCP から同時に発行しても同じ番号は出ない。

ALTER TABLE revenues ADD COLUMN IF NOT EXISTS invoice_no TEXT;

-- **部分一意索引**にする。未採番 (NULL) は何行あってもよいが、
-- 同じ番号が2行に付くことは絶対に許さない (入金消込が番号で突き合わせるため)
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenues_invoice_no
  ON revenues(invoice_no) WHERE invoice_no IS NOT NULL;

COMMENT ON COLUMN revenues.invoice_no IS
  '請求書番号 INV-YYYY-0001。発行時に採番し、取り消しても消さない (同じ請求は同じ番号)';
