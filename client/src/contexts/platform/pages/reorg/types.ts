/**
 * 会社と切替（設定 ⑧・2026年10月の事業再編 P0）— 型と表示ラベル
 *
 * サーバー契約は `docs/reorg-2026-10-plan.md` §4.2 / §13（0a〜0c で先に入った
 * `legal_entities` / `org_transition`）。API 呼び出しは各コンポーネントが
 * `MoneyRulesPage.tsx` と同じやり方で直接 `api.get`/`api.put` を呼ぶ
 * （呼び出しが数本しかないので、専用の `api.ts` を作るほどではない）。
 */

export type LegalEntityCode = 'GJV' | 'GSS' | 'GMO';
export type LegalEntityKind = 'revenue' | 'cost_center';

/** `GET /legal-entities` の1行 */
export interface LegalEntity {
  code: LegalEntityCode;
  name: string;
  shortName: string;
  formerName: string | null;
  renamedOn: string | null;
  kind: LegalEntityKind;
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

export type OrgTransitionState = 'off' | 'preparing' | 'cutover' | 'done';

/** `GET /org-transition` */
export interface OrgTransition {
  state: OrgTransitionState;
  cutoverDate: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * 画面に出す状態のラベル。**英語の生名は画面に出さず `title` 属性へ退避**する
 * （docs/wording.md ルール5。バッジ側は `TransitionPanel.tsx` で `title={state}` を渡す）。
 */
export const ORG_TRANSITION_STATE_LABELS: Record<OrgTransitionState, string> = {
  off: '未着手',
  preparing: '準備中',
  cutover: '切替中',
  done: '完了',
};

/** バッジの色。**既存トークンの使い回し** — 新しい tone クラスは作らない */
export const ORG_TRANSITION_STATE_TONE: Record<OrgTransitionState, string> = {
  off: 'bg-muted text-muted-foreground',
  preparing: 'bg-warning-surface text-warning',
  cutover: 'bg-info-surface text-info',
  done: 'bg-success-surface text-success',
};

/**
 * 次に進める先（1つだけ）。サーバーの遷移表はもう少し広い
 * （例: `cutover` → `preparing` の巻き戻し）が、**この画面では単一の前進だけを
 * ボタンで出す**（指示書のとおり・任意の遷移には飛ばせない）。
 */
export const NEXT_ORG_TRANSITION_STATE: Record<OrgTransitionState, OrgTransitionState | null> = {
  off: 'preparing',
  preparing: 'cutover',
  cutover: 'done',
  done: null,
};

export const NEXT_ORG_TRANSITION_LABEL: Record<OrgTransitionState, string> = {
  off: '準備を始める',
  preparing: '切り替える',
  cutover: '完了にする',
  done: '',
};

/** 振込先（`bank_account` JSONB の中身）。この画面が決めた形で、サーバーは中身を検査しない */
export interface BankAccountFields {
  bank_name?: string;
  branch_name?: string;
  account_number?: string;
  account_holder?: string;
}

/**
 * その案件はコストセンター（今日は GMO の1社だけ）に計上されているか
 * — 2026年10月の事業再編・P3（`docs/reorg-2026-10-plan.md` §4.7 GMOコストセンター）。
 *
 * ⚠️ **`gls_category==='B'`（GPM の案件かどうか）では判定しないこと。**
 * `org_transition.state` が `off`／未改番のあいだ、GLS-B 案件の `entity_code` は
 * まだ `'GSS'` のまま（改番していないため）なので、実際に GMO へ改番された案件だけが
 * 対象になる（切替に自然に追随する作り）。サーバー側の判定基準
 * （`server/.../legal-entity.service.ts` の `isProjectCostCenter`）と揃えてある。
 *
 * 呼び出し側はこの判定を書き写さず、必ずこの1本を通すこと
 * （GPM のプロジェクト詳細・「予算と実績」タブの切り替えが最初の呼び出し元）。
 */
export function isCostCenterProject(
  project: { entity_code?: string | null } | null | undefined,
  legalEntities: LegalEntity[] | null | undefined,
): boolean {
  if (!project?.entity_code || !legalEntities) return false;
  return legalEntities.some((e) => e.code === project.entity_code && e.kind === 'cost_center');
}
