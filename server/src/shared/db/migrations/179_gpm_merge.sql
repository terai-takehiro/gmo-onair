-- ============================================================
-- 179: プロジェクト管理を GLS-B に一本化する（migration A）
--
-- 決めの根拠は `docs/design/gpm-merge.md`。要点だけ再掲する。
--
-- ── なぜ 161 の決め①を差し替えるのか ────────────────────────
--
-- 161 は「**GPM のプロジェクトは案件ではない**」を前提に `gpm_projects` を
-- 別テーブルにした。ところが業務側の定義は
--
--     案件管理 = GLS-A  ／  プロジェクト管理 = GLS-B
--
-- で、**GPM のプロジェクトは GLS-B 案件そのもの**だった。案件一覧・財務の集計・
-- 決算取込・週報が拾うのは汚染ではなく**正しい動作**になるので、前提が消える。
--
-- ── 寄せる向きは外部キーの数で決めた（実測）──────────────────
--
--   projects(id)     を参照する外部キー   30 本 (うち NOT NULL 16)
--   gpm_projects(id) を参照する外部キー    4 本 (うち NOT NULL  3)
--
-- 逆向き（GLS-B を gpm_projects へ移す）にすると、その案件の売上・仕入・請求・
-- 見積・回・タスク・議事録が 16 本の NOT NULL に弾かれてぶら下がれなくなる。
-- **ビジネス案件の月次請求が丸ごと成立しなくなる**のが一番大きい。
-- 逆に寄せれば付け替えは 4 本で済む。利用者から見た結果は同じ（表名は画面に出ない）。
--
-- ── この migration がやらないこと ───────────────────────────
--
-- **`gpm_projects` を落とさない。** 落とすのは migration B に分ける。
-- 落としてから「やはり要る」となったときに戻せるようにするため。
--
-- ── 行が 0 でも N でも同じ手順で通る ────────────────────────
--
-- 本番・検証とも `gpm_projects` は 0 行の見込み（プロジェクトはまだ作られていない）
-- だが、**行があっても運べる形**で書いてある。運べなかった行が 1 つでも残ったら
-- `RAISE EXCEPTION` で止める（黙って消さない。migration は 1 本ずつ
-- トランザクションで走るので、止まれば何も変わらない）。
-- ============================================================

-- ── ① `projects` に足りない 5 列を足す ──────────────────────
-- 20 列のうち 15 列は既にあるものに乗る（`box_url_*` / `notes` / `customer_id` /
-- `pm_user_id`→`assigned_to` など）。足りないのはこの 5 つだけ。

ALTER TABLE projects ADD COLUMN IF NOT EXISTS gpm_kind        TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_company      TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS started_on      DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ends_on         DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gpm_template_id TEXT REFERENCES gpm_templates(id);

COMMENT ON COLUMN projects.gpm_kind IS
  'GLS-B のプロジェクトの種類 self_build=自社構築 / group_order=グループ受託。GLS-A では NULL';
COMMENT ON COLUMN projects.pm_company IS
  'PM 会社。自社が PM のときは NULL';
COMMENT ON COLUMN projects.started_on IS
  '工程の開始日。**event_start とは別**（あちらは本番の日で TEXT 型・工程テンプレートの逆算が見る）';
COMMENT ON COLUMN projects.ends_on IS
  '工程の完了予定日。**event_end とは別**';
COMMENT ON COLUMN projects.gpm_template_id IS
  '工事・構築の標準工程テンプレート。放送案件の flow_template_id とは**排他**';

