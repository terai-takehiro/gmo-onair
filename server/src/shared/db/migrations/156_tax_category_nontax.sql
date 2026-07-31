-- 156: 税区分に【不課税】を足す (v3.1.5 / 利用者依頼)
--
-- ── 非課税と不課税は別物 ──────────────────────────────
--
--  - 非課税 (exempt): 消費税の対象だが法令で課税しない取引
--                     (土地の貸付・利息・行政手数料・印紙など)
--  - 不課税 (nontax): そもそも消費税の対象外
--                     (給与・寄付・配当・国外取引・課税対象外の内部振替など)
--
-- どちらも税額は 0 円なので**金額の計算は同じ**だが、帳簿と申告では区別する。
-- いまは選択肢が「非課税」しかないため、不課税の支払いを非課税として入れるほかなく、
-- **あとから分けられない**状態だった。列の値として分ける。
--
-- ── CHECK 制約を差し替える理由 ────────────────────────
--
-- `tax_category` は TEXT + CHECK (tax10/tax8/exempt) なので、値を足すには制約を
-- 貼り替える必要がある。ENUM 型にはしない — この製品の他の区分値も TEXT + CHECK で
-- 揃えており、ENUM は値を足すたびに ALTER TYPE が要る (トランザクション制約もある)。
--
-- 制約名は Postgres の既定名 (`{table}_{column}_check`)。001b で無名指定のため
-- この名前で作られている。**名前を決め打ちせず** pg_constraint から探して落とす
-- (手で貼り直した環境で名前が違っていても通るようにする)。

DO $$
DECLARE
  t TEXT;
  c TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['revenues', 'purchases', 'sga_expenses'] LOOP
    -- tax_category に掛かっている CHECK 制約をすべて落とす
    FOR c IN
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE rel.relname = t
         AND nsp.nspname = current_schema()
         AND con.contype = 'c'
         AND pg_get_constraintdef(con.oid) ILIKE '%tax_category%'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, c);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (tax_category IN (''tax10'',''tax8'',''exempt'',''nontax''))',
      t, t || '_tax_category_check'
    );
  END LOOP;
END $$;

-- 合同案件 (migration 147) の tax_category は CHECK 無しの TEXT なので制約の貼り替えは要らない。
-- 既存データは触らない (非課税として入っている行を不課税に読み替える判断は人がする)。
