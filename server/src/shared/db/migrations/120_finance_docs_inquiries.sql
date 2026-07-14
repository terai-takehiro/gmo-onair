-- 120: 日常業務アプリ (dailyops) — 見積/請求書 と その他問い合わせ
-- どちらも「メールで受信 → AI が MCP 取込 → 人が処理」の受信箱型トラッキング。
-- 内覧会 (119) と同じく専用 table + 自動グループ化/フィルタ、回のマスターは持たない。

-- 見積/請求書/注文書の処理進捗
--   status: new(受信) → reviewing(確認) → approved(承認) / rejected(却下) → processed(処理完了)
CREATE TABLE IF NOT EXISTS finance_docs (
  id             TEXT PRIMARY KEY,
  doc_type       TEXT NOT NULL DEFAULT 'invoice'
                   CHECK (doc_type IN ('quote','invoice','order')), -- 見積書/請求書/注文書
  sender         TEXT,                          -- 送付者 (取引先・担当者)
  subject        TEXT,                          -- メール件名 / 書類名
  content        TEXT,                          -- 内容 (要約)
  amount         NUMERIC(14,2),                 -- 金額 (税込)
  closing_month  TEXT,                          -- 締月 (YYYY-MM)
  payment_due    TEXT,                          -- 支払期日 (YYYY-MM-DD)
  status         TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','reviewing','approved','rejected','processed')),
  received_at    TEXT,                          -- 受信日 (YYYY-MM-DD)
  processed_by   TEXT,                          -- 請求処理をした人 (氏名)
  processed_at   TIMESTAMP,                     -- 処理完了日時
  gls_number     TEXT,                          -- 関連案件 GLS (任意)
  notes          TEXT,
  source         TEXT NOT NULL DEFAULT 'email', -- email / manual
  message_id     TEXT,                          -- メール Message-ID (重複取込ガード・任意)
  requested_by   TEXT,
  created_by     TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_finance_docs_status ON finance_docs(status, doc_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_docs_received ON finance_docs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_docs_msgid ON finance_docs(message_id) WHERE message_id IS NOT NULL AND deleted_at IS NULL;

-- その他問い合わせ (スパム/営業/メルマガを除いた有益メール)。AI が分類・重要度を付与する。
CREATE TABLE IF NOT EXISTS misc_inquiries (
  id             TEXT PRIMARY KEY,
  sender         TEXT,                          -- 送信者
  subject        TEXT,                          -- 件名
  summary        TEXT NOT NULL,                 -- 要約 (AI 生成)
  category       TEXT,                          -- 分類タグ (問い合わせ/協業/取材/採用 等・自由)
  importance     TEXT NOT NULL DEFAULT 'medium'
                   CHECK (importance IN ('high','medium','low')),
  action_needed  TEXT,                          -- 推奨アクション (AI 提案)
  url            TEXT,                          -- 参考 URL (任意)
  received_at    TEXT,                          -- 受信日 (YYYY-MM-DD)
  handled_at     TIMESTAMP,                     -- 対応済み日時 (NULL=未対応)
  handled_by     TEXT,
  notes          TEXT,
  source         TEXT NOT NULL DEFAULT 'email',
  message_id     TEXT,
  requested_by   TEXT,
  created_by     TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_misc_inquiries_handled ON misc_inquiries(handled_at, importance) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_misc_inquiries_received ON misc_inquiries(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_misc_inquiries_msgid ON misc_inquiries(message_id) WHERE message_id IS NOT NULL AND deleted_at IS NULL;
