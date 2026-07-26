-- ========================================================
-- 現場の道具の成果物 (§4.14 / デザイン 12a)
--
-- 翻訳 (gmo-translate.jp)・インタラクティブ (interactive.gmo-onair.jp)・リアルタイムCG は
-- **案件から開く / 単発で開く / 後から紐づける** の3通りで使われる。
-- 単発で作ったものが行方不明になるのを防ぐため、成果物のメタだけをここに残す。
--
-- 中身 (翻訳文・演出データ・CG素材) は各ツール側にあり、ここには置かない。
-- 持つのは「いつ・誰が・どのツールで・何を作ったか」と外部URLだけ。
-- ========================================================

CREATE TABLE IF NOT EXISTS external_tool_outputs (
  id TEXT PRIMARY KEY,
  -- translate / interactive / cg のいずれか。増えたら CHECK を広げる
  tool TEXT NOT NULL CHECK (tool IN ('translate', 'interactive', 'cg')),
  title TEXT NOT NULL,
  -- 成果物を開くURL (外部サイト)。無いこともある
  external_url TEXT,
  -- **案件は後から付けられるので nullable**。単発で開いた分はここが空で残る
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  -- 「社内利用」= 案件に紐づける必要が無いと人が決めたもの。以後は案件を求めない
  is_internal_use BOOLEAN NOT NULL DEFAULT FALSE,
  -- 補足 (言語・イベント名など、ツールごとに意味が違うので自由記述)
  note TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_at TIMESTAMPTZ,
  linked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

-- 案件の画面から引く用
CREATE INDEX IF NOT EXISTS idx_ext_tool_outputs_project
  ON external_tool_outputs(project_id) WHERE deleted_at IS NULL;

-- 「まだ案件に紐づいていないもの」を引く用 (社内利用と決めたものは除く)
CREATE INDEX IF NOT EXISTS idx_ext_tool_outputs_unlinked
  ON external_tool_outputs(created_at DESC)
  WHERE deleted_at IS NULL AND project_id IS NULL AND is_internal_use = FALSE;
