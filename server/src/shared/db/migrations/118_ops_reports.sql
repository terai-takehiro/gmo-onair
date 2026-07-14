-- 118: 日常業務アプリ (dailyops) — 汎用レポート基盤
-- ops_reports: kind × 期間キーで 1 本のレポート (週報/日報/今後の小メニュー)
-- ops_report_items: レポート内の行 (1 行 = 1 項目)。AI と人間が行単位で追加する。
-- kind に CHECK は張らない (メニュー追加を migration レスにするため)。

CREATE TABLE IF NOT EXISTS ops_reports (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  period_key   TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  payload      JSONB,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  requested_by TEXT,
  created_by   TEXT,
  reviewed_at  TIMESTAMP,
  reviewed_by  TEXT,
  published_at TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ops_reports_kind_period
  ON ops_reports(kind, period_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ops_reports_kind_created
  ON ops_reports(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS ops_report_items (
  id          TEXT PRIMARY KEY,
  report_id   TEXT NOT NULL REFERENCES ops_reports(id),
  category    TEXT,
  content     TEXT NOT NULL,
  note        TEXT,
  url         TEXT,
  ai_related  BOOLEAN,
  pick        INTEGER,
  recorded_by TEXT,
  source      TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('ai','human')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ops_report_items_report
  ON ops_report_items(report_id);