DO $$
BEGIN
  -- **`gpm_kind` は GLS-B にしか入らない。** GLS-A に入ると、案件管理の画面が
  -- 知らない列を持つ行を描くことになる
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_gpm_kind') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_gpm_kind
      CHECK (gpm_kind IS NULL OR (gpm_kind IN ('self_build', 'group_order') AND gls_category = 'B'));
  END IF;

  -- **工程の型は 2 系統あるが、1 つの案件に入るのは片方だけ。**
  -- 両方入ると同じ案件に 2 組のタスクができ、どちらを消すか分からなくなる
  -- （`flow_applied_at` が二度入れを止めているのと同じ理由）
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_one_template') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_one_template
      CHECK (flow_template_id IS NULL OR gpm_template_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_gpm_template
  ON projects (gpm_template_id) WHERE gpm_template_id IS NOT NULL;

-- ── ② 自社構築の「お客様」を 1 行つくる ─────────────────────
--
-- `projects.customer_id` は **NOT NULL** で、自社構築には相手がいない。
-- NOT NULL を外すほうは採らない — `projects` を読む 102 か所のほとんどが
-- `customers` を内部結合しており、NULL を許すと**そこから GLS-B が黙って消える**
-- （エラーが出ないので気づけない）。

INSERT INTO customers (id, name, short_name, notes)
VALUES ('cust-self-gms', '自社（GMOグローバルスタジオ）', '自社',
        '自社構築のプロジェクト（GLS-B）が使う行。請求先ではない')
ON CONFLICT (id) DO NOTHING;

-- ── ③ `gpm_projects` の行を `projects` へ取り込む ───────────
--
-- 結び先の案件をまだ持たない（`project_id IS NULL`）プロジェクトには、
-- **同じ id で** 案件の行を作る。id を引き継ぐので、子テーブルの付け替えが
-- 「gpm_projects を1回引く」だけで済む。

INSERT INTO projects (
  id, code, name, customer_id, stage, gls_category, assigned_to, customer_type,
  notes, box_url_internal, box_url_external,
  gpm_kind, pm_company, started_on, ends_on, gpm_template_id,
  created_by, updated_by, created_at, updated_at, deleted_at
)
SELECT
  gp.id,
  -- `code` は一意。GPM から来たものだと分かる形にする
  'GPM-' || left(replace(gp.id, '-', ''), 10),
  gp.name,
  COALESCE(gp.customer_id, 'cust-self-gms'),
  -- **`status` を `stage` に素直に写さない**（決め③）。`gpm_projects` にある行は
  -- 「やると決まって工程を切ったもの」なので受注済みから始める。
  -- `planning` / `onhold` も `a_won` に倒れるが、**倒したことは分かる**
  -- （`gpm_projects.status` は落とさずに残るので突き合わせられる）
  CASE gp.status WHEN 'done' THEN 's_completed' ELSE 'a_won' END,
  'B',
  -- `assigned_to` は users への外部キー。PM → 作った人 → いちばん古い利用者 の順に落とす
  COALESCE(
    gp.pm_user_id,
    (SELECT u.id FROM users u WHERE u.id = gp.created_by),
    (SELECT u.id FROM users u WHERE u.deleted_at IS NULL ORDER BY u.created_at LIMIT 1)
  ),
  'internal',
  gp.notes, gp.box_url_internal, gp.box_url_external,
  gp.kind, gp.pm_company, gp.started_on, gp.ends_on, gp.template_id,
  gp.created_by, gp.updated_by, gp.created_at, gp.updated_at, gp.deleted_at
FROM gpm_projects gp
WHERE gp.project_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = gp.id);

UPDATE gpm_projects SET project_id = id WHERE project_id IS NULL;

-- **倒した行を黙って通さない。** `planning` / `onhold` は「受注済み」ではないので、
-- どれを倒したかをログに出す（`gpm_projects.status` は残るので後から突き合わせられる）。
DO $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id, name, status FROM gpm_projects WHERE status IN ('planning', 'onhold') LOOP
    RAISE NOTICE '179: 「%」(%) は % でしたが、案件のステージは a_won（受注済）にしました。実態と違うなら画面から直してください', r.name, r.id, r.status;
    n := n + 1;
  END LOOP;
  IF n = 0 THEN
    RAISE NOTICE '179: ステージを倒したプロジェクトはありません';
  END IF;
END $$;

-- すでに案件に結んであったプロジェクトは、**その案件の側に工程の情報を移す**。
-- `gls_category` も 'B' に揃える（結んだ相手が A だったら、それは取り違え）。
UPDATE projects p
   SET gpm_kind        = gp.kind,
       pm_company      = gp.pm_company,
       started_on      = COALESCE(p.started_on, gp.started_on),
       ends_on         = COALESCE(p.ends_on, gp.ends_on),
       -- 放送案件の型が既に入っていたらそちらを残す（CHECK に弾かれるため）
       gpm_template_id = CASE WHEN p.flow_template_id IS NULL THEN gp.template_id ELSE NULL END,
       gls_category    = 'B',
       updated_at      = NOW()
  FROM gpm_projects gp
 WHERE gp.project_id = p.id
   AND p.id <> gp.id;

-- ── ④ 子テーブル 3 本の親を `project_id` に差し替える ───────
--
-- 中身は 0 行の見込みだが、行があれば `gpm_projects.project_id` 経由で運ぶ。
-- **運べなかった行が残ったら止める**（黙って消さない）。

-- 工程
ALTER TABLE gpm_phases ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
UPDATE gpm_phases ph SET project_id = gp.project_id
  FROM gpm_projects gp WHERE gp.id = ph.gpm_project_id AND ph.project_id IS NULL;

