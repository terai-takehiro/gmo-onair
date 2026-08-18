-- 顧客系FKを customers(id) から companies(id) へ張り替える（Phase 3-2a）
--
-- 対象は5つ: projects.customer_id / revenues.customer_id /
-- activity_logs.customer_id / estimates.customer_id / gpm_projects.customer_id。
--
-- ⚠️ これは「イメージだけ差し替える」ロールバックが使えなくなる変更（方針A）。
-- このリリース以降は、本番を戻すときは「Releases のタグでDeployワークフローを
-- 再実行」(DBも含めて丸ごと戻す) だけを使う（docs/deploy-pipeline.md に追記済み）。
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
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_customer_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE revenues DROP CONSTRAINT IF EXISTS revenues_customer_id_fkey;
ALTER TABLE revenues ADD CONSTRAINT revenues_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_customer_id_fkey;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_customer_id_fkey;
ALTER TABLE estimates ADD CONSTRAINT estimates_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE gpm_projects DROP CONSTRAINT IF EXISTS gpm_projects_customer_id_fkey;
ALTER TABLE gpm_projects ADD CONSTRAINT gpm_projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);

-- customers テーブル自身は消さない（customers.id は顧客360°ビューの識別子として
-- そのまま残す。読み書きの経路をサーバー側で companies へ切り替えるのは同じPR内で実施。
-- customers テーブルの完全な削除は Phase 3-3、互換のためのリリースを1回挟んでから）
