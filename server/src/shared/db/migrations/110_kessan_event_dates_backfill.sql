-- 110: 旧GLS (決算インポート) 案件の開催日バックフィル
--
-- 決算インポートは案件 (projects) を event_start/event_end 無しで作成するため、
-- ①案件一覧の日付ソート/期間絞り込みに乗らない、②「開催日なし=常に表示」の扱いで
-- 既定ビュー (今月〜半年先) に過去の終了案件が大量に混ざり、現行案件が埋もれる、
-- という問題があった。紐づく売上/仕入の計上日 (recognition_date, TEXT YYYY-MM-DD) の
-- MIN/MAX を開催期間として補完する。手入力済み (event_start あり) の案件は変更しない。
WITH d AS (
  SELECT p.id,
         MIN(x.d) AS dmin,
         MAX(x.d) AS dmax
  FROM projects p
  JOIN LATERAL (
    SELECT r.recognition_date AS d
    FROM revenues r
    WHERE r.project_id = p.id AND r.deleted_at IS NULL
      AND r.recognition_date IS NOT NULL AND r.recognition_date <> ''
    UNION ALL
    SELECT pu.recognition_date
    FROM purchases pu
    WHERE pu.project_id = p.id AND pu.deleted_at IS NULL
      AND pu.recognition_date IS NOT NULL AND pu.recognition_date <> ''
  ) x ON true
  WHERE p.deleted_at IS NULL
    AND p.notes LIKE '[kessan:%'
    AND (p.event_start IS NULL OR p.event_start = '')
  GROUP BY p.id
)
UPDATE projects p
SET event_start = d.dmin,
    event_end   = d.dmax,
    updated_at  = NOW()
FROM d
WHERE p.id = d.id;
