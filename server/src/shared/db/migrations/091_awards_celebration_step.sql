-- v2.8.152: Congratulation 演出 (celebration step) を追加

ALTER TABLE awards_cue_state DROP CONSTRAINT IF EXISTS awards_cue_state_step_check;
ALTER TABLE awards_cue_state
  ADD CONSTRAINT awards_cue_state_step_check
  CHECK (step IN ('idle','title','nominees','ranks52','top3','winner-bar','oneshot','poll','vote-reveal','final-pitch','celebration'));
