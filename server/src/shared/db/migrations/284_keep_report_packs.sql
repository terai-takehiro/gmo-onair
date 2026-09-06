-- 284: 隔週キープの「定例報告パック」と手入力・設定（keep-report.md §5・§5.5・§8）
--
-- ── keep_report_packs（凍結したパック）──────────────────────────────
-- 会議1回ぶんの数字（KeepReportPack・`shared/src/keepReport/types.ts`）を JSONB で1本持つ。
-- 「いまの数字」は保存しない（毎回計算する）。週報を確定した時点で `frozen_at` を入れ、
-- `ops_reports.payload.keep = { pack_id }` と `ops_report_id` の両方で結ぶ。
-- **凍結した版は書き換えない** — 数字を直したいときは元データを直して凍結し直す
-- （新しい版を作り、前の版は残す）。だから meeting_date に UNIQUE は張らない。
--
-- ── keep_report_inputs（ONAiR に無い数字の手入力）────────────────────
-- 内覧会の満足度（Kairos3 のアンケート）・参加者・Web KPI など。会議日 × key。
--
-- ── keep_settings（隔週キープの設定）─────────────────────────────────
-- key = 'utilization': 稼働率の数え方（数える予定の種別・土曜を営業日に含めるか）。
-- 既定はメンテナンス以外を全部数える（仮押さえも数える。決めてほしいこと1）。
-- 設定は `keepReportService.getUtilizationSettings()` が読み、無い鍵は既定値で埋める。

CREATE TABLE IF NOT EXISTS keep_report_packs (
  id            TEXT PRIMARY KEY,
  meeting_date  TEXT NOT NULL CHECK (meeting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  scope_entity  TEXT NOT NULL DEFAULT 'all',      -- all / gss / gscs / gig
  scope_segment TEXT NOT NULL DEFAULT 'all',      -- all / internal / external
  pack          JSONB NOT NULL,                   -- KeepReportPack の全文
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frozen_at     TIMESTAMPTZ,                      -- 週報の確定で入る。NULL は下書き
  frozen_by     TEXT,
  ops_report_id TEXT REFERENCES ops_reports(id),  -- 結んだ週報
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_keep_report_packs_meeting ON keep_report_packs(meeting_date);

CREATE TABLE IF NOT EXISTS keep_report_inputs (
  meeting_date TEXT NOT NULL CHECK (meeting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  key          TEXT NOT NULL,                     -- inview_satisfaction / attendance / web_kpi / note
  value        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT,
  PRIMARY KEY (meeting_date, key)
);

CREATE TABLE IF NOT EXISTS keep_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

-- 稼働率の数え方の既定（shared/src/keepReport/types.ts の DEFAULT_UTILIZATION_SETTINGS と同じ値）
INSERT INTO keep_settings (key, value) VALUES (
  'utilization',
  '{"counted_types":["performance","rehearsal","hold","tour","internal","consultation","setup","other"],"count_saturday":false}'
)
ON CONFLICT (key) DO NOTHING;
