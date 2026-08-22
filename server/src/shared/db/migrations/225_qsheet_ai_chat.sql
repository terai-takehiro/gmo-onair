-- ============================================================
-- 225: 制作資料 v4 — AI 壁打ち（段8 / 04-ai.md §4-2）
--
-- ④壁打ち（対話）のスレッドと発言。①②③の提案テーブル（qsheet_ai_proposals・
-- migration 222）とは別物 — 対話は「直される」ものではないので、条件2の代わりに
-- 3値フィードバック（good/rephrase/reject）を発言に持たせる（04-ai.md §5-2b）。
--
-- **本人のみ**（04-ai.md §14-8 の決定）。チーム共有は第1版で作らない。
-- ============================================================

CREATE TABLE IF NOT EXISTS qsheet_ai_threads (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL DEFAULT '',
  -- 何について話しているか。全部 NULL の「素の壁打ち」も許す
  project_id   TEXT REFERENCES projects(id),
  schedule_id  TEXT REFERENCES qsheet_schedules(id) ON DELETE SET NULL,
  document_id  TEXT REFERENCES qsheet_documents(id) ON DELETE SET NULL,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_qsheet_ai_threads_owner
  ON qsheet_ai_threads(created_by, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS qsheet_ai_messages (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL REFERENCES qsheet_ai_threads(id) ON DELETE CASCADE,
  -- 表示順。created_at では並べない（同一ミリ秒の user/assistant が入れ替わりうる）
  seq          INTEGER NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  -- assistant のとき、その発言に「提案の種」があれば入れる
  -- { "suggests": "script_outline", "hint": "..." } → 画面が [骨格を作る] を出す
  suggestion   JSONB,
  -- assistant のときだけ。この発言1つが ai_outputs の1行に対応する
  -- （target_table='qsheet_ai_messages' / target_id=この行の id。04 §3-3 の統一）
  ai_output_id TEXT REFERENCES ai_outputs(id),
  model        TEXT,
  prompt_version TEXT,
  -- 条件2の代わり（§5-2b）。人が発言に付ける3値。
  -- good = 役に立った / rephrase = 言い直させた / reject = 的外れ
  feedback     TEXT CHECK (feedback IN ('good', 'rephrase', 'reject')),
  feedback_note TEXT,
  feedback_at  TIMESTAMPTZ,
  feedback_by  TEXT REFERENCES users(id),
  -- この発言から提案を起こしたか（採用の proxy）。これが④の主指標
  spawned_proposal_id TEXT REFERENCES qsheet_ai_proposals(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (thread_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_qsheet_ai_msg_thread
  ON qsheet_ai_messages(thread_id, seq);
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_msg_output
  ON qsheet_ai_messages(ai_output_id) WHERE ai_output_id IS NOT NULL;
