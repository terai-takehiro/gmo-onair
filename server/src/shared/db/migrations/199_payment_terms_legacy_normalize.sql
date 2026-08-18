-- migration 198 の順序の穴を塞ぐ（レビュー指摘・PR #190 P2）
--
-- 198 は ②customers/vendors の旧列を companies から埋め直す → ③companies の
-- 範囲外の月数を NULL に正規化、の順で書かれていた。**②が先**なので、
-- companies に範囲外の値（migration 175 は月数の範囲チェックを持たなかった
-- ため実在しうる）が残っている環境では、その壊れた値が③で companies から
-- 消される前に customers/vendors 側へコピーされてしまい、旧列にだけ
-- 残り続ける。**旧イメージへロールバックすると、その壊れた値で
-- 期日を計算し続ける**（198がロールバック互換のために足した列のはずが、
-- 範囲外の値ではロールバック後にまた壊れた期日を作る）。
--
-- 198 はすでに実行済みの環境に「後から直した内容」を届けられないので
-- （`runMigrations` は記録済みファイル名を再実行しない）、ここでも
-- 新しい migration として直接 customers/vendors の旧列を正規化する。

UPDATE customers SET payment_months = NULL
  WHERE payment_months IS NOT NULL AND payment_months NOT BETWEEN 0 AND 6;
UPDATE vendors SET payment_months = NULL
  WHERE payment_months IS NOT NULL AND payment_months NOT BETWEEN 0 AND 6;
