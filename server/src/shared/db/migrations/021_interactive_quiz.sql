-- 021: クイズ/アンケート機能
-- 択一式の問題をストックし、管理者が集計開始/終了を制御

-- 問題テーブル (イベント単位でストック)
CREATE TABLE IF NOT EXISTS interactive_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id TEXT NOT NULL REFERENCES interactive_events(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'quiz' CHECK (type IN ('quiz', 'survey')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  correct_index INTEGER,  -- クイズの正解インデックス (0-based)、アンケートはNULL
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  config JSONB NOT NULL DEFAULT '{}',  -- 制限時間等の設定
  activated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 問題テキスト (多言語対応 — 言語ごとに問題文と選択肢)
CREATE TABLE IF NOT EXISTS interactive_question_texts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  question_id TEXT NOT NULL REFERENCES interactive_questions(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL DEFAULT 'ja',
  question_text TEXT NOT NULL,         -- 問題文
  choices JSONB NOT NULL DEFAULT '[]', -- ["選択肢A", "選択肢B", "選択肢C", ...]
  UNIQUE(question_id, language_code)
);

-- 回答テーブル (言語共通 — choice_indexで管理)
CREATE TABLE IF NOT EXISTS interactive_answers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  question_id TEXT NOT NULL REFERENCES interactive_questions(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES interactive_sessions(id) ON DELETE SET NULL,
  choice_index INTEGER NOT NULL,       -- 選択した選択肢のインデックス (0-based)
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_interactive_questions_event ON interactive_questions(event_id);
CREATE INDEX IF NOT EXISTS idx_interactive_question_texts_question ON interactive_question_texts(question_id);
CREATE INDEX IF NOT EXISTS idx_interactive_answers_question ON interactive_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_interactive_answers_session ON interactive_answers(session_id);

-- 1セッション1問1回答の制約
CREATE UNIQUE INDEX IF NOT EXISTS idx_interactive_answers_unique
  ON interactive_answers(question_id, session_id);
