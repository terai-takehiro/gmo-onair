-- 引き合いの「入口」と「確信」(v4)
--
-- モックのネタ一覧は列に **入口 (メール / 電話)** と **確信 (高 / 中 / 低)** を持つ。
-- どちらも DB に無く、MCP の `create_project` も渡していなかったので出せなかった。
--
--   `intake_channel`    どこから来た引き合いか
--   `intake_confidence` AI が「案件になりそうか」をどう見たか
--
-- **どちらも NULL を許す。** 手で登録した案件には入口も確信も無いのが正しく、
-- 既定値を入れると「メールから来た」と嘘になる。画面は NULL を「—」で出す。
--
-- 値は CHECK で縛る。**知らない値を素通しさせない** — 素通しすると
-- 絞り込みで当たらない行ができ、「1件も出ない」の原因が分からなくなる。

ALTER TABLE projects ADD COLUMN IF NOT EXISTS intake_channel TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS intake_confidence TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_intake_channel'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_intake_channel
      CHECK (intake_channel IS NULL
             OR intake_channel IN ('mail', 'phone', 'meeting', 'web', 'referral', 'other'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_intake_confidence'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_intake_confidence
      CHECK (intake_confidence IS NULL OR intake_confidence IN ('high', 'mid', 'low'));
  END IF;
END $$;

COMMENT ON COLUMN projects.intake_channel IS
  '引き合いの入口 mail/phone/meeting/web/referral/other。手で登録した案件は NULL';
COMMENT ON COLUMN projects.intake_confidence IS
  'AI が見た確からしさ high/mid/low。AI が起票していなければ NULL';

-- ネタ一覧はこの2つで絞る
CREATE INDEX IF NOT EXISTS idx_projects_intake
  ON projects(intake_channel, intake_confidence) WHERE deleted_at IS NULL;
