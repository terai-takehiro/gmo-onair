-- レギュラー案件（シリーズ）が持つ取り決めに「放送日オフセット」を足す
-- （docs/design/v4/regular-series.md §3・§7・積み残し1）
--
-- ── なぜ足すか ─────────────────────────────────────────────
--
-- 回の一括生成（`POST /:id/episodes/generate`）は「収録日 + N日」で放送日を
-- 出すが、N（オフセット日数）はこれまでリクエストの `broadcast_offset_days` か
-- 決め打ちの既定値（7日）でしか受けられなかった。migration 262 の4つの取り決め
-- （収録の頻度・固定セット・回の単価・請求サイクル）と同じ場所（案件）に、
-- 5つめとして置く。
--
-- 単発案件（recurrence='single'）では使わない値なので、既定値は入れない
-- （NULL のまま。「まだ決めていない」と「0日（収録＝放送）」を混同しない —
-- shared/CLAUDE.md「NULL＝決めていない」と 0 を混ぜない）。
ALTER TABLE projects ADD COLUMN IF NOT EXISTS broadcast_offset_days INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_broadcast_offset_days') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_broadcast_offset_days
      CHECK (broadcast_offset_days IS NULL OR broadcast_offset_days >= 0);
  END IF;
END $$;

COMMENT ON COLUMN projects.broadcast_offset_days IS
  '収録日から放送日までの既定オフセット日数（例: 収録+7日で公開）。'
  '回の一括生成（POST /:id/episodes/generate）が、リクエストで明示指定が無いときの既定値として使う。'
  '単発案件では使わない（NULL）。生放送は収録＝放送なのでこの値を使わない（episode-generate.routes.ts）';
