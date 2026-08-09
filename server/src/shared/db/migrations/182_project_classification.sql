-- 案件分類を「客入れの有無 × 案件分類」の2段にする ＋ 取引先のグループ会社フラグ
--
-- ── なぜ2列足すのか（`project_type` を置き換えないのか）────────────────
--
-- 旧 `project_type` は7種類の1段でした:
--   offline_event / hybrid_event / live_broadcast / recording   … GLS-A（案件）
--   gmo_project / consulting / other                            … GLS-B（プロジェクト管理）
--
-- 2段分類（客入れの有無 × 配信・収録・イベント）が置き換えるのは **上の4つだけ**です。
-- 下の3つはプロジェクト管理側（migration 179 で GLS-B に寄せた）に回っており、
-- 2段のどこにも当てはまりません。
--
-- `project_type` を捨てると、この3つの受け皿を別に決めたうえで
-- **標準工程テンプレート・Excel 入出力・シード・AI フィードバックの項目名・
-- GLS 分類の判定（`getProjectCategory`）** を一斉に直すことになります。
-- そのため **2列を足して併存**させ、A系の保存時にサーバーが `project_type` を
-- 同期します（`project-classification.ts` が唯一の対応表）。
--
--   ・読む側は今までどおり `project_type` で動く（41 か所を1行も触らない）
--   ・v4 の画面は `audience` / `project_category` を読む
--   ・**書くのはサーバーの1か所だけ**。画面から両方を送らせると、
--     片方だけ更新された行ができて「一覧の分類と詳細の分類が違う」になる
--
-- ── 移行の対応（指示書 第2章の想定どおり）──────────────────────────
--
--   ハイブリッドイベント → 有観客 ＋ 配信/生放送
--   生放送（ライブ配信） → 無観客 ＋ 配信/生放送
--   収録                 → 無観客 ＋ 収録
--   オフラインイベント   → 有観客 ＋ イベント（会場のみ）
--   GMO案件 / コンサル / その他 → **NULL のまま**（GLS-B。2段分類を持たない）
--
-- NULL を許すのは、上の3種と**移行前からある分類なしの行**のためです。
-- NOT NULL にすると既存データに嘘の値を埋めることになります。
-- 新しく作る A系の案件では**画面とサーバーの両方が必須**にします。

ALTER TABLE projects ADD COLUMN IF NOT EXISTS audience         TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_category TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_audience') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_audience
      CHECK (audience IS NULL OR audience IN ('with_audience', 'no_audience'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_project_category') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_project_category
      CHECK (project_category IS NULL OR project_category IN ('broadcast', 'recording', 'event'));
  END IF;
END $$;

COMMENT ON COLUMN projects.audience IS
  '客入れの有無。with_audience=有観客 / no_audience=無観客。GLS-B の案件は NULL';
COMMENT ON COLUMN projects.project_category IS
  '案件分類。broadcast=配信/生放送 / recording=収録 / event=イベント（会場のみ）。GLS-B の案件は NULL';

-- 既存データの移行。**すでに値が入っている行は触らない**（再実行しても壊れない）
UPDATE projects SET
  audience = CASE project_type
    WHEN 'hybrid_event'   THEN 'with_audience'
    WHEN 'offline_event'  THEN 'with_audience'
    WHEN 'live_broadcast' THEN 'no_audience'
    WHEN 'recording'      THEN 'no_audience'
  END,
  project_category = CASE project_type
    WHEN 'hybrid_event'   THEN 'broadcast'
    WHEN 'live_broadcast' THEN 'broadcast'
    WHEN 'recording'      THEN 'recording'
    WHEN 'offline_event'  THEN 'event'
  END
WHERE audience IS NULL
  AND project_category IS NULL
  AND project_type IN ('hybrid_event', 'offline_event', 'live_broadcast', 'recording');

-- 一覧の絞り込み（客入れ別・分類別）で使う
CREATE INDEX IF NOT EXISTS idx_projects_classification
  ON projects(audience, project_category) WHERE deleted_at IS NULL;

-- ── 標準工程テンプレートの「この型を使う案件の種類」も2段の組み合わせに置き換える ──
--
-- `project_types` は旧 `project_type` の値を入れる配列でした。**空 = どの種類でも使える**
-- という決めはそのままで、入っている値だけを `客入れ:分類` の鍵に読み替えます。
-- 出荷時の型（`flow-standard`）は空なので影響を受けませんが、
-- 運用で作られた型があると**移行しないと1つも当たらなくなります**（黙って
-- 「どの案件にも出てこない型」になり、気づけません）。
UPDATE project_flow_templates
SET project_types = ARRAY(
  SELECT DISTINCT k FROM unnest(project_types) AS t(v),
  LATERAL (SELECT CASE t.v
    WHEN 'hybrid_event'   THEN 'with_audience:broadcast'
    WHEN 'offline_event'  THEN 'with_audience:event'
    WHEN 'live_broadcast' THEN 'no_audience:broadcast'
    WHEN 'recording'      THEN 'no_audience:recording'
    ELSE NULL
  END) AS m(k)
  WHERE k IS NOT NULL
)
WHERE array_length(project_types, 1) > 0
  -- 2回流しても壊れないように、旧い値が残っているものだけ
  AND EXISTS (
    SELECT 1 FROM unnest(project_types) AS t(v)
    WHERE t.v IN ('hybrid_event', 'offline_event', 'live_broadcast', 'recording',
                  'gmo_project', 'consulting', 'other')
  );

COMMENT ON COLUMN project_flow_templates.project_types IS
  'この型を使う案件の分類。「客入れ:分類」の鍵（例 with_audience:broadcast）。空 = どの分類でも使える';

-- ── GMOグループ会社フラグ（リード経路を「グループ案件」に固定するため）────────
--
-- **社名の文字列一致では判定しません。** 社名は変わりますし、GMO を含む社外の
-- 会社を誤判定します（指示書 第3章）。取引先マスターの持ち物として明示的に持たせ、
-- 案件作成の画面はこのフラグだけを見ます。
--
-- `companies`（統合取引先）ではなく `customers` に持たせたのは、案件が
-- `customer_id → customers` を直接見ており、`companies` との紐付け
-- （`customers.company_id`）が nullable で**未リンクの取引先があると判定が空振りする**ためです。
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_gmo_group BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN customers.is_gmo_group IS
  'GMOインターネットグループのグループ会社か。真のとき案件作成のリード経路は「グループ案件」に固定される';

-- リード経路に `group`（グループ案件）を足す。
-- **画面の固定表示だけにして値を持たせない**という手もありますが、それだと
-- あとから「グループ案件が何件あったか」を数えるときに取引先マスターの
-- **現在の**フラグで数えることになり、案件を取った当時の姿と食い違います。
DO $$
BEGIN
  ALTER TABLE projects DROP CONSTRAINT IF EXISTS chk_projects_intake_channel;
  ALTER TABLE projects ADD CONSTRAINT chk_projects_intake_channel
    CHECK (intake_channel IS NULL
           OR intake_channel IN ('mail', 'phone', 'meeting', 'web', 'referral', 'group', 'other'));
END $$;

COMMENT ON COLUMN projects.intake_channel IS
  'リード経路 mail/phone/meeting/web/referral/group/other。group はお客様がグループ会社のとき自動で入る';
