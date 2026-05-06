-- 079: awards_cue_state.step CHECK 制約に 'ranks54' と 'top3' を追加
-- TOP3 リアルタイム投票演出（5位→4位 をバー表示 → 1〜3位を横並び大表示）に対応。
ALTER TABLE awards_cue_state DROP CONSTRAINT IF EXISTS awards_cue_state_step_check;
ALTER TABLE awards_cue_state ADD CONSTRAINT awards_cue_state_step_check
  CHECK (step IN ('idle','title','nominees','ranks52','ranks54','top3','winner-bar','oneshot'));
