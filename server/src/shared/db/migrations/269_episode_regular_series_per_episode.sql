-- レギュラー案件（シリーズ）の「1日あたりの本数」「回の単価」を、
-- 案件（projects）の固定の取り決めから、回（episodes）ごとの実際の値に変更する
-- （仕様変更 #16・docs/design/v4/regular-series.md §3・§10-6 の見直し）
--
-- ── なぜ案件から回へ移すか ─────────────────────────────────
--
-- migration 262 は「1日あたりの本数」「回の単価」を案件に1度だけ持たせ、
-- 回を作るたびに聞かれずに済むようにした。しかし実務では収録日によって
-- 本数・単価がズレることがある（例: 通常回は1本＋月1回だけ2本撮り、
-- 単価改定を跨いだ回が混在する等）。案件全体で1つの固定値しか持てないと、
-- ズレた回を正しく記録する場所が無い。
--
-- → **各回（episodes）が実際の値を持ち、回ごとに入力・編集できるようにする。**
-- 案件（projects）側の recording_per_day_count / episode_unit_price
-- （migration 262 で追加）は列としては残すが、位置づけを変える —
-- 詳しくは server/src/contexts/sales/services/project.service.ts の該当コメント、
-- および projects 側の COMMENT ON COLUMN（本ファイル末尾で更新）を参照。
--
-- ── NULL＝決めていない、を踏襲 ─────────────────────────────
--
-- 案件作成時に自動で立つ第1回や、一括生成前の回では「まだ決めていない」ことが
-- ありうる。0本・¥0と紛れないよう、既定値は入れずNULLのままにする
-- （shared/CLAUDE.md「NULL＝決めていない」と 0 を混ぜない）。
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS recording_per_day_count INTEGER;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS episode_unit_price      NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_episodes_recording_per_day_count') THEN
    ALTER TABLE episodes ADD CONSTRAINT chk_episodes_recording_per_day_count
      CHECK (recording_per_day_count IS NULL OR recording_per_day_count > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_episodes_episode_unit_price') THEN
    ALTER TABLE episodes ADD CONSTRAINT chk_episodes_episode_unit_price
      CHECK (episode_unit_price IS NULL OR episode_unit_price >= 0);
  END IF;
END $$;

COMMENT ON COLUMN episodes.recording_per_day_count IS
  'この回の収録日に実際に撮った本数（基本◯本撮り）。migration 262 では案件（projects）に'
  '1つだけ持たせていたが、収録日によって本数がズレるため回ごとに持つように変更（#16）。'
  '一括生成（POST /:id/episodes/generate）では都度入力した本数をここに保存する。'
  '「まだ決めていない」は NULL（0 本撮りと混同しない）';
COMMENT ON COLUMN episodes.episode_unit_price IS
  'この回の実際の単価（円）。migration 262 では案件（projects）に1つだけ持たせていたが、'
  '単価改定を跨ぐ等で回ごとにズレるため回ごとに持つように変更（#16）。'
  '一括生成（POST /:id/episodes/generate）では都度入力した単価（revenue_budget_per_episode）を'
  'ここにも保存する。「まだ決めていない」は NULL（¥0 と混同しない）';

-- ── projects 側の同名2列は「案件の取り決め」ではなくなる ─────────────
--
-- 後方互換のため列自体は残す（過去に入力済みのデータ・MCP の update_project 等が
-- まだ参照しうる）が、以後の位置づけは「回の一括生成ダイアログを開いたときの
-- 初期提案値」に留める。**この2列を編集する固定入力欄は案件編集フォームから
-- 廃止した**（client/src/contexts/sales/pages/projectNew/RegularSeriesFields.tsx）。
COMMENT ON COLUMN projects.recording_per_day_count IS
  '⚠️ #16 で位置づけを変更: もう「案件の取り決め」の固定入力欄ではない（画面から廃止）。'
  '後方互換のため列とMCPからの更新は残すが、新規の使い道は回の一括生成'
  '（POST /:id/episodes/generate）ダイアログを開いたときの初期提案値だけ。'
  '実際に保存される本数は episodes.recording_per_day_count（回ごと・migration 269）が正';
COMMENT ON COLUMN projects.episode_unit_price IS
  '⚠️ #16 で位置づけを変更: もう「案件の取り決め」の固定入力欄ではない（画面から廃止）。'
  '後方互換のため列とMCPからの更新は残すが、新規の使い道は回の一括生成'
  '（POST /:id/episodes/generate）ダイアログを開いたときの初期提案値だけ。'
  '実際に保存される単価は episodes.episode_unit_price（回ごと・migration 269）が正';
