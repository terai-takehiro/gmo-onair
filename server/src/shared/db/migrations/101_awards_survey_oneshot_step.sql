-- v2.9.63: アンケート No.1 発表をランキングCGへ移管。
-- 連動アンケート (quizzes.link_category_id) の最多得票を、賞の最後に
-- フルスクリーンで発表する専用ステップ 'survey-oneshot' を追加。
-- reveal_phase は migration 090 で 0–3 に拡張済 (0=ロール / 1=ロック / 2=No.1)。

ALTER TABLE awards_cue_state DROP CONSTRAINT IF EXISTS awards_cue_state_step_check;
ALTER TABLE awards_cue_state
  ADD CONSTRAINT awards_cue_state_step_check
  CHECK (step IN ('idle','title','nominees','ranks52','top3','winner-bar','oneshot','poll','vote-reveal','final-pitch','celebration','survey-oneshot'));
