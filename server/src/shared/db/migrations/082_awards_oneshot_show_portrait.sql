-- 082: 1S CG cue state に「画像表示 ON/OFF」と「default module = none」を追加
-- v2.8.70 で追加。CG 送出時に画像有無を選べるようにする。

ALTER TABLE awards_oneshot_cue_state
  ADD COLUMN IF NOT EXISTS show_portrait BOOLEAN NOT NULL DEFAULT TRUE;

-- デフォルト送出モジュールを 'title' → 'none' に変更 (新規イベントから適用)
ALTER TABLE awards_oneshot_cue_state
  ALTER COLUMN module_key SET DEFAULT 'none';
