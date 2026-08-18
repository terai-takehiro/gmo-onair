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
import { execute as poolExecute, withTransaction, TxClient } from '../db/connection';
import { looksLikeGmoGroup } from './gmo-group';

/** `?` プレースホルダで SQL を投げる関数の型。既定は `shared/db/connection` の `execute`。 */
export type Exec = (sql: string, params: unknown[]) => Promise<unknown>;

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
 *
 * **`exec` を渡さない呼び出し（HTTP ルート・MCP・内覧会・xpoint 等）は
 * 内部で1つのトランザクションにまとめる**（レビュー指摘・PR #183 P2）。
 * 分けたままだと companies の INSERT が成功して customers の INSERT だけ失敗する
 * 余地があり、押し直すと孤立した companies 行が増える。
 * Excel取込・決算取込のように呼び出し元が**既に自分のトランザクションを持っている**
 * 場合は `exec` を渡す — ここでさらに `withTransaction` を挟むと入れ子 BEGIN になる。
 */
export async function createCustomerRecord(
  fields: CompanyDirectoryFields,
  userId: string | null,
  exec?: Exec,
): Promise<string> {
  if (exec) return createCustomerRecordImpl(fields, userId, exec);
  return withTransaction((tx) => createCustomerRecordImpl(fields, userId, execFromTx(tx)));
}

async function createCustomerRecordImpl(
  fields: CompanyDirectoryFields,
  userId: string | null,
  exec: Exec,
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
 * 戻り値は `vendors.id`。トランザクションの扱いは `createCustomerRecord` と同じ。
 */
export async function createVendorRecord(
  fields: CompanyDirectoryFields,
  userId: string | null,
  exec?: Exec,
): Promise<string> {
  if (exec) return createVendorRecordImpl(fields, userId, exec);
  return withTransaction((tx) => createVendorRecordImpl(fields, userId, execFromTx(tx)));
}

async function createVendorRecordImpl(
  fields: CompanyDirectoryFields,
  userId: string | null,
  exec: Exec,
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

/** `TxClient`（`?` 形式・`Promise<void>`）を `Exec`（`Promise<unknown>`）にそのまま渡すための橋渡し */
function execFromTx(tx: TxClient): Exec {
  return (sql, params) => tx.execute(sql, params);
}

/**
 * 顧客を直す画面（顧客一覧）から名前・連絡先を直したとき、紐づいた `companies` 行と
 * **その会社に紐づく仕入先（vendors）行**にも同じ値を写す。
 *
 * ⚠️ **仕入先側も更新する**（レビュー指摘・PR #183 P1）。1社が顧客と仕入先を
 * 両方兼ねているとき、片方の画面で直しても片方だけ最新になり、次にどちらかを
 * 保存したときに古い値で上書きしてしまう。`is_gmo_group` / `vendor_type` /
 * `invoice_registration_number` は顧客一覧が持たない値なので写さない
 * （customers/vendors 独自の値はそれぞれの画面の管轄のまま）。
 * `company_id` が無い顧客（companies を経由せず作られた古い行）は何もしない。
 */
export async function syncCompanyFromCustomer(
  customerId: string,
  fields: Pick<CompanyDirectoryFields, 'name' | 'short_name' | 'contact_name' | 'email' | 'phone' | 'address' | 'notes'> & { is_gmo_group: boolean },
  userId: string | null,
  exec: Exec = (sql, params) => poolExecute(sql, params),
): Promise<void> {
  await exec(
    `WITH updated_company AS (
       UPDATE companies SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?, notes=?,
         is_gmo_group=?, updated_at=NOW(), updated_by=?
       WHERE id = (SELECT company_id FROM customers WHERE id = ?) AND deleted_at IS NULL
       RETURNING id
     )
     UPDATE vendors SET name=?, contact_name=?, email=?, phone=?, address=?, notes=?,
       updated_at=NOW(), updated_by=?
     WHERE company_id IN (SELECT id FROM updated_company) AND deleted_at IS NULL`,
    [fields.name, fields.short_name || null, fields.contact_name || null, fields.email || null,
     fields.phone || null, fields.address || null, fields.notes || null, fields.is_gmo_group,
     userId, customerId,
     fields.name, fields.contact_name || null, fields.email || null, fields.phone || null,
     fields.address || null, fields.notes || null, userId],
  );
}

/**
 * 仕入先を直す画面（財務の取引先タブ）から名前・連絡先を直したとき、紐づいた
 * `companies` 行と**その会社に紐づく顧客（customers）行**にも同じ値を写す
 * （`syncCompanyFromCustomer` の仕入先版・同じ理由）。
 *
 * `vendor_type` / `invoice_registration_number` は仕入先固有の値なので
 * customers 側には写さない。
 */
export async function syncCompanyFromVendor(
  vendorId: string,
  fields: Pick<CompanyDirectoryFields, 'name' | 'contact_name' | 'email' | 'phone' | 'address' | 'vendor_type' | 'invoice_registration_number' | 'notes'>,
  userId: string | null,
  exec: Exec = (sql, params) => poolExecute(sql, params),
): Promise<void> {
  await exec(
    `WITH updated_company AS (
       UPDATE companies SET name=?, contact_name=?, email=?, phone=?, address=?, vendor_type=?,
         invoice_registration_number=?, notes=?, updated_at=NOW(), updated_by=?
       WHERE id = (SELECT company_id FROM vendors WHERE id = ?) AND deleted_at IS NULL
       RETURNING id
     )
     UPDATE customers SET name=?, contact_name=?, email=?, phone=?, address=?, notes=?,
       updated_at=NOW(), updated_by=?
     WHERE company_id IN (SELECT id FROM updated_company) AND deleted_at IS NULL`,
    [fields.name, fields.contact_name || null, fields.email || null, fields.phone || null,
     fields.address || null, fields.vendor_type || null, fields.invoice_registration_number || null,
     fields.notes || null, userId, vendorId,
     fields.name, fields.contact_name || null, fields.email || null, fields.phone || null,
     fields.address || null, fields.notes || null, userId],
  );
}
