-- 140: 朝の1通 (Slack) の配信設定
--
-- **1行 = 1回の投稿**にしてある。同じチャンネルを何本でも登録できるので、
-- 「朝は今日の現場・夕方は終わったこと」のように**時刻ごとに内容を変えられる**。
-- 1行に時刻を配列で持つ形にすると内容を分けられず、結局 2 本作ることになる。
--
-- 個人への DM の ON/OFF は user_notification_prefs (migration 137) が持つ。
-- こちらは**全社チャンネルへの投稿だけ**を扱う (触ると全員に出るので管理者のみ)。

CREATE TABLE IF NOT EXISTS slack_digests (
  id           TEXT PRIMARY KEY,
  -- 覚え書き (例「朝の共有」「夕方のふりかえり」)
  label        TEXT,
  -- 投稿先。'#name' か Slack のチャンネルID (C…) のどちらでも受ける
  channel      TEXT NOT NULL,
  -- 送る時刻 (JST の 'HH:MM')
  send_time    TEXT NOT NULL DEFAULT '06:00',
  -- 送る曜日。ISO の 1=月 … 7=日 をカンマ区切りで (既定は平日)
  weekdays     TEXT NOT NULL DEFAULT '1,2,3,4,5',
  -- 出す内容のキー配列。並び順がそのまま本文の順になる
  blocks       JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  -- 二重送信を防ぐための「最後に送った時刻」
  last_sent_at TIMESTAMP,
  last_error   TEXT,
  created_by   TEXT,
  updated_by   TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_slack_digests_enabled
  ON slack_digests(enabled, send_time) WHERE deleted_at IS NULL;

-- 個人への DM の「いつ送るか」。**1行だけ** (singleton)。
-- 受け取るかどうかは各自が user_notification_prefs.morning_slack で決めるので、
-- ここは時刻と曜日だけを持つ (人ごとに時刻を変えたい要望は今は無い)。
CREATE TABLE IF NOT EXISTS slack_dm_settings (
  id           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  send_time    TEXT NOT NULL DEFAULT '06:00',
  weekdays     TEXT NOT NULL DEFAULT '1,2,3,4,5',
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMP,
  last_error   TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO slack_dm_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
