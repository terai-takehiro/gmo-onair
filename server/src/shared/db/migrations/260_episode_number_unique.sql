-- レギュラー案件で「回」をまとめて作るとき、番号がアトミックでないと重複しうる。
-- ⚠️ GLS 採番（generateGlsNumber）は ON CONFLICT ... RETURNING でアトミック化済みなのに、
-- episode_number だけ read-then-write（MAX+1）のまま残っていた
-- （docs/design/v4/regular-series.md §7・§10）。
--
-- この索引は「取り違え・重複が実際に起きたら DB が拒む」ための最後の砦で、
-- アプリ側は sequence.service.ts の getNextEpisodeNumberAtomic() で防ぐ。
--
-- ⚠️ **本番に既に重複データがあっても、デプロイを止めない。** 索引を無条件で
-- 作ると、既存の重複（過去の read-then-write レースで生まれた可能性がある）が
-- あった場合にこの migration そのものが失敗し、デプロイが止まる。
-- 重複が無いときだけ索引を作り、あれば作らずに NOTICE を出すだけにする
-- （手で直してから再度このファイルを流せば作られる）。
--
-- 部分索引にしてある理由: 論理削除した回の番号は「空いている」ものとして扱いたい
-- （既存の idx_episodes_project と同じ WHERE deleted_at IS NULL の考え方）。
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
    RAISE NOTICE '[episodes] 既存データに (project_id, episode_number) の重複が % 組あります。索引は作りません（手で直してから再実行してください）', dup_count;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_project_number
      ON episodes (project_id, episode_number)
      WHERE deleted_at IS NULL;
  END IF;
END $$;
