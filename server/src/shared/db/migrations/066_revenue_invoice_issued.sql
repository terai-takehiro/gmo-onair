-- 066: 売上に「請求書発行済」フラグを追加
--
-- 用途: 月別詳細等で、請求書が発行済かをバッジ表示するため。
-- 既存の invoice_groups テーブルとは独立（将来連携する場合は invoice_group_id で結合する想定）。

ALTER TABLE revenues
  ADD COLUMN IF NOT EXISTS invoice_issued BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN revenues.invoice_issued IS '請求書発行済フラグ（UI 上でチェックボックス化）';
