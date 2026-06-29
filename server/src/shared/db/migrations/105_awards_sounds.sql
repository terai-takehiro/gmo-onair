-- v2.9.122: 演出SE (CG ステップに割り当てる効果音)。
-- layer = 'ranking' | 'quiz' (どの CG レイヤーのステップか)
-- step  = CG ステップキー (ranking: title/nominees/ranks52/winner-bar/oneshot/celebration 等、
--          quiz: poll/answer-check/correct-reveal 等)
-- rank_start = RANKS (ranks52) の開始順位別バリアント (5/4/3/2)。それ以外は NULL。
-- file = uploads/awards 内のファイル名 (UUID.wav / UUID.mp3)。BOX へもミラー。
CREATE TABLE IF NOT EXISTS awards_sounds (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES awards_events(id) ON DELETE CASCADE,
  layer       VARCHAR(16) NOT NULL,
  step        VARCHAR(40) NOT NULL,
  rank_start  SMALLINT,
  file        VARCHAR(120) NOT NULL,
  box_file_id VARCHAR(64),
  volume      NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 同じ (event, layer, step, rank_start) は 1 音源に正規化 (rank_start NULL は 0 として扱う)。
CREATE UNIQUE INDEX IF NOT EXISTS uq_awards_sounds
  ON awards_sounds (event_id, layer, step, (COALESCE(rank_start, 0)));
CREATE INDEX IF NOT EXISTS idx_awards_sounds_event ON awards_sounds (event_id);
