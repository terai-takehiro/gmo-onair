-- 132: マイカレンダーの双方向同期 (書き戻し) + 個人予定の共有
--
-- 1. 書き戻し追跡列 (personal_events)
--    手入力の個人予定 (source='manual') を Google/Outlook 側にも作成 (push) したとき、
--    その外部イベント id を保持して以後の更新/削除を外部にも反映できるようにする。
--    - external_provider  : 'google' | 'outlook' (どちらの外部カレンダーに作ったか)
--    - external_event_id  : 外部カレンダーが返したイベント id (更新/削除で使う)
--    - external_synced_at : 最後に外部へ反映した時刻
--
-- 2. 連携アカウントに can_write フラグ
--    v2.9.190/191 の連携は読み取り専用スコープ (calendar.readonly / Calendars.Read)。
--    書き戻しには書き込みスコープ (calendar.events / Calendars.ReadWrite) での再連携が必要。
--    新スコープで連携できたアカウントだけ can_write=1 とし、UI は未対応アカウントに再連携を促す。
--
-- 3. 個人予定の共有 (personal_event_shares)
--    会議予定などを複数メンバーに共有する。共有先は各受け手 1 行。
--    - 受け手は内容を編集可 (共同編集)、予定自体の削除は作成者のみ (受け手は自分の共有を外すのみ)。
--    - 共有先に選べるのは partner_schedule 権限保持者 (マイカレンダーの利用者) のみ (アプリ側で制限)。

-- 1. 書き戻し追跡列
ALTER TABLE personal_events ADD COLUMN IF NOT EXISTS external_provider  TEXT;
ALTER TABLE personal_events ADD COLUMN IF NOT EXISTS external_event_id  TEXT;
ALTER TABLE personal_events ADD COLUMN IF NOT EXISTS external_synced_at TIMESTAMP;

-- 2. 書き込み可能フラグ (新スコープで連携できたら 1)
ALTER TABLE personal_google_accounts ADD COLUMN IF NOT EXISTS can_write INTEGER NOT NULL DEFAULT 0;
ALTER TABLE personal_ms_accounts     ADD COLUMN IF NOT EXISTS can_write INTEGER NOT NULL DEFAULT 0;

-- 3. 個人予定の共有
CREATE TABLE IF NOT EXISTS personal_event_shares (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES personal_events(id),
  user_id     TEXT NOT NULL REFERENCES users(id),   -- 共有先 (受け手)
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  TEXT
);

-- 同一予定 × 同一受け手の重複を防止
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_event_shares
  ON personal_event_shares(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_personal_event_shares_user
  ON personal_event_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_event_shares_event
  ON personal_event_shares(event_id);
