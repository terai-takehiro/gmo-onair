/**
 * 会社（取引先）の登録は必ずここを通す。
 *
 * ── なにを直しているか ──────────────────────────────────────
 *
 * `companies` は「顧客・仕入先・販管費支払先」を束ねる唯一の正のマスター
 * （migration 061）で、取引先マスター画面（`/sales/companies`）から作ると
 * `is_customer`/`is_vendor` に応じて `customers`/`vendors` へ自動でミラー行を
 * 作る作りになっている。
 *
 * ところが **`customers`・`vendors` に直接 INSERT する道が10か所近く残っていた**
 * （顧客一覧・財務の仕入先タブ・Excel取込・決算取込・内覧会予約・投入口・MCP・シード）。
 * これらは `companies` を経由しないので、**取引先マスターに対応行の無い
 * 「孤立した顧客／仕入先」を作り続けていた**（2026-08 調査）。
 *
 * ここに一本化し、全ての登録経路が `companies` にも同じ会社の行を作るようにする。
 * **`customers`/`vendors` の id はそのまま使い続けられる** — 既存の全FK
 * （`projects.customer_id` / `purchases.vendor_id` 等）は customers/vendors の id を
 * 指しているので、呼び出し側のコードは変えずに済む（Phase 3 で companies.id への
 * 直接参照に寄せるまでの橋渡し）。
 */
import { v4 as uuidv4 } from 'uuid';
import { execute as poolExecute } from '../db/connection';
import { looksLikeGmoGroup } from './gmo-group';

/** `?` プレースホルダで SQL を投げる関数の型。既定は `shared/db/connection` の `execute`。 */
export type Exec = (sql: string, params: unknown[]) => Promise<unknown>;

const defaultExec: Exec = (sql, params) => poolExecute(sql, params);

/**
 * トランザクション中の生 pg client（`$1` プレースホルダ）を、この service が使う
 * `?` 形式の呼び出しに橋渡しする。Excel取込・決算取込のように `withTransaction` /
 * 生の `PoolClient` を持っている呼び出し元はこれを通して渡す。
 */
export function execFromPgClient(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Exec {
  return (sql, params) => {
    let i = 0;
    const converted = sql.replace(/\?/g, () => `$${++i}`);
    return client.query(converted, params);
  };
}

export interface CompanyDirectoryFields {
  name: string;
  short_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  vendor_type?: string | null;
  invoice_registration_number?: string | null;
  /** 渡さなければ社名から見立てる（`looksLikeGmoGroup`）。既存行の上書きにはこの関数を使わない */
  is_gmo_group?: boolean;
}

/**
 * 顧客を1件作る。**`companies`（is_customer=TRUE）にも同じ会社の行を作って紐づける。**
 * 戻り値は `customers.id`（呼び出し側は今までどおりこの id を使う）。
 */
export async function createCustomerRecord(
  fields: CompanyDirectoryFields,
  userId: string | null,
  exec: Exec = defaultExec,
): Promise<string> {
  const groupFlag = fields.is_gmo_group === undefined ? looksLikeGmoGroup(fields.name) : fields.is_gmo_group;

  const companyId = uuidv4();
  await exec(
    `INSERT INTO companies (id, name, short_name, contact_name, email, phone, address, notes,
       is_customer, is_gmo_group, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
    [companyId, fields.name, fields.short_name || null, fields.contact_name || null, fields.email || null,
     fields.phone || null, fields.address || null, fields.notes || null, groupFlag, userId],
  );

  const customerId = uuidv4();
  await exec(
    `INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes,
       is_gmo_group, company_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, fields.name, fields.short_name || null, fields.contact_name || null, fields.email || null,
     fields.phone || null, fields.address || null, fields.notes || null, groupFlag, companyId, userId],
  );
  return customerId;
}

/**
 * 仕入先を1件作る。**`companies`（is_vendor=TRUE）にも同じ会社の行を作って紐づける。**
 * 戻り値は `vendors.id`。
 */
