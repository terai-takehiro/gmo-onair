-- ============================================================
-- 252: テロップCG — ランキング発表パーツ（part_key: 'ranking'）演出SE 段6-5
--
-- 旧リアルタイムCG（client-awards）の `awards_sounds`（105_awards_sounds.sql）の移植。
-- docs/design/v4/graphics-awards-migration-plan.md §2-2「演出SE」の本体。
--
-- 設計判断（旧 awards_sounds との違い）:
--   - **project 単位**（旧: event 単位）。テロップCGは `graphics_projects` が
--     owner（案件/番組）単位のCG一式を束ねる単位のため、旧 awards の `event_id` に
--     そのまま対応する（awards_events ≒ graphics_projects）。
--   - **layer 列を持たない**。旧 awards は 1 event に ranking/quiz 両レイヤーの演出が
--     同居していたが、段6-5 は ranking パーツ専用の移植（quiz/vote 向けSEは段6-6/6-7の
--     範囲で対象外）。将来 quiz にもSEを足すときは、この設計を踏襲した別テーブル
--     （例: graphics_quiz_sounds）を新設する方針とし、layer 列で1テーブルに相乗りさせない
--     （`voteState.ts`/`rankingFields.ts` が reveal_phase 相乗りを避けた理由と同じ——
--     部品ごとに独立した進行・設定を持たせ、後方互換の壊れ方を避ける）。
--   - **box_file_id 列を持たない**。旧 awards の BOX ミラー保存は awards 固有の運用機能
--     （images.routes.ts のコメント参照）で、テロップCGはローカル保存のみでよい。
--
-- step        = RankingStep の値（rankingFields.ts）。'title'|'nominees'|'ranks52'|
--                'winner-bar'|'oneshot'|'top3'|'final-pitch'|'celebration' 等。
--                DBはアプリ側の型を強制しない（型の追加・変更に migration を要求しないため）。
-- rank_start  = ranks52 の開始順位バリアント（5/4/3/2）。それ以外の step は NULL。
-- file        = uploads/graphics-sounds 内のファイル名（UUID.wav / UUID.mp3）。
CREATE TABLE IF NOT EXISTS graphics_ranking_sounds (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES graphics_projects(id) ON DELETE CASCADE,
  step        VARCHAR(20) NOT NULL,
  rank_start  SMALLINT,
  file        VARCHAR(120) NOT NULL,
  volume      NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 同じ (project, step, rank_start) は1音源に正規化する（rank_start NULL は 0 として扱う。
-- 旧 uq_awards_sounds と同じ考え方——アップロードは常に UPSERT で上書きする）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_graphics_ranking_sounds
  ON graphics_ranking_sounds (project_id, step, (COALESCE(rank_start, 0)));
CREATE INDEX IF NOT EXISTS idx_graphics_ranking_sounds_project
  ON graphics_ranking_sounds (project_id);
