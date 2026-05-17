-- 087: 下位置CG にカウントダウンテロップ用カラムを追加
-- v2.8.121 — 「アワードまであと〇〇分〇〇秒」 を 3D 立体数字でくるくる回す
-- 独立 CG レイヤー (lower-third / ticker と並列に重ねる)。

ALTER TABLE awards_oneshot_cue_state
  ADD COLUMN IF NOT EXISTS countdown_on BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS countdown_target TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS countdown_prefix_ja VARCHAR(80) NOT NULL DEFAULT 'アワードまであと',
  ADD COLUMN IF NOT EXISTS countdown_prefix_en VARCHAR(80) NOT NULL DEFAULT 'Awards starts in',
  ADD COLUMN IF NOT EXISTS countdown_x NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS countdown_y NUMERIC(5,2) NOT NULL DEFAULT 40.00,
  ADD COLUMN IF NOT EXISTS countdown_scale NUMERIC(4,2) NOT NULL DEFAULT 1.00;
