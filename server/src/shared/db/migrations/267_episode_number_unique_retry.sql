-- 260 の再挑戦。260 は重複があると NOTICE を出して索引を作らないまま _migrations に
-- 記録され、二度と実行されない（NOTICE はデプロイログを一度流れるだけで、以後どこにも
-- 「索引が無い」という信号が残らない）。索引が無いままの環境に、もう一度だけ作成を試みる。
-- 作れないときは NOTICE ではなく WARNING で残す。以後の見張りは migrate.ts の
-- 起動時チェック（idx_episodes_project_number の有無を毎回確認）が担う。
--
-- ⚠️ 260 と同じく、重複データがあってもデプロイは止めない（索引を作らないだけ）。
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT project_id, episode_number
    FROM episodes
    WHERE deleted_at IS NULL
    GROUP BY project_id, episode_number
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE WARNING '[episodes] (project_id, episode_number) の重複が % 組あるため idx_episodes_project_number を作れません。重複を直したうえで手動で CREATE UNIQUE INDEX を実行してください（手順は migrate.ts の起動時チェックが出力します）', dup_count;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_project_number
      ON episodes (project_id, episode_number)
      WHERE deleted_at IS NULL;
  END IF;
END $$;
