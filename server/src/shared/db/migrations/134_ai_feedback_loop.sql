-- =====================================================================
-- 134: AI フィードバックループの共通レイヤー (ai-feedback-loop Phase 1)
--
-- 方針「AIを使い捨てにしない」(.claude/skills/ai-feedback-loop/) の
-- 条件 1〜3 を、機能ごとの後付けではなく **全 AI 接点が登録する共通レイヤー**
-- として持つ。機能別に個別テーブルを作ると (MCP 33 ツール + スキル + メール取込 と
-- 接点が増え続けるため) 絶対に収束しないので、最初から 1 セットに集約する。
--
--   ai_outputs     — AI が出したもの 1 件 = 1 行 (条件1: 出力の記録)
--   ai_corrections — 人間が直した差分 (条件2: 最も価値のある教師データ)
--   ai_outcomes    — 顧客反応・成果指標 (条件3: 当たったか外したか)
--
-- mcp_audit_log とは役割が違う: あちらは監査用で args を 1000 文字に切り詰める
-- ため教師データにならない。こちらは payload_snapshot に全文を持つ。
-- =====================================================================

-- ── ai_outputs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_outputs (
  id               TEXT PRIMARY KEY,
  -- estimate_draft / project_draft / activity_log / reply_draft / summary ...
  kind             TEXT NOT NULL,
  -- 生成された業務レコードの所在 (人間の修正を突き合わせる起点)
  target_table     TEXT,
  target_id        TEXT,
  -- AI が出した内容そのもの。**切り詰め禁止**。
  -- 単価など「サーバー算出後の値」も焼き込む: 料金表マスタは差し替えられる
  -- (migration 121 で全面差し替えた前例あり) ため、FK 参照だけでは当時の
  -- 金額を再現できない。
  payload_snapshot JSONB NOT NULL,
  tool_name        TEXT,          -- 経路 (MCP ツール名など)
  model            TEXT,
  -- 改善の前後比較に使う。無いと「改善が効いたか」を言えない。
  prompt_version   TEXT,
  actor_id         TEXT,          -- 実行者 (OAuth なら実ユーザー id)
  requested_by     TEXT,          -- 指示者 (AI が聞き取った自由記述)
  source_channel   TEXT,          -- info@ / sales@cc / 電話 など
  message_id       TEXT,          -- 由来メール等との突合キー
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_kind_created ON ai_outputs(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_outputs_target ON ai_outputs(target_table, target_id);

-- ── ai_corrections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_corrections (
  id              TEXT PRIMARY KEY,
  output_id       TEXT NOT NULL REFERENCES ai_outputs(id),
  -- items[pricing_item_id].unit_price のように「どこを」直したかまで分かる粒度
  field_path      TEXT NOT NULL,
  before_value    JSONB,
  after_value     JSONB,
  -- fix=誤り / enrich=追記 / reject=不採用 / rephrase=表現 / none=無修正で採用
  -- none を必ず記録するのが重要: これが「正解ラベル」で、無いと修正率の分母が壊れる。
  correction_type TEXT NOT NULL CHECK (correction_type IN ('fix','enrich','reject','rephrase','none')),
  -- 「なぜ直したか」。任意 (必須にすると入力されずテーブルが空になる)。
  note            TEXT,
  corrected_by    TEXT,
  corrected_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_corrections_output ON ai_corrections(output_id);
CREATE INDEX IF NOT EXISTS idx_ai_corrections_field ON ai_corrections(field_path);
CREATE INDEX IF NOT EXISTS idx_ai_corrections_type_at ON ai_corrections(correction_type, corrected_at DESC);

-- ── ai_outcomes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_outcomes (
  id           TEXT PRIMARY KEY,
  output_id    TEXT NOT NULL REFERENCES ai_outputs(id),
  -- won / lost / replied / no_reply / complaint / kpi ...
  outcome_type TEXT NOT NULL,
  metric_key   TEXT,            -- days_to_first_reply / amount_won / handled_minutes ...
  metric_value NUMERIC,
  note         TEXT,
  observed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_outcomes_output ON ai_outcomes(output_id);
CREATE INDEX IF NOT EXISTS idx_ai_outcomes_type_at ON ai_outcomes(outcome_type, observed_at DESC);
