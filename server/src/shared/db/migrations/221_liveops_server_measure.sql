-- ============================================================
-- 221: 計時・視聴者 — 視聴者の取得をサーバー側へ移す
--
-- 実装設計: docs/design/v4/qsheet-v4-coding/impl/09-live-timer-impl.md §3
--
-- ⚠️ 型に注意。liveops_programs.id / liveops_timers.id は **UUID**（052:18,47）。
--    users.id は TEXT（052:4）。ここを取り違えると ALTER が落ちる。
--    09 の当初案は TEXT で FK を書いていたが、それでは流れない（実装で確認済み）。
-- ⚠️ 既存の liveops_snapshots は1列も変えない（表示画面がこの表を読んでいる）。
-- ============================================================

-- ── ① 組織共通の鍵（1行だけ） ────────────────────────────────
-- 列名は liveops_settings に揃える（`*_enc`）。暗号は既存の AES-256-GCM（liveops/crypto.ts）。
CREATE TABLE IF NOT EXISTS liveops_org_settings (
  id                      BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  youtube_api_key_enc     TEXT,
  jstream_token_enc       TEXT,
  zoom_account_id_enc     TEXT,
  zoom_client_id_enc      TEXT,
  zoom_client_secret_enc  TEXT,
  teams_tenant_id_enc     TEXT,
  teams_client_id_enc     TEXT,
  teams_client_secret_enc TEXT,
  -- ⚠️ liveops_settings.polling_interval_sec は PK が user_id の1人1行の表で、
  --    サーバー側計測には「その人」がいない。取得間隔の正はここに置く。
  polling_interval_sec    INTEGER NOT NULL DEFAULT 10
                          CHECK (polling_interval_sec BETWEEN 5 AND 300),
  updated_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 行は最初から1本だけ置く（無いと画面が「まだ無い」と「未設定」を区別できない）
INSERT INTO liveops_org_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- ── ② 計測の状態（liveops_programs に足す） ──────────────────
ALTER TABLE liveops_programs
  ADD COLUMN IF NOT EXISTS measuring          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS measure_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS measure_started_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS measure_until      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS measure_until_kind TEXT NOT NULL DEFAULT 'default'
                           CHECK (measure_until_kind IN ('default','manual')),
  ADD COLUMN IF NOT EXISTS measure_platforms  JSONB NOT NULL
                           DEFAULT '["youtube","jstream","zoom","teams"]'::jsonb,
  ADD COLUMN IF NOT EXISTS measure_last_ok_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS measure_fail_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS measure_owner      TEXT,     -- 取り合い用のインスタンス印
  -- ⚠️ TEXT ではなく UUID（liveops_timers.id が UUID のため）
  ADD COLUMN IF NOT EXISTS main_timer_id      UUID REFERENCES liveops_timers(id) ON DELETE SET NULL;

-- ── ③ 同時 1 案件を DB で担保する ─────────────────────────────
-- 「measuring = true の行は全体で高々1行」を部分ユニーク索引で表す。
-- WHERE measuring で対象を true の行だけに絞ると、索引に入る値はすべて true に
-- なるので、その列を一意にする＝全体で1行しか true にできない。
CREATE UNIQUE INDEX IF NOT EXISTS liveops_single_measurement
  ON liveops_programs (measuring) WHERE measuring;

-- ── ④ 取得の記録（失敗が誰にも見えない問題） ───────────────────
CREATE TABLE IF NOT EXISTS liveops_poll_log (
  id          BIGSERIAL PRIMARY KEY,
  program_id  UUID NOT NULL REFERENCES liveops_programs(id) ON DELETE CASCADE,  -- ⚠️ UUID
  at          TIMESTAMP NOT NULL DEFAULT NOW(),
  platform    TEXT NOT NULL,   -- youtube | jstream | zoom | teams | system
  level       TEXT NOT NULL CHECK (level IN ('ok','error','info')),
  count       INTEGER,
  units       INTEGER NOT NULL DEFAULT 0,   -- 消費した割り当て（YouTube 呼び出しごとに毎回入る）
  message     TEXT
);
CREATE INDEX IF NOT EXISTS liveops_poll_log_prog
  ON liveops_poll_log (program_id, at DESC);
-- 「今日の消費」を数えるため。JST の境目ではなく太平洋時間で切る（YouTube のリセットが太平洋時間 0:00 のため）
CREATE INDEX IF NOT EXISTS liveops_poll_log_yt_at
  ON liveops_poll_log (at DESC) WHERE platform = 'youtube';

-- ── ⑤ 案件から 1:1 で引く ──────────────────────────────────
-- 張る前に重複が無いことを migration 側で確認する（重複があるとここで落ちる）。
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT project_id FROM liveops_programs
     WHERE project_id IS NOT NULL AND deleted_at IS NULL
     GROUP BY project_id HAVING COUNT(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION '1案件に複数の liveops_programs セッションがあるため liveops_programs_project_key を張れません（% 件）。先に統合してください。', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS liveops_programs_project_key
  ON liveops_programs (project_id)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;
