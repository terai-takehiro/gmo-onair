-- ============================================================
-- 料金表の書き込みが 500 で落ちていたのを直す
--
-- `pricing.routes.ts` の 6 つの書き込み (分類の追加・更新・削除 /
-- 品目の追加・更新・削除) はすべて `created_by` / `updated_by` に
-- 書いているが、**両方のテーブルにその列が無い** (001b の定義に入っていない)。
--
--   INSERT INTO pricing_categories (id, name, sort_order, created_by) …
--   UPDATE pricing_items SET … updated_by=? …
--
-- そのため料金表は**読むことしかできない状態**だった。
-- 画面側にも `onError` が無かったので、ダイアログが閉じないだけで
-- 何が起きたか分からなかった (v4 ⑧ で画面を作り直したとき実測して発見)。
--
-- 列を足すほうを選んだ理由: **誰が値段を変えたかは残したい情報**だから。
-- SQL から `created_by` / `updated_by` を消せば同じく直るが、
-- 料金表は金額のマスタなので、変更者が分からないのは困る。
--
-- 既存行は NULL。**過去に誰が入れたかは分からない**ので埋めない
-- (それらしい値を入れると、あとから見た人が本当の記録だと思う)。
-- ============================================================

ALTER TABLE pricing_categories ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE pricing_categories ADD COLUMN IF NOT EXISTS updated_by TEXT;

ALTER TABLE pricing_items ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE pricing_items ADD COLUMN IF NOT EXISTS updated_by TEXT;
