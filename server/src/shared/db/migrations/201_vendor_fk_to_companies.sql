-- 仕入先系FKを vendors(id) から companies(id) へ張り替える（Phase 3-2b）
--
-- 対象は2つ: purchases.vendor_id（NOT NULL）/ sga_expenses.vendor_id（nullable）。
-- 顧客系（migration 200・Phase 3-2a）と同じ考え方（方針A・一気に切り替える）。
--
-- ⚠️ これも「イメージだけ差し替える」ロールバックが使えなくなる変更（migration 200 で
-- 追記した docs/deploy-pipeline.md の注意がそのまま適用される。本番を戻すときは
-- 「Releases のタグで Deploy ワークフローを再実行」だけを使う）。
--
-- 安全のための下ごしらえ: migration 195 は deleted_at IS NULL の vendors だけ
-- companies へ埋め戻した。論理削除済みで company_id が無い行が残っていると、
-- NOT NULL の purchases.vendor_id で変換できずに移行が失敗するので、
-- deleted_at を問わず埋め戻す（customers と同じ理由・migration 200 を参照）。

DO $$
DECLARE
  r   RECORD;
  cid TEXT;
BEGIN
  FOR r IN SELECT * FROM vendors WHERE company_id IS NULL ORDER BY created_at LOOP
    cid := gen_random_uuid()::text;
    INSERT INTO companies (
      id, name, contact_name, email, phone, address,
      vendor_type, invoice_registration_number,
      is_vendor, notes, deleted_at,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      cid, r.name, r.contact_name, r.email, r.phone, r.address,
      r.vendor_type, r.invoice_registration_number,
      TRUE, r.notes, r.deleted_at,
      r.created_at, r.updated_at, r.created_by, r.updated_by
    );
    UPDATE vendors SET company_id = cid WHERE id = r.id;
  END LOOP;
END $$;

-- 既にリンク済みの companies 行を vendors の現在値で上書きする
-- （migration 200 の customers 側と同じ理由・PR #199 P2 の2巡目の教訓を先取りする）。
--
-- vendors はいまも基本情報の書き込み先（正）なので、その値で上書きする。
-- これ以降は一覧・詳細・Excel・検索・MCP が companies を正として読むので
-- （このファイルの後半・vendors.routes.ts 等）、古いスナップショットのほうが
-- 画面に出てしまうことを防ぐ。
UPDATE companies co SET
  name = v.name, contact_name = v.contact_name, email = v.email, phone = v.phone,
  address = v.address, vendor_type = v.vendor_type,
  invoice_registration_number = v.invoice_registration_number, notes = v.notes,
  updated_at = NOW()
FROM vendors v
WHERE v.company_id = co.id AND v.deleted_at IS NULL AND co.deleted_at IS NULL
  AND (co.name IS DISTINCT FROM v.name OR co.contact_name IS DISTINCT FROM v.contact_name
       OR co.email IS DISTINCT FROM v.email OR co.phone IS DISTINCT FROM v.phone
       OR co.address IS DISTINCT FROM v.address OR co.vendor_type IS DISTINCT FROM v.vendor_type
       OR co.invoice_registration_number IS DISTINCT FROM v.invoice_registration_number
       OR co.notes IS DISTINCT FROM v.notes);

-- ⚠️ **値を書き換える前に、古い FK（vendors(id) 参照）を先に外す**
-- （migration 200 の PR #199 P1 の教訓）。データが入っている実DBでは、制約が
-- vendors(id) を指したままだと、下の UPDATE が vendor_id を vendors.id と
-- 一致しない companies.id に書き換えた瞬間に違反し、この migration 全体が
-- ロールバックする（空の検証DBでは vendors.id と companies.id が作成順で
-- 偶然一致することがあり、それが隠れる）。
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_vendor_id_fkey;
ALTER TABLE sga_expenses DROP CONSTRAINT IF EXISTS sga_expenses_vendor_id_fkey;

-- 値の付け替え（vendor_id はまだ vendors.id。それを company_id に書き換える）
UPDATE purchases pu SET vendor_id = v.company_id
  FROM vendors v WHERE v.id = pu.vendor_id AND v.company_id IS NOT NULL;
UPDATE sga_expenses s SET vendor_id = v.company_id
  FROM vendors v WHERE v.id = s.vendor_id AND v.company_id IS NOT NULL;

-- FK の向き先を companies に変える
ALTER TABLE purchases ADD CONSTRAINT purchases_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES companies(id);
ALTER TABLE sga_expenses ADD CONSTRAINT sga_expenses_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES companies(id);

-- vendors テーブル自身は消さない（vendors.id は財務の仕入先タブが持つ
-- 仕入先固有の欄・支払条件の例外の識別子としてそのまま残る。読み書きの経路を
-- サーバー側で companies へ切り替えるのは同じPR内で実施。vendors テーブルの
-- 完全な削除は Phase 3-3、互換のためのリリースを1回挟んでから）
