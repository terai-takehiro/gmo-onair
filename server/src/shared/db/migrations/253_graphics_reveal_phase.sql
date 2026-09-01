-- ============================================================
-- 248: テロップCG — cue の段階カウンタ（reveal_phase・汎用機構）
--
-- docs/design/v4/graphics-awards-migration-plan.md §4「段6-1 cue拡張
-- （スロット単位の状態機械化）」の最小実装。アワード専用ではなく、
-- 「あるスロットのcueに段階を持たせ、『続き』ボタンで1つずつ進められる」
-- という汎用の仕組みとして先に作る（実証は一覧表部品の段階公開のみ）。
--
-- 新しいページが TAKE されたら 0 にリセットする（アプリ層・store.ts の
-- `applyCueTake`／`upsertCueTx` が、cue を書き換えるたびに reveal_phase を
-- 0 で書き直す形で保証する。「前のページの続き段階を引き継ぐ」という
-- 分かりにくい挙動を作らないため）。
-- ============================================================

ALTER TABLE graphics_cue_state
  ADD COLUMN IF NOT EXISTS reveal_phase INTEGER NOT NULL DEFAULT 0;
