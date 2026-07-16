-- v2.9.196: 内覧会 来場予約 → 案件の「昇格」導線 (#11)
-- 来場予約から ヨミ案件 + 活動記録 を起票したとき、その案件 id を記録して
-- 再昇格を防ぎ、UI に案件へのリンク/バッジを出す。

ALTER TABLE inview_registrations ADD COLUMN IF NOT EXISTS promoted_project_id TEXT REFERENCES projects(id);
ALTER TABLE inview_registrations ADD COLUMN IF NOT EXISTS promoted_at         TIMESTAMP;
ALTER TABLE inview_registrations ADD COLUMN IF NOT EXISTS promoted_by         TEXT;

CREATE INDEX IF NOT EXISTS idx_inview_promoted ON inview_registrations(promoted_project_id) WHERE promoted_project_id IS NOT NULL;
