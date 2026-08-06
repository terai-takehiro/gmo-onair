-- タスクの状態を4つにする (v4 ④ タスク一覧)
--
--   未着手 / 進行中 / 相手待ち / 完了
--
-- ── なぜ「4値の列を1本」にしなかったか (ここが設計の要点) ──────────────
--
-- 素直に `status IN ('todo','doing','waiting','done')` を足すと、**「完了したか」を
-- 表す情報が `is_completed` と `status` の2か所になります**。project_tasks の
-- `is_completed` は かんばん / ガント / リスト / MCP / 依頼フロー / 週報の集計 が
-- **それぞれ直接 SQL で読み書きしており**、書き手のどれか1つが片方しか更新しないと
-- 「一覧では完了なのに、やること画面では未完了」という食い違いが黙って生まれます。
-- 同期のトリガーを置く手もありますが、隠れた書き換えは追いかけづらくなります。
--
-- → **役割を分けます。**
--
--     `is_completed`  … 完了したかどうか。**ここが正**。既存の書き手は1行も変えない
--     `work_state`    … 完了していないときに、どう止まっているか
--                        (`todo` 未着手 / `doing` 進行中 / `waiting` 相手待ち)
--
--   画面に出す状態 = `is_completed ? '完了' : work_state`
--
-- 2つの列が同じことを言わないので、**食い違いようがありません**。
-- 完了を取り消したときに直前の状態 (進行中など) が残るのも、この形の利点です。
--
-- ── `progress` があるのに、なぜ足りないのか ──────────────────────────
--
-- `progress`(0〜100) から「進行中」は導けますが、**「相手待ち」は導けません**。
-- お客様の返事待ち・他部署の回答待ちを「進行中」と同じ見た目にしていると、
-- 未完了のタスクが全部同じ重さに見えて、**本当に自分が止めているものが埋もれます**。
-- これがこの列を足す唯一の理由です。

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS work_state TEXT NOT NULL DEFAULT 'todo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_work_state_check'
  ) THEN
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_work_state_check
      CHECK (work_state IN ('todo', 'doing', 'waiting'));
  END IF;
END $$;

-- 既存データ: 進捗が入っているものは「進行中」、それ以外は「未着手」。
-- **完了済みのものにも入れておく** — 完了を取り消したときに
-- 「未着手」に戻ってしまうより、進めていた事実が残るほうが正しいため。
UPDATE project_tasks
   SET work_state = 'doing'
 WHERE progress > 0 AND work_state = 'todo';

-- タスク一覧は「未完了を期限順」で引くのが既定。この形で毎回並べ替えないよう索引を張る
CREATE INDEX IF NOT EXISTS idx_project_tasks_open_due
  ON project_tasks (due_date NULLS LAST)
  WHERE deleted_at IS NULL AND is_completed = false;
