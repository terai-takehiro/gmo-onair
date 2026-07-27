-- 154: 内覧会 来場予約 — 同行者ごとの個別受付
--
-- 今まで companions は「氏名の文字列配列」で、来場チェックは代表者の登録単位でしか
-- できなかった。当日の受付は同行者も1人ずつ来るので、同行者ごとに「受付する」を
-- 押せるようにする。
--
-- companions は JSONB のまま、中身を { id, name, checked_in_at, checked_in_by } の
-- 配列に変える（新しいテーブルにしない理由: 同行者は代表者の登録に完全に従属し、
-- 単独では検索も一覧もされない。件数も数名程度なので JSONB のままで十分）。
-- id は同行者を一意に指すための固定キー（既存データには無いので生成する）。

UPDATE inview_registrations
SET companions = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'name', elem,
      'checked_in_at', NULL,
      'checked_in_by', NULL
    )
  )
  FROM jsonb_array_elements_text(companions) AS elem
)
WHERE companions IS NOT NULL
  AND jsonb_typeof(companions) = 'array'
  -- 配列の要素が文字列 (旧形式) の行だけを対象にする。
  -- 空配列や既に新形式 (オブジェクト配列) の行は対象外 (このマイグレーションを
  -- 2回実行しても壊れないようにするため)。
  AND jsonb_typeof(companions) = 'array'
  AND (
    jsonb_array_length(companions) = 0
    OR jsonb_typeof(companions -> 0) = 'string'
  );
