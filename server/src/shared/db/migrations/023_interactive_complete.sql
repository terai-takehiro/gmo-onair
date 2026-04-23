-- 023: Interactive schema — complete rebuild
-- Ensures ALL required columns exist regardless of prior migration state

-- ===== interactive_events =====
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS survey_url TEXT;
ALTER TABLE interactive_events ADD COLUMN IF NOT EXISTS accepting BOOLEAN NOT NULL DEFAULT false;

-- ===== interactive_stamps =====
ALTER TABLE interactive_stamps ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ===== interactive_stamp_counts unique index =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'interactive_stamp_counts_bucket_unique') THEN
    CREATE UNIQUE INDEX interactive_stamp_counts_bucket_unique ON interactive_stamp_counts(stamp_id, bucket_at);
  END IF;
END$$;

-- ===== interactive_channels (create if not exists) =====
CREATE TABLE IF NOT EXISTS interactive_channels (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id TEXT NOT NULL REFERENCES interactive_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'デフォルト',
  language_code TEXT DEFAULT 'ja',
  youtube_url TEXT,
  banner_url TEXT,
  admin_comment TEXT,
  survey_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interactive_channels_event ON interactive_channels(event_id);

-- ===== interactive_questions (create if not exists) =====
CREATE TABLE IF NOT EXISTS interactive_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id TEXT NOT NULL REFERENCES interactive_events(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'quiz' CHECK (type IN ('quiz', 'survey')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  correct_index INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  config JSONB NOT NULL DEFAULT '{}',
  activated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interactive_questions_event ON interactive_questions(event_id);

CREATE TABLE IF NOT EXISTS interactive_question_texts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  question_id TEXT NOT NULL REFERENCES interactive_questions(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL DEFAULT 'ja',
  question_text TEXT NOT NULL,
  choices JSONB NOT NULL DEFAULT '[]',
  UNIQUE(question_id, language_code)
);
CREATE INDEX IF NOT EXISTS idx_interactive_question_texts_question ON interactive_question_texts(question_id);

CREATE TABLE IF NOT EXISTS interactive_answers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  question_id TEXT NOT NULL REFERENCES interactive_questions(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES interactive_sessions(id) ON DELETE SET NULL,
  choice_index INTEGER NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interactive_answers_question ON interactive_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_interactive_answers_session ON interactive_answers(session_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_interactive_answers_unique') THEN
    CREATE UNIQUE INDEX idx_interactive_answers_unique ON interactive_answers(question_id, session_id);
  END IF;
END$$;
