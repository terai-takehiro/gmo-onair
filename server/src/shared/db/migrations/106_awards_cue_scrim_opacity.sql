-- v2.9.128: ランキング演出の半透明黒ベース (スクリム) の濃さを操作画面のスライダーで
-- ライブ調整できるようにする。中心値 (0〜0.95) を cue 状態として保存・配信する。
ALTER TABLE awards_cue_state
  ADD COLUMN IF NOT EXISTS scrim_opacity NUMERIC(3,2) NOT NULL DEFAULT 0.72;
