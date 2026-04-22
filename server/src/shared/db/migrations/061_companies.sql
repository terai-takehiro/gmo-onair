-- ========================================================
-- Migration 061: 取引先マスター統合
-- 既存テーブル (customers, vendors) への影響は
-- nullable FK 追加のみ。既存データ・既存機能は完全維持。
-- ========================================================

-- 1. 統合取引先テーブルを新規作成
CREATE TABLE IF NOT EXISTS companies (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  short_name                  TEXT,
  contact_name                TEXT,
  email                       TEXT,
  phone                       TEXT,
  address                     TEXT,
  -- 役割フラグ
  is_customer                 BOOLEAN NOT NULL DEFAULT FALSE,
  is_vendor                   BOOLEAN NOT NULL DEFAULT FALSE,
  -- 仕入先固有
  vendor_type                 TEXT,
  invoice_registration_number TEXT,
  notes                       TEXT,
  -- タイムスタンプ
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by  TEXT,
  updated_by  TEXT,
  deleted_at  TIMESTAMP
);

-- 2. customers に company_id を追加（nullable: 既存レコードに影響なし）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);

-- 3. vendors に company_id を追加（nullable: 既存レコードに影響なし）
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id);

-- 4. 既存 customers から companies を生成してリンク
--    同名でも別レコードとして扱う（後からユーザーが手動統合可能）
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
      is_customer, notes, created_at, updated_at, created_by, updated_by
    ) VALUES (
      cid, r.name, r.short_name, r.contact_name, r.email, r.phone, r.address,
      TRUE, r.notes, r.created_at, r.updated_at, r.created_by, r.updated_by
    );
    UPDATE customers SET company_id = cid WHERE id = r.id;
  END LOOP;
END $$;

-- 5. 既存 vendors から companies を生成してリンク
--    顧客と同名の企業があっても別レコード（手動統合で対応）
DO $$
DECLARE
  r   RECORD;
  cid TEXT;
BEGIN
  FOR r IN
    SELECT * FROM vendors
    WHERE deleted_at IS NULL AND company_id IS NULL
    ORDER BY created_at
  LOOP
    cid := gen_random_uuid()::text;
    INSERT INTO companies (
      id, name, contact_name, email, phone, address,
      is_vendor, vendor_type, invoice_registration_number,
      notes, created_at, updated_at, created_by, updated_by
    ) VALUES (
      cid, r.name, r.contact_name, r.email, r.phone, r.address,
      TRUE, r.vendor_type, r.invoice_registration_number,
      r.notes, r.created_at, r.updated_at, r.created_by, r.updated_by
    );
    UPDATE vendors SET company_id = cid WHERE id = r.id;
  END LOOP;
END $$;
