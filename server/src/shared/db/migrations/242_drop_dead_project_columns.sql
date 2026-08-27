-- ============================================================
-- 242: 案件台帳の死んだ列7本を削除 + バグ②backfill + lost_at 型修正
--   — docs/project-ledger-simplification-plan.md §1-1 / §2 / §4（Phase A-1, A-2④）
--
-- ── ① 内覧会リード経路の backfill（列 DROP より先に必ず実行）────
--
-- `dailyops/services/inview.service.ts` が誤って `source_channel`（自由文字列・
-- 読み手ゼロ）に `'内覧会'` を書いており、UI が読む `intake_channel`
-- （`'inview'` は migration 183 で追加済みの正式値）には書いていなかった。
-- そのため内覧会経由の案件は今までリード経路が「—」表示だった（同計画バグ②）。
-- `source_channel` を DROP する前に、まだ拾える行を intake_channel へ寄せる。
-- ============================================================

UPDATE projects SET intake_channel = 'inview'
WHERE source_channel = '内覧会' AND intake_channel IS NULL;

-- ── ② 死んだ列7本の削除（読み手ゼロと確認済み。根拠は同計画 §1-1・§5）──
--
-- 列を DROP すると、その列だけに依存する索引は Postgres が自動で一緒に落とす。
--   - message_id   → idx_projects_message_id（migration 126_automation_integrity_and_sim_draft.sql）
--   - reply_due    → idx_projects_reply_due（migration 170_project_intake_fields.sql）
-- サーバー側の SELECT/INSERT/UPDATE 文字列も同じ PR であわせて削除済み
-- （shared/tests/droppedColumns.test.ts が検査する）。MCP の引数は
-- 「列が無くなっても引数は受け取り続け、書き込みだけ止める」の既存の流儀のまま残す。

ALTER TABLE projects DROP COLUMN IF EXISTS message_id;
ALTER TABLE projects DROP COLUMN IF EXISTS ai_reviewed_by;
ALTER TABLE projects DROP COLUMN IF EXISTS source_channel;
ALTER TABLE projects DROP COLUMN IF EXISTS previous_gls_numbers;
ALTER TABLE projects DROP COLUMN IF EXISTS project_type_other;
ALTER TABLE projects DROP COLUMN IF EXISTS reply_due;
ALTER TABLE projects DROP COLUMN IF EXISTS wants;

-- ── ③ lost_at を TEXT → TIMESTAMPTZ に型修正（同計画バグ④）─────────
--
-- `002_lost_analysis_enhancement.sql` が TEXT 列として作り、書き手は
-- `NOW()` の暗黙の text キャスト（例: "2026-08-20 10:00:00.123456+09"）を
-- そのまま保存し、読み手（sales-analytics.service.ts）は毎回 `::timestamp`
-- で読み直していた。text の中身はセッションのタイムゾーンで表現が変わるため、
-- 実行環境の TZ 設定に結果が依存する不具合があった。`won_at` は最初から
-- timestamp without time zone で正しく、`lost_at` だけがこの型のズレを持っていた。
-- 既存データは上記の NOW() の text 表現が入っているだけなので、
-- 空文字列だけ NULL に落としつつ timestamptz へ安全にキャストできる。
ALTER TABLE projects
  ALTER COLUMN lost_at TYPE timestamptz
  USING NULLIF(lost_at, '')::timestamptz;
