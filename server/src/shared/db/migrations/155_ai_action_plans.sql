-- =====================================================================
-- 155: 投入テキストから「ONAiR 全体への行動案」を組む (AI 行動提案)
--
-- 今までの投入欄 (task_intake / migration 135) は **タスクしか作れなかった**。
-- 実際に投げられる文には「新しい案件が来た」「見積を出したい」「スタジオを押さえたい」
-- 「顧客が増えた」が混ざるが、そのうちタスクにできる部分だけを拾って
-- 残りは要約すら残らずに落ちていた。読み取った内容を ONAiR のどの機能に
-- 落とすかまで含めて出し、**人が確認してから実行する**ための器。
--
-- task_intake と分けた理由:
--   task_intake は「タスク案の配列」に形が固定されていて (drafts の中身が
--   title / assigned_to / due_at 前提)、案件・見積・予約を同じ配列に混ぜられない。
--   status/committed の意味も「タスクを作ったか」に紐づいている。
--   ここを無理に拡張すると既存の投入ログと集計 (ai-feedback の intake 指標) が
--   壊れるので、別の器にして task_intake はそのまま残す。
--
-- 記録・差分・成果は ai_outputs / ai_corrections / ai_outcomes (migration 134) に
-- 相乗りする。**新しい記録テーブルは作らない** (AI 接点ごとに作ると収束しない)。
-- =====================================================================

CREATE TABLE IF NOT EXISTS ai_action_plans (
  id             TEXT PRIMARY KEY,

  -- 投げられたテキスト。**切り詰めない** (一次資料 かつ 教師データの入力側)
  raw_text       TEXT NOT NULL,

  -- 由来の区別 (task_intake と同じ語彙に揃える)
  kind           TEXT NOT NULL DEFAULT 'freeform'
                 CHECK (kind IN ('freeform', 'minutes', 'mail', 'chat', 'other')),

  -- pending = 人の確認待ち / executed = 実行済み / discarded = 破棄
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'executed', 'discarded')),

  -- AI が「この文は何の話か」を 1 文でまとめたもの。
  -- 行動案が 0 件でもこれは残す (読んだ内容が消えないようにするため)
  summary        TEXT,

  -- AI が出した行動案の配列 (下書き)。1 要素 = ONAiR の 1 操作。
  -- 人が確定したものとの差分を取る元になるので **実行時に上書きしない**。
  actions        JSONB,

  -- 実行結果の配列 (action_key ごとの成否・作られたレコードの id / リンク)。
  -- actions とは別カラムに持つ = 下書きが実行で消えない (差分が取れる)
  results        JSONB,

  -- ai_outputs への参照 (差分を ai_corrections に積むときに使う)
  ai_output_id   TEXT,

  executed_at    TIMESTAMP,
  discarded_at   TIMESTAMP,
  note           TEXT,

  -- created_by は users への FK を張らない (MCP の共用キー 'mcp-claude' を
  -- 入れるため。task_intake と同じ流儀)
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by     TEXT NOT NULL,
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMP
);

-- 「自分の確認待ち」を出すための索引 (投入欄の下に件数を出す)
CREATE INDEX IF NOT EXISTS idx_ai_action_plans_creator_status
  ON ai_action_plans(created_by, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_plans_status_created
  ON ai_action_plans(status, created_at DESC);
