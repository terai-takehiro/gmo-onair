-- やり取りの本文を「話者ごとの構造」で持つ（v4 ⑥ 案件記録・読みやすさの作り直し）
--
-- ── なぜ HTML 1本では足りなかったのか ──────────────────────────
--
-- migration 184 で入れた `body_html` は **整形した本文を1本の HTML** で持ちます。
-- 実際の取込メールは「先方が言ったこと」と「当社が答えたこと」が交互に並ぶ
-- やり取りなのに、1本の HTML にすると**どちらの発言かが文の中にしか残りません**
-- （「先方より〜との連絡。こちらからは〜と回答」という散文になる）。
-- 読む人は毎回それを頭の中で分解していました。
--
-- ここでは AI に**意味の単位**を返させ、**見せ方は画面が決めます**
-- （メール取込の `details`＝`RichBlock[]` と同じ考え方。`rich-content.ts` の冒頭）。
--
--   subtitle … 件名の続き（件名は言い切りの短い部分だけを大きく出す）
--   statuses … 状態（撮影決定・昇格の判断待ち）。**点＋文字**で出す
--   facts    … 日時・人員・機材・見積などの事実。**アイコン＋値**で出す
--   lead     … 全体の1〜2文
--   turns    … 発言。誰が・いつ・引用・補足・項目
--
-- ── 列名を `details` にしない理由 ────────────────────────────
--
-- `finance_docs.details` / `inquiries.details` は **`RichBlock[]`（配列）** です。
-- ここはオブジェクトなので、同じ名前にすると `normalizeRichContent()` に
-- 渡されて**中身が丸ごと捨てられます**（配列でなければ null を返す実装）。
-- `body_html` と対になる形（同じ本文の構造版）なので `body_struct` にしました。
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS body_struct JSONB;

-- ── 待ち行列の表し方を組み直す（migration 187 からの変更）──────────
--
-- 187 は「まだ = body_html IS NULL AND format_attempted_at IS NULL」でしたが、
-- **成功時にも `format_attempted_at` を立てている**ため、この2つだけでは
-- 「成功した行」と「失敗した行」を見分けられません（187 の時点では
-- `body_html IS NOT NULL` が成功の印だったので成り立っていました）。
--
-- v2 では**失敗の印を `format_error` に寄せます**。
--   整えた   = body_struct IS NOT NULL
--   失敗した = body_struct IS NULL AND format_error IS NOT NULL
--   まだ     = body_struct IS NULL AND format_error IS NULL
--              （かつ「人が入れた本文」ではない = body_html IS NULL OR ai_formatted）
--
-- ⚠️ **v1 で整えた行（`body_html` があり `body_struct` が無い）はもう一度対象になります。**
-- 1件につき1回 AI を呼ぶので**課金されます**。件数と推定費用は
-- 設定 →「やり取りの本文を整える」が押す前に出します（黙って流さない）。
-- v1 の行を作り直さない選択もできますが、**画面は構造がある行だけ新しい形で描く**ので、
-- 作り直さないと同じ一覧の中に2つの見た目が混ざります。
--
-- ⚠️ **人が入れた本文（`body_html` があるが `ai_formatted` が false）は対象にしません。**
-- 人が書いたものを AI の構造で置き換えることになります。
--
-- **`format_attempted_at` は残します**（「最後に試した時刻」として意味がある）。
-- 消すと、失敗した行がいつから失敗しているのか分からなくなります。
CREATE INDEX IF NOT EXISTS idx_activity_logs_struct_pending
  ON activity_logs (activity_date DESC)
  WHERE deleted_at IS NULL AND body_struct IS NULL AND format_error IS NULL;

-- 187 の索引は使わなくなるので落とす（残すと書き込みのたびに更新され続ける）。
DROP INDEX IF EXISTS idx_activity_logs_format_pending;
