-- 顧客系FKを customers(id) から companies(id) へ張り替える（Phase 3-2a）
--
-- 対象は5つ: projects.customer_id / revenues.customer_id /
-- activity_logs.customer_id / estimates.customer_id / gpm_projects.customer_id。
--
-- ⚠️ これは「イメージだけ差し替える」ロールバックも「Releases のタグで
-- Deploy ワークフローを再実行」も、**どちらも単独では使えなくなる変更**（方針A）。
-- customer_id の値そのものを書き換えるため、コード（イメージ・checkout）だけ戻しても
-- DB は新しい値（companies.id）のままで、古いコードが期待する customers.id とは
-- 食い違う。このリリース以降、本番を戻すときはコードを戻すことに加えて DB も
-- 同時点まで復元する必要がある（`docs/ops/db-backup-restore.md`。
-- 詳細は `docs/deploy-pipeline.md` に追記済み・レビュー指摘・PR #199 P1 / #200 P1）。
--
-- 安全のための下ごしらえ: migration 195 は deleted_at IS NULL の customers/vendors
-- だけ companies へ埋め戻した。論理削除済みで company_id が無い行が残っていると、
-- NOT NULL の列（projects/revenues）で変換できずに移行が失敗するので、
-- deleted_at を問わず埋め戻す。

-- ⚠️ 自社構築の「お客様」（migration 179・`cust-self-gms`）だけ先に固定IDで紐づける。
-- `gpm.service.ts` の `SELF_CUSTOMER_ID` が新規の自社構築プロジェクトに書き込む値は
-- 固定文字列でなければならない（下の汎用バックフィルは実行順に依存する uuid を振るため、
-- コード側で先読みできない）。
--
-- ⚠️ **`WHERE company_id IS NULL` では効かない**（実DBで発見）。migration 195
-- （deleted_at IS NULL の孤立顧客の埋め戻し）はこの migration より先に必ず走っており、
-- `cust-self-gms` にも既にランダムな uuid の company_id を振ってしまっている。
-- そのため無条件で固定IDへ上書きし、195 が作った孤立 companies 行（他の
-- customers/vendors から参照されていなければ）は掃除する。
DO $$
DECLARE old_company_id TEXT;
BEGIN
  INSERT INTO companies (id, name, short_name, is_customer, is_gmo_group, notes)
  VALUES ('comp-self-gms', '自社（GMOグローバルスタジオ）', '自社', TRUE, TRUE,
          '自社構築のプロジェクト（GLS-B）が使う行。請求先ではない')
  ON CONFLICT (id) DO NOTHING;

  SELECT company_id INTO old_company_id FROM customers WHERE id = 'cust-self-gms';
  UPDATE customers SET company_id = 'comp-self-gms' WHERE id = 'cust-self-gms';

  IF old_company_id IS NOT NULL AND old_company_id <> 'comp-self-gms' THEN
    DELETE FROM companies co WHERE co.id = old_company_id
      AND NOT EXISTS (SELECT 1 FROM customers cu WHERE cu.company_id = co.id)
      AND NOT EXISTS (SELECT 1 FROM vendors v WHERE v.company_id = co.id);
  END IF;
END $$;

DO $$
DECLARE
  r   RECORD;
  cid TEXT;
BEGIN
  FOR r IN SELECT * FROM customers WHERE company_id IS NULL ORDER BY created_at LOOP
    cid := gen_random_uuid()::text;
    INSERT INTO companies (
      id, name, short_name, contact_name, email, phone, address,
      is_customer, is_gmo_group, notes, deleted_at,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      cid, r.name, r.short_name, r.contact_name, r.email, r.phone, r.address,
      TRUE, COALESCE(r.is_gmo_group, FALSE), r.notes, r.deleted_at,
      r.created_at, r.updated_at, r.created_by, r.updated_by
    );
    UPDATE customers SET company_id = cid WHERE id = r.id;
  END LOOP;
