-- v2.9.3: クイズに 16:9 カバー画像 (poll 段階のカメラ枠領域に表示)

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS cover_image_data_url TEXT;
