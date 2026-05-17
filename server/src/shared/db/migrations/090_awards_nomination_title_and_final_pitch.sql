-- v2.8.148: ノミネートタイトル (entry ごと) + Final Pitch ステップ追加

ALTER TABLE awards_entries
  ADD COLUMN IF NOT EXISTS nomination_title TEXT,
  ADD COLUMN IF NOT EXISTS nomination_title_en TEXT;

-- step CHECK 制約に 'final-pitch' を追加
ALTER TABLE awards_cue_state DROP CONSTRAINT IF EXISTS awards_cue_state_step_check;
ALTER TABLE awards_cue_state
  ADD CONSTRAINT awards_cue_state_step_check
  CHECK (step IN ('idle','title','nominees','ranks52','top3','winner-bar','oneshot','poll','vote-reveal','final-pitch'));

-- reveal_phase は final-pitch でも使う (0=3 cards / 1-3=picked candidate index)
ALTER TABLE awards_cue_state DROP CONSTRAINT IF EXISTS awards_cue_state_reveal_phase_check;
ALTER TABLE awards_cue_state
  ADD CONSTRAINT awards_cue_state_reveal_phase_check
  CHECK (reveal_phase BETWEEN 0 AND 3);
