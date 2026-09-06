/**
 * 事業主体（gss / gscs / gig）— 案件に保存する値の決め方（**server 側の実体**）
 *
 * ── 決めごと（docs/design/v4/keep-report.md §4・migration 282）────────
 * 主体は**お客様の区分から自動で決まる**（`customer_type` と同じく保存のたびに導出する）:
 *   グループ内（customer_type = 'internal'）→ gss （GMOサムライスタジオ）
 *   外部     （customer_type = 'external'）→ gscs（GMOサムライコンテンツスタジオ）
 * `gig`（GMOインターネットグループ人格）は自動では付かない。人が案件で上書きしたときだけ
 * `entity_manual = TRUE` の印を付け、以後はお客様を変えても自動で戻さない。
 * 上書きを `null` で送ると印を外して自動に戻る。
 *
 * ── 写しが `shared/src/keepReport/entity.ts` にあります ──────────────
 * この製品は **server が `shared/` を import しない構成**（`rootDir` が `server/src`）
 * なので、画面が使う同じ関数を `shared` にも置いています。**2つが食い違うと、画面に出た
 * 主体と保存された主体が違います**（型検査にも lint にも出ない）。
 * `shared/tests/keepReportEntity.test.ts` が両方を読んで同じ答えになることを固定しています。
 *
 * ⚠️ このファイルは**純粋関数だけ**（DB も HTTP も触らない）。上のテストが直接 import する。
 */

export type BusinessEntity = 'gss' | 'gscs' | 'gig';
/** 絞り込みの値。`all` は主体の合計 */
export type EntityScope = BusinessEntity | 'all';

export const BUSINESS_ENTITIES: readonly BusinessEntity[] = ['gss', 'gscs', 'gig'];

export const BUSINESS_ENTITY_LABELS: Record<BusinessEntity, string> = {
  gss: 'GMOサムライスタジオ',
  gscs: 'GMOサムライコンテンツスタジオ',
  gig: 'GMOインターネットグループ',
};

/** お客様の区分から主体を導く。分からないときは外部（gscs）— `customer_type` の既定と同じ側に倒す */
export function deriveEntity(customerType: 'internal' | 'external' | null | undefined): BusinessEntity {
  return customerType === 'internal' ? 'gss' : 'gscs';
}

export function isBusinessEntity(x: unknown): x is BusinessEntity {
  return x === 'gss' || x === 'gscs' || x === 'gig';
}

export function isEntityScope(x: unknown): x is EntityScope {
  return x === 'all' || isBusinessEntity(x);
}

/**
 * 案件の登録・更新で受け取った `entity` の読み方。
 *   unset   … 渡されなかった（undefined）→ 今の印に従う
 *   reset   … null / 空文字 → 印を外して自動に戻す
 *   set     … gss / gscs / gig → その値で上書きし、印を付ける
 *   invalid … 知らない値 → 呼ぶ側が 400 にする（CHECK 制約で 500 にしない）
 */
export type EntityInput =
  | { kind: 'unset' }
  | { kind: 'reset' }
  | { kind: 'set'; entity: BusinessEntity }
  | { kind: 'invalid'; value: unknown };

export function parseEntityInput(value: unknown): EntityInput {
  if (value === undefined) return { kind: 'unset' };
  if (value === null || value === '') return { kind: 'reset' };
  if (isBusinessEntity(value)) return { kind: 'set', entity: value };
  return { kind: 'invalid', value };
}

/**
 * 保存する `entity` / `entity_manual` を決める。
 *
 * - 上書き（set）→ その値・印 TRUE
 * - 戻す（reset）→ お客様から導いた値・印 FALSE
 * - 渡されない（unset）→ 印が付いていればそのまま保つ。付いていなければお客様から引き直す
 *   （`customer_type` と同じく、欄を持たない呼び出しから保存されても人の上書きが消えない）
 */
export function resolveProjectEntity(
  input: EntityInput,
  customerType: 'internal' | 'external' | null | undefined,
  existing?: { entity?: unknown; entity_manual?: unknown } | null,
): { entity: BusinessEntity; entity_manual: boolean } {
  if (input.kind === 'set') return { entity: input.entity, entity_manual: true };
  if (input.kind === 'reset') return { entity: deriveEntity(customerType), entity_manual: false };
  if (existing?.entity_manual === true && isBusinessEntity(existing.entity)) {
    return { entity: existing.entity, entity_manual: true };
  }
  return { entity: deriveEntity(customerType), entity_manual: false };
}
