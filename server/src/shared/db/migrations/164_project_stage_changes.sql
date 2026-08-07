-- ステージが変わった記録 (v4)
--
-- モックのダッシュボードは「今月の**受注**」を出し、止まっている案件には
-- 「見積を送ったまま連絡がありません」のような**具体的な理由**を書く。
-- どちらも「いつどのステージになったか」が要るが、DB はそれを持っていなかった。
--
-- `projects.updated_at` では代われない — **案件名を直しただけでも動く**ので、
-- 「今月 受注になった案件」を数えられない。
--
-- 失注だけは `projects.lost_at` (migration 002) があった。受注にも同じものを足し、
-- あわせて全ステージの履歴を1つの表に残す。
--
--   `projects.won_at`      … 受注 (a_won) になった時刻。**今月の受注を数えるのはここ**
--   `project_stage_changes`… 全ステージの履歴。停滞理由を具体的に言うために使う
--
-- **過去ぶんは埋めない。** すでに受注済みの案件がいつ受注になったかは
-- どこにも残っていないので、埋めると作り話になる。画面には
-- 「記録を始めた日より前のぶんは数えていません」と出す。

ALTER TABLE projects ADD COLUMN IF NOT EXISTS won_at TIMESTAMP;

COMMENT ON COLUMN projects.won_at IS
  '受注 (a_won) になった時刻。migration 164 より前に受注した案件は NULL（記録が無い）';

CREATE TABLE IF NOT EXISTS project_stage_changes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  -- 変える前のステージ。案件を作った直後の1件目は NULL
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  changed_by  TEXT,
  changed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 「この案件がいつそのステージになったか」を引く索引。
-- 停滞理由は**いまのステージになった時刻**を1件だけ読むので、新しい順に並べる
CREATE INDEX IF NOT EXISTS idx_stage_changes_project
  ON project_stage_changes(project_id, changed_at DESC);

-- 「今月 受注になった案件」を数える索引
CREATE INDEX IF NOT EXISTS idx_stage_changes_to_stage
  ON project_stage_changes(to_stage, changed_at DESC);

-- 「いつから記録しているか」は **`MIN(changed_at)` で分かる**ので、
-- 設定表には持たない（2か所に持つと片方だけ古くなる）。
-- 画面はこの値を読んで「ここより前のぶんは数えていません」と出す。
