-- ============================================================
-- 308: 技術人員の「会社」を、案件管理の取引先（companies）そのものにする
--
-- 設計: docs/design/v4/tech-docs.md §13-5（2026-09-23 ご判断:
--   「技術人員の会社は、案件管理の取引先 companies をそのまま使う」）。
-- migration 305 で自前に持っていた qsheet_tech_companies をやめ、
--   - qsheet_tech_persons.company_id   → companies(id)（新しい列）
--   - qsheet_tech_staff_rows.company_id → companies(id)（参照先を付け替え）
-- にする。qsheet_tech_persons.tech_company_id と qsheet_tech_companies は消す。
--
-- 会社の移し方（qsheet_tech_companies の1行ごと）:
--   1. 任意参照 company_id が生きた companies を指していれば、それを使う
--   2. 無ければ、削除されていない companies を**名前の完全一致**で探す（古い順に1件）
--   3. それも無ければ、companies に**仕入先**（is_vendor=TRUE・is_customer=FALSE）として足す
--      （short_name・note を写す。is_gmo_group は社名から見立てる——
--       server/src/shared/services/gmo-group.ts と同じく全角の ＧＭＯ も拾う）
-- ⚠️ 一致した既存の companies 行は**書き換えない**（案件管理の持ち物。印も短い名前も触らない）。
-- ⚠️ 空の DB（技術人員が1人もいない）でも、2回流しても壊れないように書く
--    （qsheet_tech_companies が既に無ければ移す段は飛ばす）。
-- ⚠️ 参照先を変える前に古い FK を外す（migration 200/201 の教訓: 制約が古い表を
--    指したまま id を書き換えると、その場で違反して migration 全体が止まる）。
-- ============================================================

-- ── 1. 人に companies への列を足す ─────────────────────────────
ALTER TABLE qsheet_tech_persons ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);

-- ── 2. 旧会社 id → companies.id の対応表（この取引の中だけ） ───────
CREATE TEMP TABLE IF NOT EXISTS _m308_tech_company_map (
  tech_company_id TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  r   RECORD;
  cid TEXT;
BEGIN
  IF to_regclass('qsheet_tech_companies') IS NULL THEN
    RETURN; -- 既に移し終えた DB
  END IF;

  -- 移すのは「生きている会社」と「人・資料の行から参照されている会社」だけ
  -- （消した会社を、消した人しか指していないなら取引先を増やさない）
  FOR r IN
    SELECT tc.*
    FROM qsheet_tech_companies tc
    WHERE tc.deleted_at IS NULL
       OR EXISTS (SELECT 1 FROM qsheet_tech_persons p
                   WHERE p.tech_company_id = tc.id AND p.deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM qsheet_tech_staff_rows s WHERE s.company_id = tc.id)
    ORDER BY tc.sort_order, tc.created_at, tc.id
  LOOP
    cid := NULL;

    IF r.company_id IS NOT NULL THEN
      SELECT co.id INTO cid FROM companies co
       WHERE co.id = r.company_id AND co.deleted_at IS NULL;
    END IF;

    IF cid IS NULL THEN
      SELECT co.id INTO cid FROM companies co
       WHERE co.name = r.name AND co.deleted_at IS NULL
       ORDER BY co.created_at, co.id
       LIMIT 1;
    END IF;

    IF cid IS NULL THEN
      cid := gen_random_uuid()::text;
      INSERT INTO companies (id, name, short_name, is_customer, is_vendor, is_gmo_group, notes,
                             created_at, updated_at)
      VALUES (cid, r.name, NULLIF(r.short_name, ''), FALSE, TRUE,
              upper(translate(r.name, 'ＧＭＯｇｍｏ', 'GMOgmo')) LIKE '%GMO%',
              NULLIF(r.note, ''), NOW(), NOW());
    END IF;

    INSERT INTO _m308_tech_company_map (tech_company_id, company_id) VALUES (r.id, cid)
    ON CONFLICT (tech_company_id) DO NOTHING;
  END LOOP;

  -- 人: 旧会社から companies へ（既に入っている人は触らない）
  UPDATE qsheet_tech_persons p
     SET company_id = m.company_id
    FROM _m308_tech_company_map m
   WHERE p.tech_company_id = m.tech_company_id
     AND p.company_id IS NULL;
END $$;

-- ── 3. 資料の行の company_id を companies へ付け替える ─────────────
-- ⚠️ 先に古い FK（qsheet_tech_companies 参照）を外す
ALTER TABLE qsheet_tech_staff_rows DROP CONSTRAINT IF EXISTS qsheet_tech_staff_rows_company_id_fkey;

UPDATE qsheet_tech_staff_rows s
   SET company_id = m.company_id
  FROM _m308_tech_company_map m
 WHERE s.company_id = m.tech_company_id;

-- 対応の取れない id は外す（表示に使う名前は company_name に写してあるので消えない・§5-2）
UPDATE qsheet_tech_staff_rows s
   SET company_id = NULL
 WHERE s.company_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = s.company_id);

ALTER TABLE qsheet_tech_staff_rows
  ADD CONSTRAINT qsheet_tech_staff_rows_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id);

-- ── 4. 旧い列・表を消す ───────────────────────────────────────
DROP INDEX IF EXISTS idx_qsheet_tech_persons_company;
ALTER TABLE qsheet_tech_persons DROP COLUMN IF EXISTS tech_company_id;
DROP TABLE IF EXISTS qsheet_tech_companies;

-- 会社ごとの人数（GET /techops/tech-companies の person_count）と絞り込みに使う
CREATE INDEX IF NOT EXISTS idx_qsheet_tech_persons_company_id
  ON qsheet_tech_persons(company_id) WHERE deleted_at IS NULL;
