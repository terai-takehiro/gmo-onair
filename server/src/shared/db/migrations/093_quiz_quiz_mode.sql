-- v2.9.2: クイズモード追加 (mode survey|quiz / has_answer_check / is_correct)

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'survey'
    CHECK (mode IN ('survey','quiz')),
  ADD COLUMN IF NOT EXISTS has_answer_check BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE quiz_choices
  ADD COLUMN IF NOT EXISTS is_correct BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE quiz_cue_state DROP CONSTRAINT IF EXISTS quiz_cue_state_step_check;
ALTER TABLE quiz_cue_state
  ADD CONSTRAINT quiz_cue_state_step_check
  CHECK (step IN ('idle','poll','reveal','winner','answer-check','correct-reveal'));