END $$;

-- 既にリンク済みの companies 行を customers の現在値で上書きする
-- （レビュー指摘・PR #199 P2 の2巡目）。
--
-- migration 195 は company_id IS NULL の行だけ companies を作って埋め戻す。
-- migration 061 で companies を作ってから `company-directory.service.ts` の
-- 双方向同期（`syncCompanyFromCustomer`）が入るまでの間に customers 側だけ
-- 名前・連絡先を直した行があると、companies 側はそのときのスナップショットの
-- まま古くなる。これ以降は一覧・詳細・PDF・Excel・検索が `companies` を
-- 正として読むので（このファイルの後半・customers.routes.ts 等）、
-- 古いスナップショットのほうが画面に出てしまう。
-- customers はいまも基本情報の書き込み先（正）なので、その値で上書きする。
UPDATE companies co SET
  name = cu.name, short_name = cu.short_name, contact_name = cu.contact_name,
  email = cu.email, phone = cu.phone, address = cu.address, notes = cu.notes,
  is_gmo_group = COALESCE(cu.is_gmo_group, co.is_gmo_group), updated_at = NOW()
FROM customers cu
WHERE cu.company_id = co.id AND cu.deleted_at IS NULL AND co.deleted_at IS NULL
  AND (co.name IS DISTINCT FROM cu.name OR co.short_name IS DISTINCT FROM cu.short_name
       OR co.contact_name IS DISTINCT FROM cu.contact_name OR co.email IS DISTINCT FROM cu.email
       OR co.phone IS DISTINCT FROM cu.phone OR co.address IS DISTINCT FROM cu.address
       OR co.notes IS DISTINCT FROM cu.notes);

-- ⚠️ **値を書き換える前に、古い FK（customers(id) 参照）を先に外す**
-- （レビュー指摘・PR #199 P1）。データが入っている実DBでは、制約が
-- customers(id) を指したままだと、下の UPDATE が customer_id を
-- customers.id と一致しない companies.id に書き換えた瞬間に違反し、
-- migration 200 全体がロールバックする（空の検証DBでは customers.id と
-- companies.id が作成順で偶然一致することがあり、それが隠れていた）。
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_customer_id_fkey;
ALTER TABLE revenues DROP CONSTRAINT IF EXISTS revenues_customer_id_fkey;
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_customer_id_fkey;
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_customer_id_fkey;
ALTER TABLE gpm_projects DROP CONSTRAINT IF EXISTS gpm_projects_customer_id_fkey;

-- 値の付け替え（customer_id はまだ customers.id。それを company_id に書き換える）
UPDATE projects p SET customer_id = c.company_id
  FROM customers c WHERE c.id = p.customer_id AND c.company_id IS NOT NULL;
UPDATE revenues r SET customer_id = c.company_id
  FROM customers c WHERE c.id = r.customer_id AND c.company_id IS NOT NULL;
UPDATE activity_logs a SET customer_id = c.company_id
  FROM customers c WHERE c.id = a.customer_id AND c.company_id IS NOT NULL;
UPDATE estimates e SET customer_id = c.company_id
  FROM customers c WHERE c.id = e.customer_id AND c.company_id IS NOT NULL;
UPDATE gpm_projects g SET customer_id = c.company_id
  FROM customers c WHERE c.id = g.customer_id AND c.company_id IS NOT NULL;

-- FK の向き先を companies に変える
ALTER TABLE projects ADD CONSTRAINT projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE revenues ADD CONSTRAINT revenues_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE estimates ADD CONSTRAINT estimates_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE gpm_projects ADD CONSTRAINT gpm_projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);

-- customers テーブル自身は消さない（customers.id は顧客360°ビューの識別子として
-- そのまま残す。読み書きの経路をサーバー側で companies へ切り替えるのは同じPR内で実施。
-- customers テーブルの完全な削除は Phase 3-3、互換のためのリリースを1回挟んでから）
