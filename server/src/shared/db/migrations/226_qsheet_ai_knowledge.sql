-- ============================================================
-- 226: 制作資料 v4 — AI 段9（digest分岐・ナレッジ・月次レビュー）
--
-- 実装設計: docs/design/v4/qsheet-v4-coding/04-ai.md §6-3・§6-1・§5-5
--
-- 依存: ai_outputs（既存）・ops_reports（migration 118）・
--       notification_templates / scheduled_job_runs（migration 177）。
-- ============================================================

-- ── ① ナレッジ（人が承認したときだけ効く。§6-3） ────────────────
CREATE TABLE IF NOT EXISTS qsheet_ai_knowledge (
  id          TEXT PRIMARY KEY,
  -- どの機能に効かせるか。NULL = 全部（event_plan_draft / script_outline_draft / script_line_draft）
  kind        TEXT,
  -- どの型に効かせるか。NULL = 全部。ai_outputs.payload_snapshot.context.segment_key と同じ形の文字列
  segment_key TEXT,
  -- ルール文。プロンプトにそのまま行として載る
  body        TEXT NOT NULL,
  -- なぜこのルールがあるか（レビューで読む）
  rationale   TEXT,
  -- draft = 提案されただけ / active = 人が承認して効いている / retired = 効かせるのをやめた
  -- ⚠️ draft は絶対にプロンプトへ載せない（誤ったルールの固定化を防ぐ。§6-3）
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'active', 'retired')),
  -- どこから来たか。auto = 集計から機械的に提案 / human = 人が直接書いた
  origin      TEXT NOT NULL DEFAULT 'human' CHECK (origin IN ('auto', 'human')),
  -- auto のとき、根拠になった集計（件数・割合・例）を残す
  evidence    JSONB,
  -- ⚠️ 承認のたびに増える単調なリビジョン（件数ではない。§6-5a）。
  --    prompt_version に `+k<rev>` として載せ、改善したかを比較する軸にする。
  --    表全体で1本の通し番号（行ごとではない）。
  rev         INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_by  TEXT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- プロンプトに載せるときに読む索引（active のものだけ）
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_knowledge_active
  ON qsheet_ai_knowledge(kind, segment_key, sort_order) WHERE status = 'active';
-- 管理画面の一覧（全状態）
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_knowledge_list
  ON qsheet_ai_knowledge(created_at DESC);

-- ── ② digest の segment 絞り込み（§6-1）。ai_outputs へのスキーマ変更ではなく式索引のみ ──
-- ⚠️ jsonb の `?` 存在演算子は使わない（プレースホルダと誤認されて syntax error になる既知の地雷）。
CREATE INDEX IF NOT EXISTS idx_ai_outputs_segment
  ON ai_outputs ((payload_snapshot->'context'->>'segment_key'))
  WHERE payload_snapshot->'context'->>'segment_key' IS NOT NULL;

-- ── ③ 月次レビューの担当者（§5-5）。「qsheet の manager」は migration 210 の後では
--    フルアクセス型の全員を指すため権限からは特定できない。1人を id で指名する列を持つ。
--    未設定なら NULL のまま（通知は qsheet manager 全員へ出るので、システムは壊れない）。
ALTER TABLE ops_reports
  ADD COLUMN IF NOT EXISTS assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- ── ④ 月次 AI レビュー下書きの通知ひな形 ────────────────────────
-- 社内向け（internal / inapp）。tk_due 等と同じ判断で enabled=TRUE。
INSERT INTO notification_templates
  (id, name, trigger, audience, channel, send_to, subject, body, vars, enabled, sort_order) VALUES
  ('qsheet_ai_review_draft', '制作資料 AI 月次レビューの下書き', '毎月1日 03:25', 'internal', 'inapp',
   '制作資料の manager',
   '［AIレビュー］{対象月} 分の下書きができました',
   E'{対象月} の制作資料 AI（枠・骨格・セリフ・壁打ち）のふりかえり下書きができました。\n内容を確認し、ナレッジ案の承認・却下を決めてください。',
   '["{対象月}"]', TRUE, 16)
ON CONFLICT (id) DO NOTHING;
