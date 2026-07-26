-- 143: 問い合わせの返信の下書き (AIが作る → 人が直して保存する → 送ったと記録する)
--
-- **教師データの本体はここではない**。AI が出した全文は `ai_outputs`、
-- 人が直した差分は `ai_corrections`、送った/使わなかったは `ai_outcomes`
-- (migration 134 の共通3テーブル) に入る。ここは**作業中の文面の置き場所**。
--
-- 1問い合わせ = 1行 (作り直したら上書き) にしてある。版を溜めても読む人がおらず、
-- **AI が出した原文は ai_outputs 側に必ず残る**ので下書きの履歴は要らない。
--
-- 送信は ONAiR からは行わない (メールの送信経路を持っていない)。
-- 人が保存した本文をコピーして自分のメールで送り、「送った」を記録する。

CREATE TABLE IF NOT EXISTS inquiry_replies (
  inquiry_id   TEXT PRIMARY KEY REFERENCES misc_inquiries(id),
  -- AI が出した原文。**人が直しても変えない** (差分の起点になる)
  ai_text      TEXT,
  -- ai_outputs.id。ここから修正差分と成果を辿る
  ai_output_id TEXT,
  -- 人が直して保存した本文。NULL = まだ保存していない
  final_text   TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'saved', 'sent', 'unused')),
  -- 送ったと記録した日時 (ONAiR が送るわけではない)
  sent_at      TIMESTAMP,
  -- 直した理由 (任意)。必須にすると入力されず空になる
  note         TEXT,
  model        TEXT,
  prompt_version TEXT,
  created_by   TEXT,
  updated_by   TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_replies_status
  ON inquiry_replies(status, updated_at DESC);