-- 未確認事項
ALTER TABLE gpm_open_items ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
UPDATE gpm_open_items oi SET project_id = gp.project_id
  FROM gpm_projects gp WHERE gp.id = oi.gpm_project_id AND oi.project_id IS NULL;

-- 体制
ALTER TABLE gpm_members ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
UPDATE gpm_members m SET project_id = gp.project_id
  FROM gpm_projects gp WHERE gp.id = m.gpm_project_id AND m.project_id IS NULL;

DO $$
DECLARE n integer;
BEGIN
  SELECT (SELECT COUNT(*) FROM gpm_phases     WHERE project_id IS NULL)
       + (SELECT COUNT(*) FROM gpm_open_items WHERE project_id IS NULL)
       + (SELECT COUNT(*) FROM gpm_members    WHERE project_id IS NULL)
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION
      '179: 親の見つからない GPM の子行が % 件あります。消さずに止めました。gpm_projects を確認してください', n;
  END IF;
END $$;

ALTER TABLE gpm_phases     ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE gpm_open_items ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE gpm_members    ALTER COLUMN project_id SET NOT NULL;

DROP INDEX IF EXISTS idx_gpm_phases_project;
DROP INDEX IF EXISTS idx_gpm_open_items_project;
DROP INDEX IF EXISTS idx_gpm_members_project;
DROP INDEX IF EXISTS idx_gpm_members_tier;

ALTER TABLE gpm_phases     DROP COLUMN IF EXISTS gpm_project_id;
ALTER TABLE gpm_open_items DROP COLUMN IF EXISTS gpm_project_id;
ALTER TABLE gpm_members    DROP COLUMN IF EXISTS gpm_project_id;

CREATE INDEX IF NOT EXISTS idx_gpm_phases_project     ON gpm_phases (project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_gpm_open_items_project ON gpm_open_items (project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gpm_members_project    ON gpm_members (project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_gpm_members_tier       ON gpm_members (project_id, tier, sort_order);

-- ── ⑤ GPM のタスクに `project_id` を入れる ──────────────────
--
-- 161 は「案件のタスク一覧に工事のタスクが混ざる」ことを避けるため
-- `project_id` を NULL のままにしていた。**GLS-B 案件のタスクなので、混ざるのが正しい**
-- （「自分のタスク」「期限超過」に出るべきもの）。案件管理の画面には
-- `gls_category = 'A'` の絞り込みで出なくなる。

UPDATE project_tasks t SET project_id = ph.project_id
  FROM gpm_phases ph WHERE ph.id = t.gpm_phase_id AND t.project_id IS NULL;

-- ── ⑥ 見積の行き先を 1 本にする ─────────────────────────────
--
-- 173 は `project_id`（案件）と `gpm_project_id`（プロジェクト）を CHECK で排他に
-- していた。行き先が 1 つになるので、排他する相手がいなくなる。

-- **CHECK を先に外す。** 「どちらか一方だけ」なので、
-- `gpm_project_id` が入ったまま `project_id` を埋めると**その UPDATE 自身が弾かれる**
-- （実データを入れて試して見つけた。空の DB では通ってしまう）。
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS chk_estimates_owner;

UPDATE estimates e SET project_id = gp.project_id
  FROM gpm_projects gp WHERE gp.id = e.gpm_project_id AND e.project_id IS NULL;

DO $$
DECLARE n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM estimates WHERE project_id IS NULL AND deleted_at IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '179: 行き先の無い見積が % 件あります。消さずに止めました', n;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_estimates_gpm;
ALTER TABLE estimates DROP COLUMN IF EXISTS gpm_project_id;

-- **NOT NULL に戻す。** 173 で外れたままだと「どこにも属さない見積」が作れる。
-- 消し済み（`deleted_at IS NOT NULL`）の行に NULL が残っていると通らないので、
-- そこだけは自社の案件に寄せずに**そのまま落ちる**ようにしてある（上の検査は
-- 生きている行だけを見る）。念のためここでも生きていない行を除いて確かめる。
DO $$
DECLARE n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM estimates WHERE project_id IS NULL;
  IF n = 0 THEN
    ALTER TABLE estimates ALTER COLUMN project_id SET NOT NULL;
  ELSE
    RAISE NOTICE '179: 消し済みの見積 % 件に行き先がないため、estimates.project_id は NULL 可のままにしました', n;
  END IF;
END $$;

-- `submit_to`（自社／依頼元／PM会社）は**残す**。GLS-A の見積では NULL のまま。
COMMENT ON COLUMN estimates.submit_to IS
  '提出先 self=自社 / client=依頼元 / pm=PM会社。GLS-B（プロジェクト）の見積だけが使う';
