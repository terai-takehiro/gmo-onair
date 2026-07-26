-- 153: お試し（練習が実績に混ざらない）— デザイン 25章
--
-- ── なぜ列を足すだけにしたか ────────────────────────────
--
-- 「練習用の別のDB」や「練習用のテーブル」にすると、**道具のほうを2つ書く**
-- ことになる (見積・香盤表・運営マニュアルが練習用と本番用で別の経路になる)。
-- そうすると練習で通った道と本番で通る道が違うので、**練習の意味が無くなる**。
--
-- 通る道は1本のままにして、**数える側で外す**。
-- そのために案件とお客様に印を1つずつ足す。
--
-- ── 逆向きにしない ──────────────────────────────────────
--
-- 既定は FALSE (本物)。**練習だけが印を持つ**形にする。
-- 逆 (`is_real` を持たせて既定 FALSE) にすると、印を付け忘れた本物が
-- 数字から消えるので、間違いの出方が「売上が足りない」になる。
-- こちらの向きなら、印を付け忘れた練習が数字に入る = **多い方に間違う**ので
-- 気づける。
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT FALSE;

-- お試しのお客様。本物のお客様一覧に混ぜない
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT FALSE;

-- 数える側は「お試しを外す」形で毎回引くので、部分索引を張る
CREATE INDEX IF NOT EXISTS idx_projects_not_sandbox
  ON projects(stage) WHERE is_sandbox = FALSE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_sandbox
  ON projects(created_at DESC) WHERE is_sandbox = TRUE AND deleted_at IS NULL;
