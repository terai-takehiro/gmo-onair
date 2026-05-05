-- 080: awards_cue_state.step CHECK 制約から 'ranks54' を削除
-- v2.8.56 で追加した RANKS 5→4 ステップは v2.8.58 で撤去（一覧から一気に
-- BEST3 を発表する運用に変更）。許容値から ranks54 を外して整合させる。
ALTER TABLE awards_cue_state DROP CONSTRAINT IF EXISTS awards_cue_state_step_check;
ALTER TABLE awards_cue_state ADD CONSTRAINT awards_cue_state_step_check
  CHECK (step IN ('idle','title','nominees','ranks52','top3','winner-bar','oneshot'));
