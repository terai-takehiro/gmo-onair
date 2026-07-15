-- v2.9.195: メール自動取込の冪等性・信頼性向上 + 見積ドラフト
-- #1 messageID 紐付け / #2 idempotency_key / #3 流入チャネル / #4 見積ドラフト状態
--
-- 設計:
--  - message_id     = 由来メールの Message-ID (紐付け・検索用。UNIQUE にはしない —
--                     1 通のメールが案件と活動記録の両方を生むのは正当なため)
--  - idempotency_key= 冪等キー (AI が意図単位で作る。例 "email:<msgid>:project")。
--                     partial unique で二重登録をサーバー側で確実に弾く
--  - source_channel = 流入チャネル (info@ / sales@cc / phone 等の自由文字列)
--  - simulations.status = 'draft'(AI下書き・未確定) / 'final'(確定)。
--                     既存行と UI 保存は final のまま (DEFAULT 'final' で後方互換)

-- ── #1/#2/#3: projects ──────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS message_id      TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_channel  TEXT;

-- ── #1/#2/#3: activity_logs ─────────────────────────
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS message_id      TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS source_channel  TEXT;

-- 冪等キーの一意制約 (未削除・キーあり行のみ)。二重登録を DB レベルで防ぐ。
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_idempotency_key
  ON projects(idempotency_key) WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_logs_idempotency_key
  ON activity_logs(idempotency_key) WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

-- messageID は紐付け・検索用の非一意インデックス
CREATE INDEX IF NOT EXISTS idx_projects_message_id       ON projects(message_id)       WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_message_id   ON activity_logs(message_id)  WHERE message_id IS NOT NULL;

-- ── #4: simulations.status (draft/final) ────────────
ALTER TABLE simulations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'final';
-- 念のため既存 NULL を final に (DEFAULT があるため通常は不要だが冪等・安全側)
UPDATE simulations SET status = 'final' WHERE status IS NULL;
CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(project_id, status);
