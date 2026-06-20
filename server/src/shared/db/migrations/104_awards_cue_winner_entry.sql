-- v2.9.115: 投票No.1決定 (vote パターン) で アンケート未紐づけのとき、operator が
-- No.1 を手動選択して CELEB (紙吹雪) で発表できるようにするための保存先。
-- NULL のときは従来どおり rank=1 / is_winner を No.1 として扱う。
ALTER TABLE awards_cue_state ADD COLUMN IF NOT EXISTS winner_entry_id INTEGER;
