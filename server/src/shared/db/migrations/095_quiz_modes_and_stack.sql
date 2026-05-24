-- v2.9.4: モード 3 パターン化 + イベント単位の stack 送出状態

-- mode: 'survey' (結果発表あり) / 'survey-only' (質問のみ) / 'quiz'
ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_mode_check;
ALTER TABLE quizzes
  ADD CONSTRAINT quizzes_mode_check
  CHECK (mode IN ('survey','survey-only','quiz'));

-- イベント単位の現在 quiz + cue (operator が PRV/NEXT で切替)
CREATE TABLE IF NOT EXISTS quiz_stack_state (
  event_id         INTEGER PRIMARY KEY REFERENCES awards_events(id) ON DELETE CASCADE,
  current_quiz_id  INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
  step             VARCHAR(20) NOT NULL DEFAULT 'idle'
                    CHECK (step IN ('idle','poll','reveal','winner','answer-check','correct-reveal')),
  poll_started_at  TIMESTAMPTZ,
  reveal_phase     SMALLINT NOT NULL DEFAULT 0 CHECK (reveal_phase BETWEEN 0 AND 2),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
