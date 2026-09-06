/**
 * 事業主体（gss / gscs / gig）の決め方 — 画面側の純粋関数。
 *
 * ── 決めごと（docs/design/v4/keep-report.md §4・migration 282）────────
 * 主体は**お客様の区分から自動で決まる**:
 *   グループ内（customer_type = 'internal'）→ gss （GMOサムライスタジオ）
 *   外部     （customer_type = 'external'）→ gscs（GMOサムライコンテンツスタジオ）
 * `gig`（GMOインターネットグループ人格）は自動では付かない。人が案件で上書きしたときだけ。
 *
 * ⚠️ **server は `shared/` を import できません**（`rootDir` が `server/src`）。
 * 保存する値を決めるのは `server/src/contexts/sales/services/project-entity.ts` で、
 * こちらは画面が「お客様を選んだその場で主体を見せる」ための写しです。
 * **食い違うと、画面に出た主体と保存された主体が違います**（型検査にも lint にも出ない）。
 * `shared/tests/keepReportEntity.test.ts` が両方を読んで同じ答えになることを固定しています。
 */
import { BUSINESS_ENTITY_LABELS, type BusinessEntity, type EntityScope } from './types';

/** 主体の並び（画面の選択肢・絞り込みチップの順） */
export const BUSINESS_ENTITIES: readonly BusinessEntity[] = ['gss', 'gscs', 'gig'];

/** お客様の区分から主体を導く。分からないときは外部（gscs）— `customer_type` の既定と同じ側に倒す */
export function deriveEntity(customerType: 'internal' | 'external' | null | undefined): BusinessEntity {
  return customerType === 'internal' ? 'gss' : 'gscs';
}

export function isBusinessEntity(x: unknown): x is BusinessEntity {
  return x === 'gss' || x === 'gscs' || x === 'gig';
}

/** 絞り込みの値（`all` を含む） */
export function isEntityScope(x: unknown): x is EntityScope {
  return x === 'all' || isBusinessEntity(x);
}

/** 主体の表示名（`types.ts` の表をそのまま。画面はこちらから読む） */
export const ENTITY_LABELS: Record<BusinessEntity, string> = BUSINESS_ENTITY_LABELS;

/** 絞り込みの値の表示名。`all` は「全体」 */
export function entityLabel(scope: EntityScope): string {
  return scope === 'all' ? '全体' : ENTITY_LABELS[scope];
}
