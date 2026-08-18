-- 孤立した顧客・仕入先を取引先マスター (companies) へ埋め戻す
--
-- ── 何を直すか ────────────────────────────────────────────────
--
-- migration 061 で `companies` を「顧客・仕入先を束ねる唯一の正のマスター」として
-- 作ったが、`customers`/`vendors` へ直接 INSERT する道（顧客一覧・財務の仕入先タブ・
-- Excel取込・決算取込・内覧会予約・投入口・MCP・シード）が2026-08まで
-- companies を経由せずに残っていた。そのため `company_id IS NULL` の
-- 「取引先マスターに対応行の無い顧客・仕入先」が実データに存在する。
--
-- サーバー側（company-directory.service.ts）は今後すべての登録経路で
-- companies にも同時に行を作るようにしたが、**この移行より前に作られた既存行**は
-- 埋め戻さないと直らない。
--
-- ── 方針 ────────────────────────────────────────────────────────
--
-- 既存の customers/vendors 1行につき companies を1行作って company_id で紐づける。
-- 名前で既存の companies を探して統合する（統合は人が判断すべき）ことはしない —
-- 別の相手を誤って1つに統合すると、以後どちらの取引実績か分からなくなる。

DO $$
DECLARE
  r   RECORD;
  cid TEXT;
BEGIN
  FOR r IN
    SELECT * FROM customers
    WHERE deleted_at IS NULL AND company_id IS NULL
    ORDER BY created_at
  LOOP
    cid := gen_random_uuid()::text;
    INSERT INTO companies (
      id, name, short_name, contact_name, email, phone, address,
      is_customer, is_gmo_group, notes, created_at, updated_at, created_by, updated_by
    ) VALUES (
      cid, r.name, r.short_name, r.contact_name, r.email, r.phone, r.address,
      TRUE, COALESCE(r.is_gmo_group, FALSE), r.notes, r.created_at, r.updated_at, r.created_by, r.updated_by
    );
    UPDATE customers SET company_id = cid WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT * FROM vendors
    WHERE deleted_at IS NULL AND company_id IS NULL
    ORDER BY created_at
  LOOP
    cid := gen_random_uuid()::text;
    INSERT INTO companies (
      id, name, contact_name, email, phone, address,
      is_vendor, vendor_type, invoice_registration_number, notes,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      cid, r.name, r.contact_name, r.email, r.phone, r.address,
      TRUE, r.vendor_type, r.invoice_registration_number, r.notes,
      r.created_at, r.updated_at, r.created_by, r.updated_by
    );
    UPDATE vendors SET company_id = cid WHERE id = r.id;
  END LOOP;
END $$;
