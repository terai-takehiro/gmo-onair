-- ========================================================
-- Migration 192: 取引先マスターに「グループ会社か」の印を持たせ、
--                案件のグループ内 / グループ外を自動で決める
-- ========================================================
--
-- ── なぜ足すか（ご指示）────────────────────────────────────
--
-- 「グループ内かグループ外かは自動で判定できるようにしたい。取引先マスターに
--   グループかどうかのチェックボックスをつくる。GMO とついているものはすべて
--   グループと判断してよい」
--
-- これまで案件の `customer_type`（グループ内 / グループ外）は**人が案件ごとに
-- プルダウンで選ぶ**ものでした。見積の単価（定価 / グループ内価格）がこの値で
-- 決まるのに、**選び忘れても画面には何も出ません** — グループ会社の案件に
-- 定価が並んでも、気づくのは見積を送ったあとです。
--
-- → **決めるのは取引先マスターの1か所**にして、案件は毎回そこから引きます。
--
-- ── migration 182 の但し書きを、この版で撤回します ────────────
--
-- 182 は `customers.is_gmo_group` を足したとき「**社名の文字列一致では
-- 判定しない**（社名は変わるし、GMO を含む社外の会社を誤判定する）」と
-- 書きました。**印を人が付ける**という決めごと自体は変えません（列が正であり、
-- 画面のチェックボックスで外せます）が、**空の印を GMO の社名で埋める**のは
-- ご指示のとおり行います。誤判定は**チェックを外せば直り、以後も外れたまま**です
-- （この移行は1回きりで、あとから上書きしません）。
--
-- ── `companies` にも持たせる ────────────────────────────────
--
-- 182 は「`companies` は `customers.company_id` が nullable で未リンクの取引先が
-- あると判定が空振りする」ため `customers` にだけ置きました。**判定の正は
-- いまも `customers`** です（案件は `customer_id → customers` を直接見る）。
-- ただしご指示の**チェックボックスは取引先マスター（`companies`）の画面**に
-- 置くので、列を両方に持たせて**保存のたびに双方向で同期**します
-- （`companies.routes.ts` / `customers.routes.ts`）。

-- ── 1. 取引先マスター側の列 ──────────────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_gmo_group BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN companies.is_gmo_group IS
  'GMOインターネットグループのグループ会社か。取引先マスターのチェックボックスが正。'
  '保存時に紐付く customers.is_gmo_group と双方向で同期する';

-- ── 2. 社名から埋める（GMO とついているものはグループ）───────────
--
-- 全角（ＧＭＯ／ｇｍｏ）も拾う。`translate` で半角に落としてから大文字にする
-- （`ILIKE '%GMO%'` だけだと全角表記の会社が漏れる）。
-- **すでに TRUE のものは触らない**（人が付けた印を上書きしない）。
UPDATE companies
   SET is_gmo_group = TRUE
 WHERE is_gmo_group = FALSE
   AND deleted_at IS NULL
   AND upper(translate(name, 'ｇｍｏＧＭＯ', 'gmoGMO')) LIKE '%GMO%';

UPDATE customers
   SET is_gmo_group = TRUE
 WHERE is_gmo_group = FALSE
   AND deleted_at IS NULL
   AND upper(translate(name, 'ｇｍｏＧＭＯ', 'gmoGMO')) LIKE '%GMO%';

-- ── 3. **人がすでに決めた「グループ内」を必ず残す** ──────────────
--
-- ここが要点です。手順 5 で案件のグループ区分を取引先マスターから引き直すので、
-- **いま「グループ内」になっている案件のお客様に印が無いと、その案件が黙って
-- 社外に戻ります**（見積がグループ内価格を選ばなくなる）。GMO とついていない
-- グループ会社（社名を変えた会社・関連会社）がここに当たります。
--
-- → **グループ内の案件を1件でも持つお客様は、グループ会社として印を付ける。**
--   これで手順 5 は「印を増やす」方向にしか動かず、**情報を落としません**。
UPDATE customers c
   SET is_gmo_group = TRUE
 WHERE c.is_gmo_group = FALSE
   AND EXISTS (
     SELECT 1 FROM projects p
      WHERE p.customer_id = c.id
        AND p.deleted_at IS NULL
        AND p.customer_type = 'internal'
   );

-- ── 4. 2つのマスターを揃える（未リンクの行はそれぞれのまま）──────
UPDATE companies co
   SET is_gmo_group = TRUE
 WHERE co.is_gmo_group = FALSE
   AND EXISTS (
     SELECT 1 FROM customers cu
      WHERE cu.company_id = co.id AND cu.deleted_at IS NULL AND cu.is_gmo_group = TRUE
   );

UPDATE customers cu
   SET is_gmo_group = TRUE
  FROM companies co
 WHERE cu.company_id = co.id
   AND cu.is_gmo_group = FALSE
   AND co.deleted_at IS NULL
   AND co.is_gmo_group = TRUE;

-- ── 5. 案件のグループ区分を取引先マスターから引き直す ───────────
--
-- **増やす方向だけ**です（手順 3 のおかげで、減る行はありません）。
-- お客様が付いていない古い行（`customer_id IS NULL`）は**触りません** —
-- どちらとも言えないものを機械で決めると、決めたことに誰も気づけません。
UPDATE projects p
   SET customer_type = 'internal'
  FROM customers c
 WHERE p.customer_id = c.id
   AND p.deleted_at IS NULL
   AND c.is_gmo_group = TRUE
   AND p.customer_type <> 'internal';

COMMENT ON COLUMN projects.customer_type IS
  'グループ内(internal) / グループ外(external)。**人は選ばない** — 保存のたびに '
  'お客様（customers.is_gmo_group）から導く（project.service の resolveCustomerType）。'
  '列として持つのは、あとから数えるときに取引先マスターの「いまの」印ではなく '
  '案件を取った当時の姿で数えるため（intake_channel=group と同じ理由）';
