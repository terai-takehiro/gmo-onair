-- v2.9.245 / 改革 Phase 2a: 個人タスクと依頼の器 + 投入テキストの一次資料化
--
-- 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D1 / D5 / D9)
--
-- 設計の要点
-- 1. 新テーブルを作らず project_tasks を広げる。project_id を NULL 可にして
--    「案件に紐づかない個人タスク」を表現する。別テーブルにすると
--    「自分のタスク一覧」が個人タスクと案件タスクの UNION になり、
--    一覧・MCP・権限がすべて 2 系統に割れるため。
-- 2. 期限は due_at (分単位) を正とする。既存 due_date DATE は後方互換で残し、
--    読み取り時に「その日の 18:00」として補完する (DB は書き換えない)。
--    タイムゾーンは JST naive の TIMESTAMP (既存 created_at と同じ流儀)。
--    UTC にすると studio_bookings / personal_events の既存慣習と混ざって事故る。
-- 3. 優先度スコアは importance * urgency (1〜9) だが **カラムにしない**。
--    GENERATED ALWAYS AS ... STORED は後から式を変えられず DROP して作り直すしかなく、
--    本リポジトリは migration 095 (liveops_snapshots.total_count) で実際にその
--    作り直しを踏んでいる。よって式インデックスで並べる。
-- 4. 期限が無いタスクは緊急度を 1 (低) として扱う (D9)。期限が無いのに緊急とは
--    言えないため。スコア式の CASE でそれを表現する。
-- 5. 投入テキストは task_intake に全文で残す。ai_outputs は AI の「出力」用で
--    入力が入らず、meeting_minutes は主キーが会議日で 1 日 1 本しか入らないため
--    どちらも代用できない (要件 D5 で確認済み)。

-- ════════════════════════════════════════════════════════
-- 1. project_tasks の拡張
-- ════════════════════════════════════════════════════════

-- 案件に紐づかない個人タスクを許す (これが無いと個人タスクが DB に存在できない)
ALTER TABLE project_tasks ALTER COLUMN project_id DROP NOT NULL;

-- 依頼 (人 → 人)。requester_id が NULL = 自分で作ったタスク
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS requester_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMP;

-- 依頼の状態。NULL = 依頼ではない (自分のタスク)
-- declined / consulting でも行は消さず、依頼者に差し戻して残す (要件 D3)
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS delegation_status TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_delegation_status_check'
  ) THEN
    ALTER TABLE project_tasks
      ADD CONSTRAINT project_tasks_delegation_status_check
      CHECK (delegation_status IS NULL OR delegation_status IN
             ('requested', 'accepted', 'declined', 'consulting', 'done'));
  END IF;
END $$;

-- 期限 (分単位)。GMO イズム「何月何日何時何分まで」 → D9
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;

-- 重要度 3 段階 × 緊急度 3 段階 (3=高 / 2=中 / 1=低)。掛け算でスコア 1〜9
-- 既存行は DEFAULT 2 (中 × 中 = 4) で入る。全部「高」だと全件最優先で意味を失い、
-- 全部「低」だと既存タスクが埋もれるため、真ん中が唯一安全。
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS importance SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS urgency    SMALLINT NOT NULL DEFAULT 2;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_importance_check') THEN
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_importance_check
      CHECK (importance BETWEEN 1 AND 3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_urgency_check') THEN
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_urgency_check
      CHECK (urgency BETWEEN 1 AND 3);
  END IF;
END $$;

-- 由来。source_ref には task_intake.id を入れて元の投入テキストへ遡れるようにする
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS source     TEXT;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- 可視性。private は本人のみ (チーム一覧では件数だけ数えて中身を隠す)
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'team';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_tasks_visibility_check') THEN
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_visibility_check
      CHECK (visibility IN ('team', 'private'));
  END IF;
END $$;

-- ════════════════════════════════════════════════════════
-- 2. インデックス
-- ════════════════════════════════════════════════════════

-- 優先度スコア順 (式インデックス。カラムにしない理由は冒頭 3 を参照)
-- 期限が無ければ緊急度は 1 として扱う (冒頭 4)
CREATE INDEX IF NOT EXISTS idx_project_tasks_priority
  ON project_tasks ((importance * CASE WHEN due_at IS NULL THEN 1 ELSE urgency END) DESC, due_at)
  WHERE deleted_at IS NULL AND is_completed = FALSE;

-- 「自分のタスク」の主クエリ用
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee_open
  ON project_tasks (assigned_to)
  WHERE deleted_at IS NULL AND is_completed = FALSE;

-- 「出した依頼」の主クエリ用
CREATE INDEX IF NOT EXISTS idx_project_tasks_requester
  ON project_tasks (requester_id)
  WHERE deleted_at IS NULL AND requester_id IS NOT NULL;

-- 投入テキストからタスクを逆引きする
CREATE INDEX IF NOT EXISTS idx_project_tasks_source_ref
  ON project_tasks (source_ref)
  WHERE deleted_at IS NULL AND source_ref IS NOT NULL;

-- 個人タスク (案件に紐づかない) の抽出
CREATE INDEX IF NOT EXISTS idx_project_tasks_personal
  ON project_tasks (assigned_to)
  WHERE deleted_at IS NULL AND project_id IS NULL;

-- ════════════════════════════════════════════════════════
-- 3. task_intake — 投入テキストを一次資料として残す
-- ════════════════════════════════════════════════════════
--
-- 「後から遡ってレビューできる」を満たすための器。参照 ID だけでは
-- 「なぜこのタスクが生まれたのか」を読めないので、生テキストを全文で持つ。
-- 1 回の投入から複数タスクが生まれる (1 対多) ので、
-- 紐づけは project_tasks.source_ref = task_intake.id の逆参照で表す。

CREATE TABLE IF NOT EXISTS task_intake (
  id           TEXT PRIMARY KEY,

  -- 投げられたテキスト。**切り詰めない** (教師データにも一次資料にもなる)
  raw_text     TEXT NOT NULL,

  -- 由来の区別
  kind         TEXT NOT NULL DEFAULT 'freeform'
               CHECK (kind IN ('freeform', 'minutes', 'mail', 'chat', 'other')),

  -- pending = 未確認 (宙に浮いている) / committed = 確定済み / discarded = 破棄
  -- pending の件数を投入者本人に見せることで放置を可視化する (要件 D4 のリスク対策)
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'committed', 'discarded')),

  -- AI が出した下書き (タスク案の配列)。人が確定したものとの差分を取る元になる
  drafts       JSONB,

  -- ai_outputs への参照 (差分を ai_corrections に積むときに使う)
  ai_output_id TEXT,

  committed_at TIMESTAMP,
  discarded_at TIMESTAMP,
  note         TEXT,

  -- created_by は users への FK を張らない (MCP の共用キーは 'mcp-claude' を入れるため。
  -- 既存 project_tasks.created_by と同じ流儀)
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by   TEXT NOT NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMP
);

-- 投入者の「確認待ち」を出す主クエリ用
CREATE INDEX IF NOT EXISTS idx_task_intake_creator
  ON task_intake (created_by, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- 投入ログ画面 (時系列)
CREATE INDEX IF NOT EXISTS idx_task_intake_created
  ON task_intake (created_at DESC)
  WHERE deleted_at IS NULL;
