-- 122: パートナースケジュール + マイカレンダー (個人予定 + ICS 購読フィード)
--
-- カレンダーアプリ (/studio/*) の拡張。
--   1. partner_schedules   — 代休/有給/出張/社外活動 等をパートナー (権限モジュール
--      'partner_schedule' 保持者) 間で共有するスケジュール。センシティブなため
--      権限のないアカウントには一切見せない。
--   2. personal_events     — 個人予定 (本人のみ閲覧可)。手入力 (source='manual') と
--      Outlook/Google の ICS 購読からの同期分 (source='ics') を同居させる。
--   3. personal_ics_feeds  — ユーザーごとの ICS 購読フィード (Outlook/Google の公開
--      ICS URL)。URL は秘密情報のため AES-256-GCM で暗号化して保存 (url_enc)。
--
-- 日時は studio_bookings と同じ TEXT (ISO 文字列) 方式 — 文字列比較でフィルタする
-- 既存流儀に合わせる (v2.9.144 の型不一致バグの教訓)。

-- 1. パートナースケジュール (パートナー間共有)
CREATE TABLE IF NOT EXISTS partner_schedules (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),  -- 誰の予定か
  schedule_type  TEXT NOT NULL DEFAULT 'other'
                   CHECK (schedule_type IN ('daikyu','paid_leave','business_trip','external','remote','other')),
                   -- 代休 / 有給 / 出張 / 社外活動 / リモート / その他
  title          TEXT NOT NULL,
  all_day        INTEGER NOT NULL DEFAULT 1,
  start_time     TEXT NOT NULL,                        -- ISO 文字列 (終日は YYYY-MM-DD)
  end_time       TEXT NOT NULL,                        -- 終日は inclusive の最終日
  notes          TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by     TEXT,
  updated_by     TEXT,
  deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_schedules_time
  ON partner_schedules(start_time, end_time) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_partner_schedules_user
  ON partner_schedules(user_id) WHERE deleted_at IS NULL;

-- 2. 個人予定 (本人のみ。手入力 + ICS 同期分)
CREATE TABLE IF NOT EXISTS personal_events (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  title          TEXT NOT NULL,
  all_day        INTEGER NOT NULL DEFAULT 0,
  start_time     TEXT NOT NULL,
  end_time       TEXT NOT NULL,
  location       TEXT,
  notes          TEXT,
  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ics')),
  feed_id        TEXT,                                 -- source='ics' のとき personal_ics_feeds.id
  ics_key        TEXT,                                 -- VEVENT UID (+ 繰り返しは occurrence 開始) の重複排除キー
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_events_feed_key
  ON personal_events(feed_id, ics_key) WHERE feed_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_personal_events_user_time
  ON personal_events(user_id, start_time) WHERE deleted_at IS NULL;

-- 3. ICS 購読フィード (ユーザーごと複数可: 会社Outlook + 個人Google 等)
CREATE TABLE IF NOT EXISTS personal_ics_feeds (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  label          TEXT NOT NULL,                        -- 例: 会社Outlook / 個人Google
  url_enc        TEXT NOT NULL,                        -- AES-256-GCM 暗号化 (iv:authTag:cipher hex)
  enabled        INTEGER NOT NULL DEFAULT 1,
  last_synced_at TIMESTAMP,
  last_error     TEXT,
  event_count    INTEGER,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personal_ics_feeds_user
  ON personal_ics_feeds(user_id) WHERE deleted_at IS NULL;
