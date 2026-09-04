-- episode_number 側は 260/267 で「削除済みは空き番号扱い」の partial unique index
-- (idx_episodes_project_number, WHERE deleted_at IS NULL) に直したのに、
-- episode_code（GLS番号+話数から作る文字列コード）の一意制約だけが 001b の素の
-- UNIQUE のまま取り残されていた（deleted_at を見ない＝削除済みの回のコードも
-- 「使用中」扱いのまま）。
--
-- そのため「回を全部削除 → 同じ話数で登録し直す」と、episode_number の重複
-- チェックは通過するのに episode_code の UNIQUE 制約で INSERT が失敗し、
-- 各ルートの catch が「他の操作と同時に重なったため話数が重複しました」という
-- 誤ったメッセージを返していた（実際には同時実行が一切無くても毎回失敗する）。
--
-- 260/267 と同じ理由で、既存の重複データがあってもデプロイは止めない
-- （制約を作り直さないだけ）。
DO $$
DECLARE
  dup_count INTEGER;
  cons_name TEXT;
BEGIN
  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'episodes'::regclass
     AND contype = 'u'
     AND conkey = ARRAY[
       (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'episodes'::regclass AND attname = 'episode_code')
     ];

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE episodes DROP CONSTRAINT %I', cons_name);
  END IF;

  SELECT COUNT(*) INTO dup_count FROM (
    SELECT episode_code
    FROM episodes
    WHERE deleted_at IS NULL
    GROUP BY episode_code
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE WARNING '[episodes] episode_code の重複（未削除分のみ）が % 件あるため idx_episodes_code_unique を作れません。重複を直したうえで手動で CREATE UNIQUE INDEX を実行してください（手順は migrate.ts の起動時チェックが出力します）', dup_count;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_code_unique
      ON episodes (episode_code)
      WHERE deleted_at IS NULL;
  END IF;
END $$;
