-- ============================================================
-- 248: 失注・見送りになった案件の BOX フォルダを片づけた印
--
-- ── なぜ要るか（ユーザー報告）──────────────────────────────
-- 「失注や見送りのなった案件について BOX に残り続けてしまうので、
--   失注、見送りの時点で BOX フォルダを削除していただきたい」
--
-- 実装は「**中身が1つも無ければ削除・あれば `99_失注・見送り` へ引っ越す**」
-- （`box-lost-cleanup.service.ts`）。無条件の削除にしなかった理由は同ファイルの
-- 頭注に書いてある（見積書・請求書・検収書の原本が BOX にしか無い／失注は
-- 取り消せて機械も付ける／`box_url_*` は手で書き換えられる文字列／本番DBの
-- バックアップが社内親フォルダの直下にある）。
--
-- ── なぜ列が要るか ──────────────────────────────────────────
-- **失注から戻したときに元へ返すため**には、「引っ越したのか・消したのか」を
-- 覚えていないといけない:
--   'archived' … 置き場へ引っ越した → 戻すときは親フォルダへ移動し直す
--   'deleted'  … 空だったので消した → 戻すときは同じ形の空フォルダを作り直す
--   NULL       … 片づけていない（現役の案件・BOX 未設定・安全弁で見送った）
-- 覚えていないと、戻した案件のフォルダが置き場に取り残されます
-- （画面からは「フォルダがある」ように見えるのに現役の場所に無い、が一番困る）。
--
-- `box_cleanup_note` は**何をしたか／なぜ触らなかったか**の記録。
-- 安全弁で見送った理由（親が違う・名前が違う・中身を数え切れない）もここに残す。
-- ⚠️ **触らなかったことこそ記録が要ります** — 消えていないことに人は気づけません。
ALTER TABLE projects ADD COLUMN IF NOT EXISTS box_cleanup_state TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS box_cleanup_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS box_cleanup_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_box_cleanup_state_check'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_box_cleanup_state_check
      CHECK (box_cleanup_state IS NULL OR box_cleanup_state IN ('archived', 'deleted'));
  END IF;
END $$;

COMMENT ON COLUMN projects.box_cleanup_state IS
  '失注時のBOX片づけ結果。archived=99_失注・見送りへ移動 / deleted=空だったので削除 / NULL=未片づけ';

-- ⚠️ **既存の失注案件は遡って片づけません。**
-- 溜まっているぶんを一気に動かすと、**本番のBOXで数百フォルダが一斉に動きます**
-- （245 で活動記録を遡って閉じたのとは別の判断 — あちらはDBの中だけで完結し、
-- 案件を戻せば開き直る可逆な操作でした。こちらは外部サービスへの不可逆な操作を
-- 含み、失敗しても一括では戻せません）。
-- 溜まっているぶんは、**画面から人がまとめて実行する導線**で片づける
-- （`POST /projects/box-cleanup/lost`・案件一覧の「終了」帯から）。
