/**
 * 旧⇄新の切替状態 — `org_transition`（1行だけ）の読み書き
 *
 * 2026年10月の事業再編（社名変更・計上会社の2社化・GLS→GJV/GSS/GMO の改番）の
 * 状態遷移。設計の全文: docs/reorg-2026-10-plan.md（§5・§13）。
 *
 * `money-rules.service.ts` と違いキャッシュは持たない——読むのは移行センターや
 * バナー程度で頻度が低く、書き込みのたびにキャッシュの整合を気にする理由が無い。
 */
import { queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

export type OrgTransitionState = 'off' | 'preparing' | 'cutover' | 'done';

export interface OrgTransition {
  state: OrgTransitionState;
  cutoverDate: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

function toOrgTransition(row: Record<string, unknown>): OrgTransition {
  return {
    state: row.state as OrgTransitionState,
    cutoverDate: row.cutover_date == null ? null : String(row.cutover_date),
    updatedAt: String(row.updated_at),
    updatedBy: row.updated_by == null ? null : String(row.updated_by),
  };
}

export async function getOrgTransition(): Promise<OrgTransition> {
  const row = (await queryOne(
    `SELECT * FROM org_transition WHERE id = 'default'`,
  )) as Record<string, unknown> | null;
  // migration 280 が 'default' 行を必ず1行 INSERT 済み。無ければ設定そのものが
  // 壊れているという意味なので、'off' を捏造せず素直に落とす。
  if (!row) throw new AppError(500, 'INTERNAL_ERROR', '切替状態(org_transition)の行が見つかりません');
  return toOrgTransition(row);
}

/** money-rules 等とのキャッシュ有無の対称性のためだけに置く（今はキャッシュを持たないので no-op） */
export function invalidateOrgTransition(): void { /* no-op: このサービスはキャッシュを持たない */ }

/**
 * 今日の日付を `YYYY-MM-DD` で。
 *
 * ⚠️ 簡易近似: `db/connection.ts` のコメントのとおりサーバーは時間帯を設定せず
 * UTC で動く前提なので、ここも `new Date().toISOString().slice(0,10)` で済ませる。
 * 「切替日を過ぎたか」という大まかなガードにしか使わないため、JST のカレンダー日を
 * 厳密に出す作りにはしない（過剰実装をしない）。
 */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 許される遷移先（§5）。同じ状態への「遷移」（cutover_date だけを変える等）も
 * 常に許す——実質バリデーションなしの据え置きなので、表にも自分自身を含めておく。
 */
const ALLOWED_NEXT: Record<OrgTransitionState, readonly OrgTransitionState[]> = {
  off: ['off', 'preparing'],
  preparing: ['preparing', 'cutover'],
  cutover: ['cutover', 'preparing', 'done'], // cutover → preparing はロールバック（§5）
  done: ['done'],
};

export async function updateOrgTransition(
  patch: { state?: OrgTransitionState; cutover_date?: string | null },
  userId: string,
): Promise<OrgTransition> {
  const current = await getOrgTransition();

  if (patch.state !== undefined) {
    if (!ALLOWED_NEXT[current.state].includes(patch.state)) {
      throw new AppError(
        400,
        'INVALID_TRANSITION',
        `状態を「${current.state}」から「${patch.state}」に変更することはできません`,
      );
    }
    // preparing → cutover のときだけ、切替日が来ているかを見る。
    // それ以外（cutover に留まったまま cutover_date だけ変える等）は検証しない
    // （ご依頼どおり——一度 cutover に入った後の再検証はここでは求められていない）。
    if (patch.state === 'cutover' && current.state === 'preparing') {
      const resultingCutoverDate = 'cutover_date' in patch ? (patch.cutover_date ?? null) : current.cutoverDate;
      if (!resultingCutoverDate || resultingCutoverDate > todayISO()) {
        throw new AppError(400, 'INVALID_TRANSITION', '切替日をこの日付以前に設定してから切り替えてください');
      }
    }
    // cutover → done: この段では「残件0」の自動チェックはまだ無い（後続フェーズで追加予定・§5の done行）。
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.state !== undefined) { sets.push('state = ?'); params.push(patch.state); }
  if ('cutover_date' in patch) { sets.push('cutover_date = ?'); params.push(patch.cutover_date ?? null); }

  if (sets.length > 0) {
    await execute(
      `UPDATE org_transition SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = 'default'`,
      [...params, userId],
    );
  }
  return getOrgTransition();
}
