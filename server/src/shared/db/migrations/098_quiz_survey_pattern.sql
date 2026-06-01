-- v2.9.36: アンケート (survey) の演出パターン (survey_pattern) を追加
-- 「アンサーチェックのみで終了」と「No.1 発表まで進む」を明示的に分岐
--
-- mode='quiz' の場合は survey_pattern は無効 (常に正解発表)
-- mode='survey' の場合は survey_pattern が意味を持つ:
--   - 'answer-check': poll → answer-check → idle (No.1 発表しない)
--   - 'top-reveal':   poll → [answer-check?] → reveal → winner → idle (フルスクリーン No.1 発表)
--
-- 既存データ (mode='survey') は v2.9.35 までと挙動を変えないため top-reveal をデフォルトに。
ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS survey_pattern VARCHAR(20);

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_survey_pattern_check;
ALTER TABLE quizzes
  ADD CONSTRAINT quizzes_survey_pattern_check
  CHECK (survey_pattern IS NULL OR survey_pattern IN ('answer-check', 'top-reveal'));

-- 既存 survey は top-reveal をデフォルトに (No.1 発表まで進む = v2.9.35 までの挙動)
UPDATE quizzes SET survey_pattern = 'top-reveal' WHERE mode = 'survey' AND survey_pattern IS NULL;
