/**
 * 会社（取引先）の登録は必ずここを通す。
 *
 * ── なにを直しているか ──────────────────────────────────────
 *
 * `companies` は「顧客・仕入先・販管費支払先」を束ねる唯一の正のマスター
 * （migration 061）。以前は `customers`/`vendors` へも自動でミラー行を作る作りに
 * なっていたが、Phase 3-3-7〜9（migration 205）で `customers`/`vendors`
 * テーブル自体を削除したため、この service は `companies` 単独への書き込みだけを
 * 行う。呼び出し側は今までどおりここを通す（案件・売上・仕入等のFKは
 * migration 200/201 で `companies.id` を直接指すようになっている）。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryOne, withTransaction, TxClient } from '../db/connection';
import { looksLikeGmoGroup } from './gmo-group';
import { AppError } from '../middleware/errorHandler';

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
 * 顧客を1件作る（`companies` に `is_customer=TRUE` の行を作る）。
 * 戻り値は `companies.id`。
 *
 * **`exec` を渡さない呼び出し（HTTP ルート・MCP・内覧会・xpoint 等）は
 * 内部で1つのトランザクションにまとめる**（レビュー指摘・PR #183 P2）。
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
  return companyId;
}

/**
 * 仕入先を1件作る（`companies` に `is_vendor=TRUE` の行を作る）。
 * 戻り値は `companies.id`。トランザクションの扱いは `createCustomerRecord` と同じ。
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
  return companyId;
}

/** `TxClient`（`?` 形式・`Promise<void>`）を `Exec`（`Promise<unknown>`）にそのまま渡すための橋渡し */
function execFromTx(tx: TxClient): Exec {
  return (sql, params) => tx.execute(sql, params);
}

/**
 * `customer_id`（Phase 3-2a 以降は `companies.id` を直接指す）が
 * **本当に顧客の会社を指しているか**を確かめる。
 *
 * ⚠️ FK が `companies(id)` を指すようになったことで、DB は「顧客であること」を
 * 保証しなくなった — 仕入先だけ・販管費支払先だけ・ロール無しの会社IDでも
 * FK 制約は通る。画面のドロップダウン（`companies.is_customer=TRUE` かつ
 * 生きている `customers` 行がある会社だけ）は自然にそこしか選べないが、
 * **直接 API / MCP を叩く呼び出しはこの保証を素通りする**（レビュー指摘・
 * PR #199 P2 の2巡目）。案件・売上・活動記録・見積の書き込みはここを通す。
 *
 * `customerId` が `null`/`undefined`/空文字なら何もしない（お客様未設定は
 * 別の入口が別の理由で許可・拒否する）。
 *
 * Phase 3-3-4（2026-08-18）: 以前は `customers` 行が生きているかの `EXISTS`
 * チェックも必須だった（`DELETE /customers/:id` が `companies.is_customer` を
 * 更新していなかったため）。`DELETE` が `companies.is_customer` も更新する
 * ようになった（PR #226）ので、`is_customer = TRUE AND deleted_at IS NULL`
 * だけで足りる（`customers.routes.ts`/`search.routes.ts` と同じ判定・同じ理由）。
 */
export async function assertCustomerCompanyId(
  customerId: unknown,
  exec: (sql: string, params: unknown[]) => Promise<unknown> = (sql, params) => queryOne(sql, params),
): Promise<void> {
  if (typeof customerId !== 'string' || !customerId) return;
  const row = await exec(
    `SELECT co.id FROM companies co
     WHERE co.id = ? AND co.is_customer = TRUE AND co.deleted_at IS NULL`,
    [customerId],
  ) as Record<string, unknown> | undefined;
  if (!row) throw new AppError(400, 'VALIDATION_ERROR', '指定された顧客が見つかりません（顧客ロールが外れているか、削除済みの可能性があります）');
}

/**
 * `vendor_id`（Phase 3-2b 以降は `companies.id` を直接指す）が
 * **本当に仕入先の会社を指しているか**を確かめる。`assertCustomerCompanyId` の
 * 仕入先版・同じ理由（FK は `companies(id)` を指すだけで「仕入先であること」は
 * 保証しない）。
 *
 * `vendorId` が `null`/`undefined`/空文字なら何もしない（sga_expenses.vendor_id は
 * nullable ＝ 仕入先を選ばない道があるため）。
 *
 * Phase 3-3-7〜9（migration 205）: `vendors` テーブル自体を削除したため、
 * 以前あった `EXISTS (SELECT 1 FROM vendors ...)` チェックは外した
 * （`assertCustomerCompanyId` が Phase 3-3-4 で辿ったのと同じ道 — `companies.is_vendor`
 * だけで判定が足りる）。
 */
export async function assertVendorCompanyId(
  vendorId: unknown,
  exec: (sql: string, params: unknown[]) => Promise<unknown> = (sql, params) => queryOne(sql, params),
): Promise<void> {
  if (typeof vendorId !== 'string' || !vendorId) return;
  const row = await exec(
    `SELECT co.id FROM companies co
     WHERE co.id = ? AND co.is_vendor = TRUE AND co.deleted_at IS NULL`,
    [vendorId],
  ) as Record<string, unknown> | undefined;
  if (!row) throw new AppError(400, 'VALIDATION_ERROR', '指定された仕入先が見つかりません（仕入先ロールが外れているか、削除済みの可能性があります）');
}
