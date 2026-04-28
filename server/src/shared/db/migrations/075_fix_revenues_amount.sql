-- revenues.amount を revenue_items の合計と同期（乖離しているレコードを修正）
UPDATE revenues
SET amount = (
  SELECT COALESCE(SUM(amount), 0)
  FROM revenue_items
  WHERE revenue_id = revenues.id
)
WHERE deleted_at IS NULL
  AND id IN (
    SELECT DISTINCT revenue_id FROM revenue_items
  )
  AND amount != (
    SELECT COALESCE(SUM(amount), 0)
    FROM revenue_items
    WHERE revenue_id = revenues.id
  );
