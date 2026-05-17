-- v2.8.123: 表彰CG に「投票No.1決定」演出パターンを追加
-- 部門ごとに 'direct' (No.1発表) / 'vote' (投票No.1決定) を切替。
-- vote パターン用に poll (アンケート投票画面) / vote-reveal (投票結果棒グラフ) を新設。

ALTER TABLE awards_categories
  ADD COLUMN IF NOT EXISTS award_pattern VARCHAR(20) NOT NULL DEFAULT 'direct'
    CHECK (award_pattern IN ('direct', 'vote')),
  ADD COLUMN IF NOT EXISTS poll_title TEXT,
  ADD COLUMN IF NOT EXISTS poll_title_en TEXT,
  ADD COLUMN IF NOT EXISTS poll_question TEXT,
  ADD COLUMN IF NOT EXISTS poll_question_en TEXT;

ALTER TABLE awards_entries
  ADD COLUMN IF NOT EXISTS vote_count INTEGER NOT NULL DEFAULT 0;

-- awards_cue_state: step の許容値を拡張 + 投票演出用フィールドを追加
ALTER TABLE awards_cue_state DROP CONSTRAINT IF EXISTS awards_cue_state_step_check;
ALTER TABLE awards_cue_state
  ADD CONSTRAINT awards_cue_state_step_check
  CHECK (step IN ('idle','title','nominees','ranks52','top3','winner-bar','oneshot','poll','vote-reveal'));

ALTER TABLE awards_cue_state
  ADD COLUMN IF NOT EXISTS vote_display VARCHAR(10) NOT NULL DEFAULT 'count'
    CHECK (vote_display IN ('count', 'percent')),
  ADD COLUMN IF NOT EXISTS poll_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reveal_phase SMALLINT NOT NULL DEFAULT 0
    CHECK (reveal_phase BETWEEN 0 AND 2);
