/**
 * 会社（取引先）の登録は必ずここを通す。
 *
 * ── なにを直しているか ──────────────────────────────────────
 *
 * `companies` は「顧客・仕入先・販管費支払先」を束ねる唯一の正のマスター
 * （migration 061）。Phase 3-3（migration 207）で `customers`/`vendors`
 * テーブル自体を削除したため、**このファイルはもう `companies` 1つだけに
 * 書き込む**。以前は `companies` に加えて `customers`/`vendors` へも
 * ミラー行を作っていたが（旧FKが customers/vendors の id を指していた名残）、
 * migration 200/201 で全FKが `companies.id` を直接指すようになったため、
 * この二重書き込み自体が不要になっていた。テーブル削除にあわせてここも
 * `companies` 単独書き込みに寄せる。
 */
import { v4 as uuidv4 } from 'uuid';
import { execute as poolExecute, queryOne, withTransaction, TxClient } from '../db/connection';
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
 * 顧客を1件作る。`companies`（is_customer=TRUE）に行を作る。
 * 戻り値は `companies.id`（Phase 3-3 より前は `customers.id` を返していたが、
 * `customers` テーブル自体が無くなったため companies.id を直接返す。
 * 呼び出し側は「companies.id が使える」前提に揃っているので変更なしで使える）。
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
 * 仕入先を1件作る。`companies`（is_vendor=TRUE）に行を作る。
 * 戻り値は `companies.id`（`createCustomerRecord` と同じ理由）。
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
 * 顧客・仕入先の情報を直す画面から名前・連絡先を直したとき、紐づいた
 * `companies` 行に同じ値を書き込む。
 *
 * Phase 3-3（`customers`/`vendors` テーブル削除）より前は、`customers`/`vendors`
 * 側を直した後にここで `companies`（および1社が顧客・仕入先を両方兼ねる場合は
 * もう片方のロールの表）へ値を写す `syncCompanyFromCustomer`/`syncCompanyFromVendor`
 * という2関数だった。テーブル自体が無くなり「写す先」が `companies` 1つだけに
 * なったため、単純な `UPDATE companies` に置き換えた。1社が顧客・仕入先を
 * 両方兼ねる場合も `companies` は1行しか無いので、この1回のUPDATEで両方の
 * 画面に反映される（以前のような「もう片方の表へ写す」処理は不要になった）。
 *
 * `vendor_type`/`invoice_registration_number` を渡すのは仕入先側の画面だけ
 * （顧客側の画面はこれらの列を持たないので `undefined` のときは書き換えない）。
 */
export async function updateCompanyDirectory(
  companyId: string,
  fields: Pick<CompanyDirectoryFields, 'name' | 'contact_name' | 'email' | 'phone' | 'address' | 'notes'> &
    Partial<Pick<CompanyDirectoryFields, 'short_name' | 'is_gmo_group' | 'vendor_type' | 'invoice_registration_number'>>,
  userId: string | null,
  exec: Exec = (sql, params) => poolExecute(sql, params),
): Promise<void> {
  const sets: string[] = ['name=?', 'contact_name=?', 'email=?', 'phone=?', 'address=?', 'notes=?'];
  const params: unknown[] = [fields.name, fields.contact_name || null, fields.email || null,
    fields.phone || null, fields.address || null, fields.notes || null];
  if (fields.short_name !== undefined) { sets.push('short_name=?'); params.push(fields.short_name || null); }
  if (fields.is_gmo_group !== undefined) { sets.push('is_gmo_group=?'); params.push(fields.is_gmo_group); }
  if (fields.vendor_type !== undefined) { sets.push('vendor_type=?'); params.push(fields.vendor_type || null); }
  if (fields.invoice_registration_number !== undefined) {
    sets.push('invoice_registration_number=?');
    params.push(fields.invoice_registration_number || null);
  }
  params.push(userId, companyId);
  await exec(
    `UPDATE companies SET ${sets.join(', ')}, updated_at=NOW(), updated_by=?
     WHERE id=? AND deleted_at IS NULL`,
    params,
  );
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
 * Phase 3-3-4（顧客側と同時に対応）: 以前は `vendors` 行が生きているかの `EXISTS`
 * チェックも必須だった。`DELETE /vendors/:id` が `companies.is_vendor` も更新する
 * ようになった（PR #226）ので、`is_vendor = TRUE AND deleted_at IS NULL` だけで
 * 足りる（`assertCustomerCompanyId` と同じ理由）。Phase 3-3-9（`vendors`
 * テーブル削除）で `EXISTS` は書けなくなるため、あわせて除去した。
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
