-- 291: 隔週キープ（業績報告・資料ビルダー）の表と印（docs/design/v4/keep-report.md §3・§5・§6・§8・§10）
--
-- ── 計上会社は main の `entity_code` を使う（この枝が発明した「事業主体」列は捨てた）──
--
-- 隔週キープを作っている間に、2026年10月の事業再編（migration 284〜290・
-- docs/reorg-2026-10-plan.md）が main に入り、案件・売上・仕入・販管費・見積の行が
-- **計上会社 `entity_code`（GJV／GSS／GMO・NOT NULL）**を持ち、月次予算と経理の補正値も
-- `(entity_code, year_month)` を主キーにするようになった。隔週キープの「主体別の収支」は
-- まさにその区分なので、**この枝が別に足していた `projects.entity`（gss/gscs/gig）・
-- `entity_manual`・`sga_expenses.entity`・`purchases.entity`・`monthly_budgets.entity` は
-- 作らない**（旧 282〜285 のうち計上会社の列を足す部分はここに引き継がない）。
-- 語彙の対応: gss→GSS（GMOサムライスタジオ）／gscs→GJV（GMOサムライコンテンツスタジオ）／
-- gig→GMO（GMOインターネットグループ本体）。導出の規則は `entity-resolution.service.ts`（§4.4）1本。
--
-- ここに残るのは main に無いものだけ:
--   projects.keep_pick      … ヨミ表の「資料に載せる」の印（案件ページの材料。§3）
--   companies.samurai_group … 「サムライ関連」の別表に出すお客様（サムライパートナーズ／
--                             GMOサムライコンテンツスタジオ）。計上会社ではなく**お客様**で決める（§4）
--   keep_settings           … 稼働率の数え方（§5.4）
--   keep_report_packs       … 凍結した定例報告パック（§5.5）
--   keep_report_inputs      … ONAiR に無い数字の手入力（満足度など）
--   keep_decks / keep_deck_versions / keep_deck_edits … 資料の構成・版・人の直しの差分（§6・§10）

-- ── ヨミ表の「資料に載せる」の印 ──────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS keep_pick BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN projects.keep_pick IS '隔週キープの資料に案件ページとして載せる印（ヨミ表の「資料」チェック）';

-- ── 「サムライ関連」の別表（相手がサムライパートナーズ／GMOサムライコンテンツスタジオの案件）──
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS samurai_group BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE companies
   SET samurai_group = TRUE
 WHERE name LIKE '%サムライパートナーズ%' OR name LIKE '%サムライコンテンツスタジオ%';
COMMENT ON COLUMN companies.samurai_group IS
  '隔週キープのヨミ表で「サムライ関連」の別表に出すお客様（サムライパートナーズ／GMOサムライコンテンツスタジオ）';

-- ── keep_settings（隔週キープの設定）─────────────────────────────────
-- key = 'utilization': 稼働率の数え方（数える予定の種別・土曜を営業日に含めるか）。
-- 既定はメンテナンス以外を全部数える（仮押さえも数える。決めてほしいこと1）。
-- 設定は `keepReportService.getUtilizationSettings()` が読み、無い鍵は既定値で埋める。
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

