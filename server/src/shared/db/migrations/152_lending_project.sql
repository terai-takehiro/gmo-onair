-- 152: セキュリティカードの貸出を案件に紐づける — デザイン 15章
--
-- カードの貸出は「誰に貸したか」だけを持っていたので、**どの案件のために
-- 貸したのかが分からなかった**。返ってこないカードは貸した本人しか知らず、
-- 案件の「そろっていないもの」に出せない。
--
-- 案件は任意 (社内の用事で貸すこともある) なので NULL を許す。
ALTER TABLE security_card_lendings
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id);

CREATE INDEX IF NOT EXISTS idx_security_card_lendings_project
  ON security_card_lendings(project_id) WHERE project_id IS NOT NULL AND deleted_at IS NULL;
