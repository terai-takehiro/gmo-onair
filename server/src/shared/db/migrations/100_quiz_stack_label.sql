-- v2.9.49: クイズ/アンケートCG の送出スタック管理
--   ① stack_label = 送出 UI に表示する任意の名前 (空なら title をフォールバック表示)
--   ② display_order は migration 092 で既に存在 → 管理画面の並び替えで採番し直す
--
-- 送出順は quizzes.display_order 昇順 (operator の NEXT プルダウン / 自動進行が参照)。
-- mode (survey/quiz) を跨いだ 1 本のスタックとして扱う。

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS stack_label TEXT;
