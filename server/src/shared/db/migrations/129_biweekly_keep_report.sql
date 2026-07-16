-- v2.9.200: 隔週キープ資料の完全自動化に向けた不足データの実装 (要件書 v1.0 / 2026-07-16)
-- Phase 1: event_reports (イベント実施報告 — 案件 1:1 の定性情報 + 来場者数 + 写真参照)
-- Phase 2: monthly_budgets (月次予算) + monthly_actual_overrides (経理確定値による実績補正)
-- Phase 3: meeting_minutes (議事録サマリ)
-- 写真の実体は Box に置き、ONAiR は box_file_id のみ保持 (photos JSONB)。

-- ============================================================
-- Phase 1: イベント実施報告 (案件 1:1)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_reports (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL UNIQUE REFERENCES projects(id),
  headline         VARCHAR(120),
  highlights       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- string[] 箇条書きトピック (3-5点想定)
  attendees_onsite INTEGER,
  attendees_online INTEGER,
  attendees_note   TEXT,
  photos           JSONB NOT NULL DEFAULT '[]'::jsonb,   -- {id, box_file_id, caption, sort_order}[]
  report_status    TEXT NOT NULL DEFAULT 'draft' CHECK (report_status IN ('draft', 'confirmed')),
  reported_at      TEXT,                                  -- 報告対象会議日 YYYY-MM-DD
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_reports_reported_at ON event_reports(reported_at);
CREATE INDEX IF NOT EXISTS idx_event_reports_status ON event_reports(report_status);

-- ============================================================
-- Phase 2: 月次予算 + 実績補正
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_budgets (
  year_month       TEXT PRIMARY KEY CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  revenue          BIGINT,   -- 売上目標 (円・税抜)
  cogs_fixed       BIGINT,   -- 固定原価 (償却) 目標
  cogs_variable    BIGINT,   -- 変動原価目標
  sga              BIGINT,   -- 販管費目標
  operating_profit BIGINT,   -- 営業利益目標 (未指定時は構成要素から自動計算)
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- get_monthly_summary の自動値を経理確定値で上書きするための差分
-- (例: FIXED-COGS 償却の未計上分の補完)
CREATE TABLE IF NOT EXISTS monthly_actual_overrides (
  year_month        TEXT PRIMARY KEY CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  cogs_fixed_actual BIGINT,  -- 償却費の経理確定値
  sga_actual        BIGINT,  -- 販管費の経理確定値
  note              TEXT,    -- 「償却再計上」等の注記
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Phase 3: 議事録サマリ
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_minutes (
  meeting_date      TEXT PRIMARY KEY CHECK (meeting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  decisions         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[] 決定事項
  topics            JSONB NOT NULL DEFAULT '[]'::jsonb,  -- {area, text}[] 領域別サマリ
  next_meeting_date TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
