-- 119: 日常業務アプリ (dailyops) — 内覧会 来場予約
-- Kairos3 の登録通知メール (info@gmo-globalstudio.com 宛) をベースに、
-- 内覧会の「回 (セッション)」ごとの参加者名簿を管理する。
-- セッションは登録の session_label / session_date から自動グループ化 (マスター table は持たない)。
-- 代表者 (1 登録 = 1 行) + 同行者 (companions JSONB) を分けて保持。当日の来場チェック付き。

CREATE TABLE IF NOT EXISTS inview_registrations (
  id             TEXT PRIMARY KEY,
  -- 内覧会の回 (セッション)
  session_label  TEXT NOT NULL DEFAULT '',   -- 生の「参加希望の回」(例: 2026/7/29(水)14:00-17:00｜イベント主催者向け)
  session_date   TEXT,                        -- 回の日付 YYYY-MM-DD (session_label から抽出、グループ/並び替え用・不明は NULL)
  session_time   TEXT,                        -- 回の時間帯 (例: 14:00-17:00)
  session_audience TEXT,                       -- 回の対象 (例: イベント主催者向け)
  -- 代表者 (申込者)
  name           TEXT NOT NULL,
  furigana       TEXT,
  email          TEXT,
  company        TEXT,                         -- 会社情報 (会社名+部署 等をそのまま)
  role           TEXT,                         -- 役職
  postal_code    TEXT,
  address        TEXT,
  phone          TEXT,
  fax            TEXT,
  mobile         TEXT,
  mail_consent   BOOLEAN,                       -- メール配信可否 (承諾=true)
  -- 参加内容
  party_size     INTEGER NOT NULL DEFAULT 1,    -- ご参加人数
  companions     JSONB,                         -- 同行者 (ご参加者2〜5 の名前) 文字列配列
  visit_time     TEXT,                          -- ご来場予定時間
  interests      TEXT,                          -- ご興味・ご相談事項
  notes          TEXT,                          -- 運営メモ (人間追記)
  source         TEXT NOT NULL DEFAULT 'kairos3', -- 取り込み元 (kairos3 / manual 等)
  -- 当日の来場チェック
  checked_in_at  TIMESTAMP,
  checked_in_by  TEXT,
  -- 監査・共通
  requested_by   TEXT,                          -- AI 起票の指示者
  created_by     TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inview_session ON inview_registrations(session_date DESC, session_label);
CREATE INDEX IF NOT EXISTS idx_inview_email ON inview_registrations(email) WHERE deleted_at IS NULL;
