-- 販管費の勘定科目 (v4)
--
-- モックの販管費は **勘定科目**（通信費 / 地代家賃 / 旅費交通費 / その他）で絞る。
-- `sga_expenses` は 固定費/都度 (`expense_type`) と 社員/経理 (`source`) しか持たず、
-- 「何に使ったお金か」の軸が無かった。
--
-- ── 値を CHECK で縛らない ────────────────────────────────────
--
-- 勘定科目は会計側の科目表に合わせて増える。CHECK で縛ると、科目が1つ増えるたびに
-- マイグレーションが要り、**先に会計で科目を作った月の取り込みが全部 500 になる**。
-- 代わりにマスター表を作り、画面はそこから選ばせる。
-- **既存の行に入れる値は決めない (NULL)** — どの科目だったかは
-- どこにも残っていないので、埋めると作り話になる。画面は NULL を「未設定」で出す。

CREATE TABLE IF NOT EXISTS sga_account_titles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  -- 並び順。会計の科目コード順に並べたいことがあるので数値で持つ
  sort_order  INTEGER NOT NULL DEFAULT 0,
  -- 使わなくなった科目。**消さずに畳む** — 過去の行が参照しているため
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE sga_expenses ADD COLUMN IF NOT EXISTS account_title_id TEXT REFERENCES sga_account_titles(id);

CREATE INDEX IF NOT EXISTS idx_sga_account_title
  ON sga_expenses(account_title_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN sga_expenses.account_title_id IS
  '勘定科目。migration 166 より前の行は NULL（どの科目だったか記録が無い）';

-- モックに出てくる3つ ＋ その他。**足りなければ設定から増やせる**
INSERT INTO sga_account_titles (id, name, sort_order)
SELECT * FROM (VALUES
  ('sga-at-tsushin', '通信費', 10),
  ('sga-at-chidai',  '地代家賃', 20),
  ('sga-at-ryohi',   '旅費交通費', 30),
  ('sga-at-other',   'その他', 900)
) AS v(id, name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM sga_account_titles WHERE sga_account_titles.id = v.id);
