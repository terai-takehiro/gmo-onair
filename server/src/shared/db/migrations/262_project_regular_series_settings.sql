-- レギュラー案件（シリーズ）が持つ4つの取り決め（docs/design/v4/regular-series.md §3・§10-6）
--
-- ── なぜ案件に1度だけ置くか ─────────────────────────────────
--
-- 「収録の頻度」「固定セット」「回の単価」「請求サイクル」は、回を作るたびに
-- 聞かれては困る値（同じ番組で毎回同じ）。回（episodes）ではなく案件（projects）
-- に1度だけ持たせ、回の一括生成（`POST /:id/episodes/generate`・migration不要で
-- 実装済み・regular-series.md §7・§10-5）の既定値として使う。
--
-- 単発案件（recurrence='single'）では使わない値なので、既定値は入れない
-- （NULL のまま）。「まだ決めていない」と「0（本）」「空（自由記述）」を混同しない
-- （shared/CLAUDE.md「NULL＝決めていない」と 0 を混ぜない）。
--
-- ── 語彙は §7 の一括生成ロジックと揃える ─────────────────────
--
-- `recording_cadence` の4値は `episodeGenerate.service.ts` の `EpisodeCadence`
-- （weekly/biweekly/monthly_nth_weekday/none）とそのまま同じ。ズレると
-- 「案件の既定値」を一括生成の入力にそのまま渡せなくなる。
--
-- ── 固定セットは自由記述で十分（過剰設計しない）───────────────
--
-- スタジオ拠点の外部キーで持つ案も検討したが、`studio_bookings`／`studio_rooms`
-- は「収録日ごとの予約」の実体であり、案件側の「いつもの取り決め」はあくまで
-- 目安（メモ）。予約そのものは今までどおり収録日ごとに `studio_bookings` で押さえる。
--
-- ── 単価は「今の値」であって履歴ではない ─────────────────────
--
-- 改定しても過去に作った回の金額（`revenues.amount`）は動かさない。この列は
-- 「次に回を作るときの見込み額の初期値」としてだけ使う（§3 の注記どおり）。
ALTER TABLE projects ADD COLUMN IF NOT EXISTS recording_cadence      TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS recording_per_day_count INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS fixed_studio_note      TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS episode_unit_price     NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_cycle          TEXT NOT NULL DEFAULT 'monthly_close';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_recording_cadence') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_recording_cadence
      CHECK (recording_cadence IS NULL OR recording_cadence IN ('weekly', 'biweekly', 'monthly_nth_weekday', 'none'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_recording_per_day_count') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_recording_per_day_count
      CHECK (recording_per_day_count IS NULL OR recording_per_day_count > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_episode_unit_price') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_episode_unit_price
      CHECK (episode_unit_price IS NULL OR episode_unit_price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_billing_cycle') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_billing_cycle
      CHECK (billing_cycle IN ('monthly_close', 'per_recording_date', 'contract_lump_sum'));
  END IF;
END $$;

COMMENT ON COLUMN projects.recording_cadence IS
  '収録の頻度。weekly=毎週 / biweekly=隔週 / monthly_nth_weekday=毎月第N◯曜日 / none=なし（日付を手で並べる）。'
  '回の一括生成（POST /:id/episodes/generate）の既定値。単発案件では使わない（NULL）';
COMMENT ON COLUMN projects.recording_per_day_count IS
  '1日あたりの本数（基本◯本撮り）。回の一括生成の既定値。単発案件では使わない（NULL）';
COMMENT ON COLUMN projects.fixed_studio_note IS
  '固定セットの自由記述（例: 用賀 SKY STUDIO・3カメラ）。収録日ごとの実際の予約は '
  'studio_bookings が持つ — ここはあくまで「いつもの」の目安';
COMMENT ON COLUMN projects.episode_unit_price IS
  '回の単価（今の値。円）。⚠️ 履歴ではない — 改定しても過去に作った回の revenues.amount は動かさない。'
  '回を作るときの売上見込みの初期値としてだけ使う';
COMMENT ON COLUMN projects.billing_cycle IS
  '請求サイクル。monthly_close=月末締め（既定・その月に完了した回を1枚に集める） / '
  'per_recording_date=収録日ごと / contract_lump_sum=契約一括（案件に1枚・回には金額を持たせない）';
