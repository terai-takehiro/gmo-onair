-- 案件 (GLS-B) の共同編集の入れ物 (要件 B1 / B2)
--
-- 対象は「作業メモ」と「チェックリスト」だけ。理由は 2 つ。
--   ① タスクは project_tasks の行で、かんばん / ガント / リスト / MCP / 依頼フローが
--      すべて直接 SQL で書いている。ここに Y.Doc を重ねると同じ行への書き手が 2 系統になり、
--      調停を誤れば消える。乗せるかは別途設計を決めてから判断する。
--   ② 金額は監査の都合で同時編集の対象外 (要件 B1)。
--
-- **projects.notes は使わない。** あの列は決算インポートが '[kessan:YYYY-MM]' マーカーを
-- 書き込んでおり、二重計上スクリーニングと旧GLS一覧 (notes LIKE '[kessan:%') が
-- それを見ている。共同編集の本文を混ぜると両方が壊れるので、新しい列に分ける。
--
-- doc (JSONB) と state (BYTEA) の両方を持つ理由:
--   state が正 (Yjs のマージ結果) だが、JSONB スナップショットも同時に更新する。
--   v2.9.169 で Qシートが踏んだのと同じ話で、JSONB を持たないと
--   共同編集中に「JSONB を読む経路」(HTTP GET / MCP / AI / 一覧) が古いままになる。

CREATE TABLE IF NOT EXISTS project_collab (
  project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,

  -- 読み取り用スナップショット。{ notes: string, checklist: [{id,text,done,assigned_to,due_at}] }
  doc         JSONB NOT NULL DEFAULT '{"notes":"","checklist":[]}'::jsonb,

  -- Yjs の状態 (正)。NULL のときは doc から種化する
  state       BYTEA,

  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

-- 「最近だれかが触った案件」を引くため (B4 変更履歴・ホームの導線で使う想定)
CREATE INDEX IF NOT EXISTS idx_project_collab_updated
  ON project_collab(updated_at DESC);
