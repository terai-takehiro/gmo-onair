-- 入ってきた情報に「出どころ・行き先・タグ・チケット」を持たせる (v4 大②)
--
-- モックの ⑤ 入ってきた情報 は、届いたものを **4つの行き先に仕分ける台** です。
-- いまの実装は「重要度」と「対応済みか」しか持っておらず、
-- 仕分けた結果がどこにも残りません（対応済みにするだけ）。
--
--   モックの本文（そのまま）:
--   「行き先は3つだけです。やることになるならチケット（案件管理のタスクになります）、
--     案件になりそうなら案件の受付へ、あとで効く話ならストックしてタグを付ける。
--     どれでもないものは見送りにして消します。」
--
-- ── state（行き先）は5つ。モックのタブは4つ ─────────────────
--
-- モックのタブは 未仕分け / ストック / チケット / 見送り の4つですが、
-- **本文が挙げている行き先は「案件の受付へ送る」を含めて4つ**あり、
-- 「案件にした」の置き場だけタブがありません（モックでは押すとダイアログが
-- 開くだけで、状態が動きません）。
--
-- そのまま作ると、案件の受付へ送ったものが **未仕分けに残り続けます**。
-- 受付は毎日その順で消化する画面なので、翌日また同じものを送り、
-- **同じ引き合いから案件が2件できます**。実害が出るので `project` を足しました。
-- （足したのはこの1つだけで、他はモックのままです）
--
--   unsorted  未仕分け    まだ仕分けていない。**ここが受付の作業列**
--   stock     ストック    あとで効く話。タグを付けて後から引く
--   ticket    チケット    やることになった → `project_tasks` を1本作る
--   project   案件にした  案件の受付へ送った → `projects` (ネタ) ができた
--   dropped   見送り      どれでもない
--
-- ── `handled_at` は残すが、**絞り込みには使わない** ──────────
--
-- 既にある `handled_at` / `handled_by` は「誰がいつ触ったか」の記録として残します。
-- ただし **正は `state` の1本**です。両方で絞れるようにすると、片方だけ動いた行が
-- 一覧から消えます（この文書の他の場所で何度も踏んでいる形）。
-- 状態を動かしたときに `handled_at` も併せて打ち、**読むのは `state` だけ**にします。
--
-- 既存の「対応済み」は **ストックに寄せます**。
--   ・未仕分けに置くと、片づけ済みのものが翌朝ぜんぶ作業列に戻ってきます
--   ・見送りにすると消えたように見えます
--   ・チケットにすると、存在しないタスクを指すことになります
-- 「あとで効く話として取ってある」がいちばん実態に近く、害がありません。
--
-- ── source（出どころ）── mail / slack / phone / talk ─────────
--
-- 列は既にありますが、入る値は `email`（MCP 取込）と `manual`（手で足した）の
-- 2つだけで、**出どころではなく「AI が入れたか」を表していました**
-- （画面も `source === 'email'` を AI の印に使っていた）。
-- モックは出どころ（メール / Slack / 電話 / 口頭）と AI かどうかを**別々に**出します。
--
-- ここで `email` → `mail` に寄せ、AI かどうかは
-- `ai_outputs`(kind=inquiry_intake) が有るかで判定します（実際に記録があるものだけ
-- AI の印が付く。source を見ていたときは手で足したメールにも印が付いていました）。
--
-- `manual` は**残します** — 既存行の出どころが本当に分からないためで、
-- 分からないものを「メール」と言い切るほうが害が大きい。新しい行には入りません。
--
-- ── tags（タグ）は TEXT[] ────────────────────────────────
--
-- 「よく使うタグ」の集計 (`unnest`) と「このタグが付いたものだけ」(`&&`) を
-- SQL で引くので配列で持ちます。JSON 文字列だとどちらも書けません。
--
-- 既存の `category`（1つだけの分類）は **tags の1つ目へ写します**。
-- 列は消さず、tags を書くときに `category = tags[1]` を併せて更新します
-- （`dashboard.routes.ts` と MCP の返り値が category を読んでいるため。
--   片方だけ直すと、受信箱に出る分類だけが古いままになります）。

ALTER TABLE misc_inquiries ADD COLUMN IF NOT EXISTS state      TEXT   NOT NULL DEFAULT 'unsorted';
ALTER TABLE misc_inquiries ADD COLUMN IF NOT EXISTS tags       TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE misc_inquiries ADD COLUMN IF NOT EXISTS task_id    TEXT REFERENCES project_tasks(id) ON DELETE SET NULL;
ALTER TABLE misc_inquiries ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id)      ON DELETE SET NULL;

-- 既存の「対応済み」→ ストック（上の理由）
UPDATE misc_inquiries SET state = 'stock'
 WHERE deleted_at IS NULL AND handled_at IS NOT NULL AND state = 'unsorted';

-- 既存の分類 → タグの1つ目
UPDATE misc_inquiries SET tags = ARRAY[btrim(category)]
 WHERE tags = '{}' AND category IS NOT NULL AND btrim(category) <> '';

-- 出どころ: email → mail（`manual` はそのまま）
UPDATE misc_inquiries SET source = 'mail' WHERE source = 'email';

-- **列の既定値も直す。** 既定が 'email' のままだと、source を渡さない INSERT が
-- 下の CHECK に弾かれて取込ごと 500 になる（実際に検証 DB で既定が残っていた）
ALTER TABLE misc_inquiries ALTER COLUMN source SET DEFAULT 'mail';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_misc_inquiries_state') THEN
    ALTER TABLE misc_inquiries ADD CONSTRAINT chk_misc_inquiries_state
      CHECK (state IN ('unsorted', 'stock', 'ticket', 'project', 'dropped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_misc_inquiries_source') THEN
    ALTER TABLE misc_inquiries ADD CONSTRAINT chk_misc_inquiries_source
      CHECK (source IN ('mail', 'slack', 'phone', 'talk', 'manual'));
  END IF;
END $$;

-- 作業列（未仕分け）を引く索引。**ここだけは毎回全員が開く**
CREATE INDEX IF NOT EXISTS idx_misc_inquiries_state
  ON misc_inquiries(state) WHERE deleted_at IS NULL;

-- 「このタグが付いたものだけ」を引く
CREATE INDEX IF NOT EXISTS idx_misc_inquiries_tags
  ON misc_inquiries USING GIN (tags);

COMMENT ON COLUMN misc_inquiries.state IS
  '行き先 unsorted/stock/ticket/project/dropped。**絞り込みはこの列だけを見る** (handled_at は記録用)';
COMMENT ON COLUMN misc_inquiries.tags IS
  'タグ。category は1つ目の写し (古い読み手のため両方更新する)';
COMMENT ON COLUMN misc_inquiries.task_id IS
  'チケットにしたときに作った project_tasks.id。**押し直しても増やさない**ための印でもある';
COMMENT ON COLUMN misc_inquiries.project_id IS
  '案件の受付へ送って出来た projects.id。**同じ引き合いから2件作らない**ための印';
COMMENT ON COLUMN misc_inquiries.source IS
  '出どころ mail/slack/phone/talk。manual は出どころが分からない既存行 (新規では入らない)';
