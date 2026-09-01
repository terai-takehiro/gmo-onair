-- 財務の期間絞り込みが毎回フルスキャンだったのを直す。
--
-- ⚠️ **もとは 250 番だったが 259 に改名した。** テロップCG の回（#511）が先に
-- 250〜258 を使っており、あとから入った #512 の 250 と番号がぶつかって
-- `check-migration-numbers` が落ちた（＝`main` が赤くなった）。
-- 中身は 250 のときと同じで、`CREATE INDEX IF NOT EXISTS` だけなので、
-- **250 として既に流れた環境で 259 として流れ直しても何も起きない**。
--
-- 財務ダッシュボード・売上台帳・仕入台帳の**主フィルタ軸は `recognition_date`** なのに、
-- 索引があったのは `sga_expenses` だけ（`001b_postgresql_schema.sql` の `idx_sga_recognition`）で、
-- `revenues` と `purchases` には無かった。
--
-- しかも 1 リクエストで同じ条件を 4〜5 回走査する作りになっている
-- （COUNT / 本体 / SUM / 按分 / 状態別の件数）。財務ダッシュボードは 1 回の絞り込みで
-- 6 本の API を同時に叩くので、**`revenues`/`purchases` が 20 回以上フルスキャン**されていた。
-- これが「絞り込みを行っていると『サーバー側で処理が止まりました』が頻繁に出る」の
-- 主要因のひとつ（nginx が 60 秒で切って 504）。
--
-- ⚠️ **`deleted_at IS NULL` の部分索引にしている。** 財務のクエリは例外なくこの条件を
-- 持つので、消した行を索引に入れておく意味が無い（索引が小さいほど効く）。
-- ⚠️ **`recognition_date` は TEXT（`YYYY-MM-DD`）。** 型を変えると比較の意味が変わって
-- しまうので、ここでは触らない（`>= '2026-08-01' AND <= '2026-08-31'` の文字列比較のまま）。

CREATE INDEX IF NOT EXISTS idx_revenues_recognition
  ON revenues (recognition_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_recognition
  ON purchases (recognition_date)
  WHERE deleted_at IS NULL;

-- 案件で絞り込んだうえで期間も絞る経路（財務ダッシュボードで案件を選んだとき）。
-- `idx_revenues_project` だけだと、案件の中の全期間を読んでから日付で捨てることになる。
CREATE INDEX IF NOT EXISTS idx_revenues_project_recognition
  ON revenues (project_id, recognition_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_project_recognition
  ON purchases (project_id, recognition_date)
  WHERE deleted_at IS NULL;
