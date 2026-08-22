-- ============================================================
-- 212: 本番の実尺 (qsheet_cue_actuals)
--
-- 何のための表か:
--   本番1回 (= 1 run) のあいだ、キューが切り替わるたびに
--   「そのキューに実際どれだけかかったか」を1行ずつ残す。
--   これまで実尺は RundownPage の useState にしか無く (揮発)、
--   ランダウンを開いていない本番では測定自体が存在しなかった。
--
--   ⚠️ AI の表ではない。AI 機能が1つも無くても
--   「この型のロールは予定より平均 N 秒押す」= 次回の尺見積もりに効く。
--   設計: docs/design/v4/qsheet-v4-coding/07-onair-roles.md §3
--         docs/design/v4/qsheet-v4-coding/04-ai.md §5-3a
--         docs/design/v4/qsheet-v4-coding/impl/01-cue-actuals-impl.md
--
-- 書き手:
--   進行 (OnAir) の1台だけ。ランダウンからの操作も cue:* を進行が受けてから
--   記録するので、二重送信が構造的に起きない。
--
-- 型の方針:
--   TIMESTAMPTZ に揃える。既存の qsheet_documents は TIMESTAMP (tz なし) で
--   deleted_at が TEXT という不整合を抱えているが、新しい表で踏襲しない
--   (02-schedule.md / 04-ai.md §9 と同じ判断)。
-- ============================================================

CREATE TABLE IF NOT EXISTS qsheet_cue_actuals (
  id             TEXT PRIMARY KEY,

  document_id    TEXT NOT NULL REFERENCES qsheet_documents(id) ON DELETE CASCADE,

  -- 本番1回 = 1 run。リハ・本番・撮り直しを分ける。
  -- 進行が genId('run') で採り、cue:update -> cue:sync の相乗りで全端末に配る
  -- (cue:reset は「ランダウン -> 進行」向きなので運び手になれない)。
  run_id         TEXT NOT NULL,
  run_started_at TIMESTAMPTZ NOT NULL,

  -- ⚠️ globalIndex では持たない (行を1つ挿すと全部ずれる)。
  --    CM / VTR / ロール一括のキューは row_id を持たないので
  --    section_id は必ず入れる。
  --    section.id が取れないキューは、そもそも記録しない (§10 #1)。
  section_id     TEXT NOT NULL,
  row_id         TEXT,

  -- その run でその行に何回目に入ったか (1 始まり)。
  -- cue:jump / prev で戻ってやり直したとき、最初の (多くは失敗した) 尺で
  -- 上書きされないため。
  pass_no        INTEGER NOT NULL DEFAULT 1 CHECK (pass_no >= 1),

  cue_index      INTEGER,                      -- 記録時点の通し番号 (参考。突合には使わない)
  planned_sec    INTEGER CHECK (planned_sec IS NULL OR planned_sec >= 0),
  actual_sec     INTEGER NOT NULL CHECK (actual_sec >= 0),

  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by    TEXT REFERENCES users(id)
);

-- 同じキューの二重送信を無害にする (ON CONFLICT DO NOTHING の受け皿)。
-- row_id が NULL のキュー (CM / VTR / ロール一括) は section_id で一意にする。
-- ⚠️ NULL は UNIQUE で衝突しないので、部分索引を2本に割る必要がある。
CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_cue_actuals_run_row
  ON qsheet_cue_actuals(run_id, row_id, pass_no) WHERE row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_cue_actuals_run_section
  ON qsheet_cue_actuals(run_id, section_id, pass_no) WHERE row_id IS NULL;

-- 台本ごとに新しい run から読む (GET /qsheet/runs/:documentId・集計)
CREATE INDEX IF NOT EXISTS idx_qsheet_cue_actuals_doc
  ON qsheet_cue_actuals(document_id, run_started_at DESC);

-- 取得率 (runs_measured) を数えるとき run 単位で畳む
CREATE INDEX IF NOT EXISTS idx_qsheet_cue_actuals_run
  ON qsheet_cue_actuals(run_id);
