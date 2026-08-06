-- ============================================================
-- 打合せの録音 → 文字起こし → 議事録の下書き (v4 ⑥ やり取りタブ)
--
-- ご判断: 文字起こしは **Whisper**。AI のレビューは月1回・営業のマネージャー。
--
-- ── 音声そのものは保存しない ──────────────────────────────
--
-- 容量 (1時間で数十MB) と、**取引先の声が入る**ため。文字起こしが済んだら
-- 音声は捨て、`transcript` (全文) だけを残す。録音を残したい打合せは
-- BOX の社内限りフォルダに人が置く。
--
-- ── なぜ `meeting_minutes` を使わないか ────────────────────
--
-- あちらは **全社の隔週会議のサマリ**で、主キーが `meeting_date` (日付1つに1行)。
-- 案件の打合せは同じ日に複数あり、案件にぶら下がる。別のものなので別の表にする。
--
-- ── 状態を持たせる理由 ──────────────────────────────────
--
-- 文字起こしは**1時間の録音で数分かかる**。リクエストの中で待つと
-- nginx の 60 秒で切れるので、行を先に作って裏で進め、画面は状態を見に来る。
--   transcribing … 処理中
--   draft        … AI が下書きを作った (人がまだ直していない)
--   confirmed    … 人が確定した
--   failed       … 失敗 (理由は error_message)
-- ============================================================

CREATE TABLE IF NOT EXISTS project_minutes (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  status         TEXT NOT NULL DEFAULT 'transcribing'
                 CHECK (status IN ('transcribing', 'draft', 'confirmed', 'failed')),
  error_message  TEXT,

  title          TEXT NOT NULL DEFAULT '',
  met_on         TEXT,          -- 打合せの日 (YYYY-MM-DD)
  attendees      TEXT,          -- 出席者 (自由記述)

  -- 文字起こしの全文。**切り詰めない** — 直すときに元を見られないと直せない
  transcript     TEXT,
  -- 録音の長さ (秒)。課金と「長すぎないか」の目安
  duration_sec   INTEGER,

  -- AI が整形したもの。人が直したらここが上書きされる
  summary        TEXT,
  -- 決定事項 string[]
  decisions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 未確認事項 (持ち帰り) {text, owner, due}[]
  open_items     JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_meeting   TEXT,          -- 次回 (YYYY-MM-DD)

  -- AI 出力との突合。人が直した差分を `ai_corrections` に残すのに使う
  ai_output_id   TEXT,
  model          TEXT,
  prompt_version TEXT,

  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by     TEXT,
  updated_by     TEXT,
  confirmed_at   TIMESTAMP,
  confirmed_by   TEXT,
  deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_minutes_project
  ON project_minutes (project_id, created_at DESC) WHERE deleted_at IS NULL;

-- 「処理中のまま止まっている」ものを拾うため (サーバーが落ちた場合など)
CREATE INDEX IF NOT EXISTS idx_project_minutes_transcribing
  ON project_minutes (created_at) WHERE status = 'transcribing' AND deleted_at IS NULL;