-- ── keep_report_packs（凍結したパック）──────────────────────────────
-- 会議1回ぶんの数字（KeepReportPack・`shared/src/keepReport/types.ts`）を JSONB で1本持つ。
-- 「いまの数字」は保存しない（毎回計算する）。週報を確定した時点で `frozen_at` を入れ、
-- `ops_reports.payload.keep = { pack_id }` と `ops_report_id` の両方で結ぶ。
-- **凍結した版は書き換えない** — 数字を直したいときは元データを直して凍結し直す
-- （新しい版を作り、前の版は残す）。だから meeting_date に UNIQUE は張らない。
-- `scope_entity` は計上会社の絞り込み: all / GJV / GSS / GMO（`legal_entities.code` と同じ文字列）。
CREATE TABLE IF NOT EXISTS keep_report_packs (
  id            TEXT PRIMARY KEY,
  meeting_date  TEXT NOT NULL CHECK (meeting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  scope_entity  TEXT NOT NULL DEFAULT 'all',      -- all / GJV / GSS / GMO（計上会社 entity_code）
  scope_segment TEXT NOT NULL DEFAULT 'all',      -- all / internal / external
  pack          JSONB NOT NULL,                   -- KeepReportPack の全文
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frozen_at     TIMESTAMPTZ,                      -- 週報の確定で入る。NULL は下書き
  frozen_by     TEXT,
  ops_report_id TEXT REFERENCES ops_reports(id),  -- 結んだ週報
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_keep_report_packs_meeting ON keep_report_packs(meeting_date);

-- ── keep_report_inputs（ONAiR に無い数字の手入力）────────────────────
-- 内覧会の満足度（Kairos3 のアンケート）・参加者・Web KPI など。会議日 × key。
CREATE TABLE IF NOT EXISTS keep_report_inputs (
  meeting_date TEXT NOT NULL CHECK (meeting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  key          TEXT NOT NULL,                     -- inview_satisfaction / attendance / web_kpi / note
  value        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT,
  PRIMARY KEY (meeting_date, key)
);

-- ── keep_decks（最新の構成）／ keep_deck_versions（全文の版）────────────
-- 会議日ごとに構成（KeepDeck・`shared/src/keepReport/types.ts`）を1本持つ。
-- 保存のたびに版を1つ進め、全文を keep_deck_versions に残す（切り詰めない・条件1）。
-- `source` は 'auto'（ONAiR が組んだ）か 'human'（人が保存した）。
-- 出力した pptx の Box file id は最新側（keep_decks.exported_*）に持つ。
-- `meeting_date` の UNIQUE は「同じ会議日を2人が同時に初めて開いたとき」の二重作成を
-- DB で止める砦（`keep-deck.service.ts` の `getOrCreateDeck` が ON CONFLICT で読み直す）。
CREATE TABLE IF NOT EXISTS keep_decks (
  id                   TEXT PRIMARY KEY,
  meeting_date         TEXT NOT NULL UNIQUE CHECK (meeting_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  pack_id              TEXT REFERENCES keep_report_packs(id),  -- 読んだパック（凍結版）。凍結前は NULL
  deck                 JSONB NOT NULL,                          -- KeepDeck の全文（最新）
  version              INTEGER NOT NULL DEFAULT 1,
  exported_box_file_id TEXT,
  exported_at          TIMESTAMPTZ,
  exported_by          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by           TEXT
);

CREATE TABLE IF NOT EXISTS keep_deck_versions (
  id         TEXT PRIMARY KEY,
  deck_id    TEXT NOT NULL REFERENCES keep_decks(id),
  version    INTEGER NOT NULL,
  deck       JSONB NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('auto', 'human')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  UNIQUE (deck_id, version)
);

-- ── keep_deck_edits（人の直しの差分）─────────────────────────────────
-- 保存時にサーバーが前の版と比べて自動で作る（条件2）:
--   reorder … ページの並びを変えた   remove … ページを消した    add … ページ・部品を足した
--   override … 文・注記・写真を上書きした   restore … 消したページを戻した
-- 「よく消されるページ」「よく直される注記」を集計して、次回の標準の構成と既定値に
-- 反映する（条件4）。**凍結後の直しだけを数える**（会議直前に数字が動いたときの
-- 注記の直しを AI の誤りとして数えないため。§10 のリスク）。
CREATE TABLE IF NOT EXISTS keep_deck_edits (
  id           TEXT PRIMARY KEY,
  deck_id      TEXT NOT NULL REFERENCES keep_decks(id),
  version      INTEGER NOT NULL,
  page_id      TEXT,
  part_id      TEXT,
  field        TEXT NOT NULL,
  before_value TEXT,
  after_value  TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('reorder', 'remove', 'add', 'override', 'restore')),
  note         TEXT,
  edited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_keep_deck_edits_deck ON keep_deck_edits(deck_id);
