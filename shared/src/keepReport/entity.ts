/**
 * 計上会社（GJV / GSS / GMO）— 画面側の小さな純粋関数（値の検査と表示名）。
 *
 * ── 決めごと（docs/reorg-2026-10-plan.md §4.1〜§4.4・docs/design/v4/keep-report.md §4）──
 * 値は main の `legal_entities.code`（`server/src/contexts/platform/services/legal-entity.service.ts`
 * の `LegalEntityCode`）そのもの。案件・帳簿の行が `entity_code` 列に持つ。
 *   GJV … GMOサムライコンテンツスタジオ（グループ外のお客様の案件）
 *   GSS … GMOサムライスタジオ（旧 GMOグローバルスタジオ。グループ内のお客様の案件）
 *   GMO … GMOインターネットグループ本体（旧 GLS-B のプロジェクト。コストセンター）
 *
 * ⚠️ **どの会社になるかの規則はここに置かない。** 「グループ外→GJV／グループ内→GSS／
 * プロジェクト→GMO」を決めるのは server の `sales/services/entity-resolution.service.ts`
 * （実施日・切替日・取引先の `is_gmo_group` を見る。`org_transition.state = 'off'` のあいだは
 * 効かず、既存の行はすべて GSS）。画面はサーバーが保存した `entity_code` を読むだけで、
 * お客様の区分から自分で導かない（写しを持つと切替日の前後で必ず食い違う）。
 *
 * `shared/tests/keepReportEntity.test.ts` が、ここの3文字と `LegalEntityCode` の3文字が
 * 同じであることを固定している（server は `shared/` を import できないので型では結べない）。
 */
import { BUSINESS_ENTITY_LABELS, type BusinessEntity, type EntityScope } from './types';

/**
 * 計上会社の並び。main の `legal_entities.sort_order` と同じ（親会社 GJV → GSS → GMO）。
 * 隔週キープの画面のチップ・計上会社別の表は GSS を先に置く（切替前は全行 GSS）— `client-daily` の `keep/format.ts`
 */
export const BUSINESS_ENTITIES = ['GJV', 'GSS', 'GMO'] as const satisfies readonly BusinessEntity[];

export function isBusinessEntity(x: unknown): x is BusinessEntity {
  return x === 'GJV' || x === 'GSS' || x === 'GMO';
}

/** 絞り込みの値（`all` を含む） */
export function isEntityScope(x: unknown): x is EntityScope {
  return x === 'all' || isBusinessEntity(x);
}

/** 計上会社の表示名（`types.ts` の表をそのまま。画面はこちらから読む） */
export const ENTITY_LABELS: Record<BusinessEntity, string> = BUSINESS_ENTITY_LABELS;

/** 絞り込みの値の表示名。`all` は「全体（統合）」 */
export function entityLabel(scope: EntityScope): string {
  return scope === 'all' ? '全体（統合）' : ENTITY_LABELS[scope];
}
