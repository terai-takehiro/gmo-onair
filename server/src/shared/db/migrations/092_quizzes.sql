-- v2.9.0: アンケート/クイズCG モジュール (event ごと, choice 2-6, per-quiz countdown)

CREATE TABLE quizzes (
  id                SERIAL PRIMARY KEY,
  event_id          INTEGER NOT NULL REFERENCES awards_events(id) ON DELETE CASCADE,
  title             TEXT NOT NULL DEFAULT '',
  title_en          TEXT,
  question          TEXT NOT NULL DEFAULT '',
  question_en       TEXT,
  choice_count      SMALLINT NOT NULL DEFAULT 3 CHECK (choice_count BETWEEN 2 AND 6),
  countdown_seconds INTEGER NOT NULL DEFAULT 60 CHECK (countdown_seconds BETWEEN 5 AND 600),
  link_category_id  INTEGER REFERENCES awards_categories(id) ON DELETE SET NULL,
  display           VARCHAR(10) NOT NULL DEFAULT 'count' CHECK (display IN ('count','percent')),
  display_order     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quizzes_event ON quizzes(event_id);

CREATE TABLE quiz_choices (
  id                  SERIAL PRIMARY KEY,
  quiz_id             INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position            SMALLINT NOT NULL,
  name                TEXT NOT NULL DEFAULT '',
  name_en             TEXT,
  company             TEXT,
  company_en          TEXT,
  nomination_title    TEXT,
  nomination_title_en TEXT,
  photo_data_url      TEXT,
  vote_count          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (quiz_id, position)
);
CREATE INDEX IF NOT EXISTS idx_quiz_choices_quiz ON quiz_choices(quiz_id);

CREATE TABLE quiz_cue_state (
  quiz_id         INTEGER PRIMARY KEY REFERENCES quizzes(id) ON DELETE CASCADE,
  step            VARCHAR(20) NOT NULL DEFAULT 'idle'
                    CHECK (step IN ('idle','poll','reveal','winner')),
  poll_started_at TIMESTAMPTZ,
  reveal_phase    SMALLINT NOT NULL DEFAULT 0 CHECK (reveal_phase BETWEEN 0 AND 2),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
