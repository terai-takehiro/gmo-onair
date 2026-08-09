-- v4: AI の使用量を1行ずつ残す（費用を下げるための土台）
--
-- ── なぜ新しい表を作るのか ──────────────────────────────────
--
-- `ai_outputs` は**AI が出したもの**の記録で、教師データの器です。
-- 費用を見るには**それでは足りません**:
--   ・下読み（録音中の文字起こし）は「出力」ではないので `ai_outputs` に載らない
--   ・**失敗した呼び出し**も課金されるが、出力が無いので載らない
--   ・文字起こしはトークンではなく**分**で課金される
-- 既存の表で表現できないことを確かめたうえで足しています
-- （`.claude/skills/ai-feedback-loop` の「KPI を新規テーブルで作りたがる」への回答）。
--
-- ── 何に使うか ──────────────────────────────────────────────
--
-- 「どこにいくら掛かっているか」が分からないと、削るところを選べません。
-- 設定 → システムの情報 の「AI の使用量」で、**種類ごと・モデルごと**に出します。
--
-- ── 業務を止めない ──────────────────────────────────────────
--
-- 記録に失敗しても呼び出し自体は成功させます（`ai_outputs` と同じ扱い）。

CREATE TABLE IF NOT EXISTS ai_usage (
  id            TEXT PRIMARY KEY,

  -- 何の呼び出しか。**削る判断はこの単位**でする
  --   intake        … 投入口の行き先判断
  --   minutes       … 議事録の整形
  --   stt           … 文字起こし（本番）
  --   stt_preview   … 下読み（録音中）
  kind          TEXT NOT NULL,
  provider      TEXT,                    -- openai / anthropic
  model         TEXT,

  -- トークン（文字もの）。**キャッシュで読めたぶんは別に持つ** —
  -- 同じ入力を送っても値段が違うので、混ぜると効果が測れない
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,

  -- 文字起こしは**分**で課金される。秒で持って表示側で割る
  audio_seconds INTEGER NOT NULL DEFAULT 0,

  -- 失敗した呼び出しも課金されることがある。**残さないと総額が合わない**
  ok            BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,

  -- 誰の操作か（個人を責めるためではなく、使われ方の偏りを見るため）
  actor_id      TEXT,
  -- 対応する ai_outputs（あれば）。無い呼び出しもある（下読み・失敗）
  ai_output_id  TEXT,

  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 集計は「直近 N 日を種類ごと」が主。created_at を先頭に置く
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_kind    ON ai_usage (kind, created_at DESC);
