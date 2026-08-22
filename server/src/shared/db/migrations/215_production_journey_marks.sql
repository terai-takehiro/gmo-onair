-- ============================================================
-- 215: 制作資料 v4 段3 — 制作のジャーニーの人のピン
--
--   案件（project）または資料（document）に対して、人が
--   「ここは決まった」「ここは要注意」「この手がかりは無視する」を押した記録。
--   進み具合の画一的な判定式は作らない — 「決まった」と言えるのは
--   人がこの表に行を作ったときだけ。
--
--   ⚠️ scope_id には FK を張らない。scope_type によって参照先が
--   projects(id) / qsheet_documents(id) に分かれる多態のため、SQL の
--   FK では表現できない。参照が外れた行は API 側で JOIN が外れたら落とす。
--
--   行は消さず cleared_at を立てる方式（「決まった」と言ったあとに戻したこと
--   自体がジャーニーの情報になるため）。
-- ============================================================

CREATE TABLE IF NOT EXISTS production_journey_marks (
  id           TEXT PRIMARY KEY,
  scope_type   TEXT NOT NULL CHECK (scope_type IN ('project', 'document')),
  scope_id     TEXT NOT NULL,
  target_date  TEXT,
  stage        TEXT NOT NULL CHECK (stage IN ('day', 'flow', 'script')),
  kind         TEXT NOT NULL CHECK (kind IN ('settled', 'watch', 'dismissed')),
  hint_key     TEXT,
  note         TEXT,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at   TIMESTAMPTZ,
  cleared_by   TEXT REFERENCES users(id)
);

-- 生きているピンだけを一意にする。COALESCE で NULL を空文字に揃えるのは、
-- Postgres の UNIQUE 制約は NULL 同士を衝突させないため（target_date / hint_key は NULL があり得る）。
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_journey_marks_unique_live
  ON production_journey_marks (scope_type, scope_id, COALESCE(target_date, ''), stage, kind, COALESCE(hint_key, ''))
  WHERE cleared_at IS NULL;

-- 引き用: そのスコープの生きているピンを1回で引く（§6-7 の N+1 対策）
CREATE INDEX IF NOT EXISTS idx_production_journey_marks_scope
  ON production_journey_marks (scope_type, scope_id) WHERE cleared_at IS NULL;
