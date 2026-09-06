/**
 * 計上会社マスター — `legal_entities`（GJV／GSS／GMO の3行だけ）の読み書き
 *
 * 2026年10月の事業再編（社名変更・計上会社の2社化・GLS→GJV/GSS/GMO の改番）で新設。
 * 設計の全文: docs/reorg-2026-10-plan.md（§4.2・§4.9・§13）。マイグレーションは
 * `280_legal_entities.sql`（表そのもの）・`281_entity_code_columns.sql`（他表への列追加）。
 *
 * ── 読むたびに DB を叩かない ────────────────────────────────
 *
 * `money-rules.service.ts` と同じ考え方——3行しかなく、切替が進むほど帳票・見積の
 * 発行者情報として毎回読まれるようになるので、**保存したときだけ読み直す**キャッシュに
 * する（プロセスが1つの構成なので、保存＝自分のキャッシュを捨てるで足りる）。
 */
import { queryAll, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export type LegalEntityCode = 'GJV' | 'GSS' | 'GMO';

export interface LegalEntity {
  code: LegalEntityCode;
  name: string;
  shortName: string;
  formerName: string | null;
  renamedOn: string | null;        // YYYY-MM-DD or null
  kind: 'revenue' | 'cost_center';
  parentCode: LegalEntityCode | null;
  numberPrefix: string;
  issuerAddress1: string | null;
  issuerAddress2: string | null;
  invoiceRegistrationNumber: string | null;
  bankAccount: Record<string, unknown> | null;
  logoRef: string | null;
  activeFrom: string | null;
  sortOrder: number;
}

function toEntity(row: Record<string, unknown>): LegalEntity {
  return {
    code: row.code as LegalEntityCode,
    name: String(row.name),
    shortName: String(row.short_name),
    formerName: row.former_name == null ? null : String(row.former_name),
    renamedOn: row.renamed_on == null ? null : String(row.renamed_on),
    kind: row.kind as LegalEntity['kind'],
    parentCode: row.parent_code == null ? null : (row.parent_code as LegalEntityCode),
    numberPrefix: String(row.number_prefix),
    issuerAddress1: row.issuer_address1 == null ? null : String(row.issuer_address1),
    issuerAddress2: row.issuer_address2 == null ? null : String(row.issuer_address2),
    invoiceRegistrationNumber:
      row.invoice_registration_number == null ? null : String(row.invoice_registration_number),
    bankAccount: (row.bank_account as Record<string, unknown> | null) ?? null,
    logoRef: row.logo_ref == null ? null : String(row.logo_ref),
    activeFrom: row.active_from == null ? null : String(row.active_from),
    sortOrder: Number(row.sort_order),
  };
}

let cache: LegalEntity[] | null = null;

export async function listLegalEntities(): Promise<LegalEntity[]> {
  if (cache) return cache;
  const rows = (await queryAll(
    `SELECT * FROM legal_entities ORDER BY sort_order`,
  )) as Record<string, unknown>[];
  cache = rows.map(toEntity);
  return cache;
}

/** 保存したら覚え直す */
export function invalidateLegalEntities(): void { cache = null; }

/** 知らない code は null（呼び出し側が 404 に変換する。ここでは投げない） */
export async function getLegalEntity(code: string): Promise<LegalEntity | null> {
  const rows = await listLegalEntities();
  return rows.find((e) => e.code === code) ?? null;
}

/**
 * 保存してよい列。**この段で編集できるのは発行者情報だけ**——name/kind/prefix/
 * parent_code/former_name/renamed_on/active_from/sort_order は構造の決めごとであり、
 * ここでは触らせない（別の場所で決める・§4.2）。
 */
const WRITABLE = [
  'issuer_address1', 'issuer_address2', 'invoice_registration_number', 'bank_account', 'logo_ref',
] as const;

export interface LegalEntityIssuerPatch {
  issuer_address1?: string | null;
  issuer_address2?: string | null;
  invoice_registration_number?: string | null;
  bank_account?: Record<string, unknown> | null;
  logo_ref?: string | null;
}

export async function updateLegalEntityIssuer(
  code: string,
  patch: LegalEntityIssuerPatch,
  userId: string,
): Promise<LegalEntity> {
  const existing = await getLegalEntity(code);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '計上会社が見つかりません');

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of WRITABLE) {
    if (!(col in patch)) continue; // 渡していない = 今の値を保つ（saveMoneyRules と同じ契約）
    const value = (patch as Record<string, unknown>)[col];
    if (col === 'bank_account') {
      // JSONB 列への部分 UPDATE は `?::jsonb` にキャストする
      // (dailyops/services/{inview,ops-report}.service.ts と同じ書き方)。
      // null は「振込先を消す」なので SQL NULL のまま渡す（JSON の null にしない）。
      sets.push(value === null ? `${col} = ?` : `${col} = ?::jsonb`);
      params.push(value === null ? null : JSON.stringify(value));
    } else {
      sets.push(`${col} = ?`);
      params.push(value);
    }
  }
  if (sets.length > 0) {
    await execute(
      `UPDATE legal_entities SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ? WHERE code = ?`,
      [...params, userId, code],
    );
    invalidateLegalEntities();
  }
  return (await getLegalEntity(code))!; // code は不変の PK なので直前の存在確認がそのまま効く
}

/**
 * ある日付時点で表示する発行者名（§9-E: 社名変更前後の帳票の表記）。
 *
 * - `renamedOn` が無い、または `atISODate` が `renamedOn` より前 → 旧社名
 *   （`formerName`。無ければ `name`）
 * - `atISODate` が `renamedOn` 以降 → 新社名（`formerName` があれば
 *   「〇〇（旧 △△）」の併記、無ければ `name` だけ）
 *
 * ISO の `YYYY-MM-DD` 同士の比較なので、文字列の大小比較のまま日付の前後関係と一致する。
 */
export function issuerNameAsOf(entity: LegalEntity, atISODate: string): string {
  if (entity.renamedOn === null || atISODate < entity.renamedOn) {
    return entity.formerName ?? entity.name;
  }
  return entity.formerName ? `${entity.name}（旧 ${entity.formerName}）` : entity.name;
}