export async function createVendorRecord(
  fields: CompanyDirectoryFields,
  userId: string | null,
  exec: Exec = defaultExec,
): Promise<string> {
  // 仕入先も GMO グループの相手はいる（`companies` は顧客・仕入先を束ねる1つの表なので、
  // ここも空のまま残さず社名から見立てる。`shared/tests/gmoGroup.test.ts` が
  // `INSERT INTO companies` すべてに is_gmo_group があることを固定している）
  const groupFlag = fields.is_gmo_group === undefined ? looksLikeGmoGroup(fields.name) : fields.is_gmo_group;

  const companyId = uuidv4();
  await exec(
    `INSERT INTO companies (id, name, contact_name, email, phone, address, notes,
       vendor_type, invoice_registration_number, is_vendor, is_gmo_group, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
    [companyId, fields.name, fields.contact_name || null, fields.email || null, fields.phone || null,
     fields.address || null, fields.notes || null, fields.vendor_type || null,
     fields.invoice_registration_number || null, groupFlag, userId],
  );

  const vendorId = uuidv4();
  await exec(
    `INSERT INTO vendors (id, name, contact_name, email, phone, address, vendor_type,
       invoice_registration_number, notes, company_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [vendorId, fields.name, fields.contact_name || null, fields.email || null, fields.phone || null,
     fields.address || null, fields.vendor_type || null, fields.invoice_registration_number || null,
     fields.notes || null, companyId, userId],
  );
  return vendorId;
}

/**
 * 顧客を直す画面（顧客一覧）から名前・連絡先を直したとき、紐づいた `companies` 行にも
 * 同じ値を写す。**`is_gmo_group` だけでなく基本情報も揃える** — ここを省くと
 * 「顧客一覧で社名を直したのに取引先マスターは古い名前のまま」という食い違いが起きる
 * （取引先マスター→顧客の向きは `companies.routes.ts` の PUT が既に持っている）。
 * `company_id` が無い顧客（companies を経由せず作られた古い行）は何もしない。
 */
export async function syncCompanyFromCustomer(
  customerId: string,
  fields: Pick<CompanyDirectoryFields, 'name' | 'short_name' | 'contact_name' | 'email' | 'phone' | 'address' | 'notes'> & { is_gmo_group: boolean },
  userId: string | null,
  exec: Exec = defaultExec,
): Promise<void> {
  await exec(
    `UPDATE companies SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?, notes=?,
       is_gmo_group=?, updated_at=NOW(), updated_by=?
     WHERE id = (SELECT company_id FROM customers WHERE id = ?) AND deleted_at IS NULL`,
    [fields.name, fields.short_name || null, fields.contact_name || null, fields.email || null,
     fields.phone || null, fields.address || null, fields.notes || null, fields.is_gmo_group,
     userId, customerId],
  );
}

/**
 * 仕入先を直す画面（財務の取引先タブ）から名前・連絡先を直したとき、紐づいた
 * `companies` 行にも同じ値を写す（`syncCompanyFromCustomer` の仕入先版）。
 */
export async function syncCompanyFromVendor(
  vendorId: string,
  fields: Pick<CompanyDirectoryFields, 'name' | 'contact_name' | 'email' | 'phone' | 'address' | 'vendor_type' | 'invoice_registration_number' | 'notes'>,
  userId: string | null,
  exec: Exec = defaultExec,
): Promise<void> {
  await exec(
    `UPDATE companies SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?,
       invoice_registration_number=?, notes=?, updated_at=NOW(), updated_by=?
     WHERE id = (SELECT company_id FROM vendors WHERE id = ?) AND deleted_at IS NULL`,
    [fields.name, fields.contact_name || null, fields.email || null, fields.phone || null,
     fields.address || null, fields.vendor_type || null, fields.invoice_registration_number || null,
     fields.notes || null, userId, vendorId],
  );
}
