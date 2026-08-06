-- ============================================================
-- 160: AI が取り込んだメールを「読める形」で持てるようにする
--
-- ── なぜ 143 ではなく 160 から採るか ──────────────────────
--
-- v3.2.0 のロールバックで消えた系統の migration が git 履歴に残っており、
-- **本番 DB にはそちらも適用済み**（CLAUDE.md「スキーマは 159 のまま」）。
-- そのため 137〜157 は**二重に使われている**:
--   137 task_work_state ↔ user_notification_prefs
--   138 estimates       ↔ external_tool_outputs
--   139 pricing_audit   ↔ promote_inquiry_and_audio_revoke
--   140 revenue_inspection_payment ↔ slack_digests
--   141 project_minutes ↔ finance_doc_original
--   142 finance_doc_handoff ↔ user_permission_changes
--   143〜157 は旧系統だけが使用
-- `migrate.ts` はファイル名で記録するので同番号でも動くが、
-- **番号を再利用すると `_migrations` に同番号・別名が並んで後から誰も追えない**。
-- だから次は 160 から採る。
--
-- ── なぜ要るか ────────────────────────────────────────────
--
-- メールから取り込んだ内容は、いま**自由文の1行**にしか入っていない。
--   misc_inquiries.summary   … 「内容の1行要約」
--   misc_inquiries.notes     … 画面では `📝 <そのままのテキスト>` と出るだけ
--   finance_docs.content     … 「内容 (要約)」。画面では**そもそも出していない**
--
-- 実際のメールは「誰が・何を・いつまでに・いくらで・条件は」が入り混じっていて、
-- 1行にまとめると**必ずどれかが落ちる**。落とさずに全部書くと今度は
-- 段落もラベルも無いテキストの塊になり、受け取った人は毎回読み直すことになる。
--
-- ── 決めたこと: AI に HTML を書かせない ───────────────────
--
-- 「HTML を返させて画面に流し込む」は採らない。理由は3つ:
--   ① 取引先が送ってきた文面がそのまま HTML として実行される (XSS)
--   ② 画面の書体・色・余白が AI の気分で変わる (v4 の規律が効かない)
--   ③ 中身を後から検索・集計・CSV 出力できない (文字列の塊になる)
--
-- 代わりに **「意味の単位」の配列** を持たせる。AI は *何の情報か* を言い、
-- *どう見せるか* はアプリが決める。
--
--   details = [
--     { "type": "fields", "items": [
--         { "label": "希望日", "value": "2026-09-12", "emphasis": "date" },
--         { "label": "予算",   "value": "1,200,000",  "emphasis": "money" } ] },
--     { "type": "bullets", "items": ["4カメ想定", "同時通訳あり"] },
--     { "type": "quote", "text": "配信のみで会場は不要です", "source": "本文より" }
--   ]
--
-- 形は `server/src/shared/services/rich-content.ts` が検査して正規化する。
-- **知らない type は捨てる** (画面が壊れるより落ちるほうがよい)。
--
-- ── body_text: 原文を切り詰めずに残す ─────────────────────
--
-- 会社方針「AI を使い捨てにしない」の条件1 (AI の出力を記録・保存する) は
-- `ai_outputs.payload_snapshot` が満たすが、**入力である原文**が無いと
-- 「AI がどこを読み違えたか」を後から確かめられない。
-- `mcp_audit_log` は args を 1000 文字で切り詰めるので教師データにならない。
-- ここに全文を持つ。
-- ============================================================

ALTER TABLE misc_inquiries
  ADD COLUMN IF NOT EXISTS details   JSONB,
  ADD COLUMN IF NOT EXISTS body_text TEXT;

ALTER TABLE finance_docs
  ADD COLUMN IF NOT EXISTS details   JSONB,
  ADD COLUMN IF NOT EXISTS body_text TEXT;

-- 配列であることだけ保証する (中身は上記サービスが検査する)。
-- NOT VALID: 既存行は NULL なので実際には全部通るが、
-- 巨大テーブルでの検証を待たないために揃えてある (142 と同じ扱い)。
ALTER TABLE misc_inquiries DROP CONSTRAINT IF EXISTS misc_inquiries_details_is_array;
ALTER TABLE misc_inquiries ADD CONSTRAINT misc_inquiries_details_is_array
  CHECK (details IS NULL OR jsonb_typeof(details) = 'array') NOT VALID;

ALTER TABLE finance_docs DROP CONSTRAINT IF EXISTS finance_docs_details_is_array;
ALTER TABLE finance_docs ADD CONSTRAINT finance_docs_details_is_array
  CHECK (details IS NULL OR jsonb_typeof(details) = 'array') NOT VALID;

-- 「AI が構造化して入れたもの」を引くため。
-- 画面の絞り込みではなく、**改善のために後から数える**のに使う
-- (構造化できた率 / 人が直した率)。
CREATE INDEX IF NOT EXISTS idx_misc_inquiries_has_details
  ON misc_inquiries (created_at DESC)
  WHERE details IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_finance_docs_has_details
  ON finance_docs (created_at DESC)
  WHERE details IS NOT NULL AND deleted_at IS NULL;
