-- v2.9.26: アンケート/クイズの種別を survey / quiz の 2 種に統一 (survey-only 廃止)
--
-- 旧 survey-only (質問のみ・結果非公開) は survey に統合。survey は
-- 「出題 → アンサーチェック」が基本で、operator が結果発表 (No.1) へ進むかを選べる。

-- 既存 survey-only を survey に移行
UPDATE quizzes SET mode = 'survey' WHERE mode = 'survey-only';

-- CHECK 制約を 2 種に張り替え
ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_mode_check;
ALTER TABLE quizzes
  ADD CONSTRAINT quizzes_mode_check
  CHECK (mode IN ('survey', 'quiz'));
