/**
 * equipment/services/lending.service.ts — Phase 3 v2.6.10
 * 貸出記録のロジック層。単発 / 一括 lending、返却処理。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { EQUIPMENT_LENDING_STATUS, EQUIPMENT_STATUS } from '../../../shared/constants/statuses';
import { shiftYmd } from '../../../shared/utils/jst';

export interface ListFilter {
  status?: string;
  equipment_id?: string;
  project_id?: string;
}

export interface CreateInput {
  equipment_id: string;
  project_id?: string | null;
  borrower_name: string;
  purpose?: string | null;
  lent_at: string;
  due_date?: string | null;
  condition_out?: string | null;
  notes?: string | null;
  /**
   * 出庫予定日 (migration 168)。**入れると「予定」の行になり、まだ持ち出していない**扱い。
   * ダッシュボードの「今日/明日 出す」はこれを数える。
   * 入れなければ従来どおり、その場で持ち出した記録になる。
   */
  planned_out_date?: string | null;
}

export interface BatchCreateInput {
  equipment_ids: string[];
  project_id?: string | null;
  borrower_name: string;
  purpose?: string | null;
  lent_at: string;
  due_date?: string | null;
  condition_out?: string | null;
  notes?: string | null;
  /** 出庫予定日 (migration 168)。入れると「予定」の行になる（まだ持ち出していない） */
  planned_out_date?: string | null;
}

async function findActiveLending(equipmentId: string) {
  return queryOne(
    `SELECT id FROM equipment_lendings WHERE equipment_id = $1 AND status = '${EQUIPMENT_LENDING_STATUS.LENT}'`,
    [equipmentId],
  );
}

/** 貸出の決めごと (`equipment_settings`・migration 168) を1つ読む。無ければ null */
async function getSetting(key: string): Promise<string | null> {
  const row = (await queryOne(
    'SELECT value FROM equipment_settings WHERE key = $1', [key],
  )) as { value: string } | null;
  return row ? String(row.value) : null;
}

/** 「修理中・引退の機材を貸し出せないようにする」(block_broken_lending) が止める状態。
 *  貸出中 (lent) はここに入れない — 二重貸出は ALREADY_LENT が別に見ている */
const UNLENDABLE_STATUSES: string[] = [
  EQUIPMENT_STATUS.IN_REPAIR, EQUIPMENT_STATUS.LOST, EQUIPMENT_STATUS.RETIRED,
];

const BROKEN_LENDING_MESSAGE =
  '「修理中・引退の機材を貸し出せないようにする」が入のため、この機材は貸し出せません';

/**
 * UNIQUE 制約違反 (`uq_equipment_active_lending`・migration 266) か。
 * `findActiveLending` の事前チェックをすり抜けた同時実行だけが踏む経路。
 */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && 'code' in e && (e as { code?: string }).code === '23505';
}

/**
 * 返却予定日が空なら「返却予定日の初期値」(default_due_days) で補完する。
 * 出庫予定 (planned) はまだ持ち出していないので補完しない。
 * lent_at が `YYYY-MM-DD` でない形は補完せずそのまま（未定のまま）にする。
 */
async function resolveDueDate(
  dueDate: string | null | undefined, lentAt: string, planned: boolean,
): Promise<string | null> {
  if (dueDate) return dueDate;
  if (planned || !/^\d{4}-\d{2}-\d{2}$/.test(lentAt ?? '')) return null;
  const days = parseInt((await getSetting('default_due_days')) ?? '7', 10) || 7;
  return shiftYmd(lentAt, days);
}

export const lendingService = {
  async list(filter: ListFilter) {
    let sql = `
      SELECT el.*, ei.name as equipment_name, ei.eq_code, ei.unit_number,
             p.name as project_name, p.gls_number
      FROM equipment_lendings el
      JOIN equipment_items ei ON ei.id = el.equipment_id
      LEFT JOIN projects p ON p.id = el.project_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let i = 1;
    if (filter.status) { sql += ` AND el.status = $${i++}`; params.push(filter.status); }
    if (filter.equipment_id) { sql += ` AND el.equipment_id = $${i++}`; params.push(filter.equipment_id); }
    if (filter.project_id) { sql += ` AND el.project_id = $${i++}`; params.push(filter.project_id); }
    sql += ' ORDER BY el.lent_at DESC';
    return queryAll(sql, params);
  },

  /** 単発貸出。二重貸出は 400 */
  async create(input: CreateInput, userId: string | null): Promise<{ id: string }> {
    const item = (await queryOne(
      'SELECT id, name, status FROM equipment_items WHERE id = $1 AND deleted_at IS NULL',
      [input.equipment_id],
    )) as { id: string; name: string; status: string } | null;
    if (!item) throw new AppError(404, 'NOT_FOUND', '機材が見つかりません');

    // 設定「修理中・引退の機材を貸し出せないようにする」が入なら、機材の状態で止める
    if (
      UNLENDABLE_STATUSES.includes(item.status) &&
      (await getSetting('block_broken_lending')) === 'true'
    ) {
      throw new AppError(400, 'BROKEN_LENDING_BLOCKED', BROKEN_LENDING_MESSAGE);
    }

    const active = await findActiveLending(input.equipment_id);
    if (active) throw new AppError(400, 'ALREADY_LENT', 'この機材は貸出中です');

    /**
     * **出庫予定なら「予定」の行にする** (migration 168)。
     *
     * 予定は「まだ持ち出していない」ので、二重貸出の判定 (`findActiveLending`) は
     * `status='lent'` だけを見ます。同じ機材に予定を2本入れられますが、
     * それは**予定の重なりに気づくため**にわざとそうしています
     * (予定の段階で弾くと、日付をずらして入れ直すたびに前のを消すことになる)。
     */
    const planned = !!input.planned_out_date;
    const dueDate = await resolveDueDate(input.due_date, input.lent_at, planned);

    const id = uuid();
    try {
      await execute(
        `INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes, status, lent_by, planned_out_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id, input.equipment_id, input.project_id ?? null, input.borrower_name,
          input.purpose ?? null, input.lent_at, dueDate,
          input.condition_out ?? null, input.notes ?? null,
          planned ? 'planned' : EQUIPMENT_LENDING_STATUS.LENT, userId,
          input.planned_out_date ?? null,
        ],
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError(400, 'ALREADY_LENT', 'この機材は貸出中です');
      throw e;
    }
    return { id };
  },

  /**
   * 予定の行を「持ち出した」に変える (migration 168)。
   *
   * **予定の行を消して貸出を作り直さない** — 作り直すと、いつ予定を立てたかが
   * 消え、予定どおりに出せたのかが後から分からなくなります。
   */
  async markPlannedAsLent(id: string, userId: string | null): Promise<void> {
    const row = await queryOne(
      `SELECT el.equipment_id, ei.status AS item_status
         FROM equipment_lendings el
         JOIN equipment_items ei ON ei.id = el.equipment_id
        WHERE el.id = $1 AND el.status = 'planned' AND ei.deleted_at IS NULL`, [id],
    ) as { equipment_id: string; item_status: string } | null;
    if (!row) throw new AppError(404, 'NOT_FOUND', '出庫予定が見つかりません');

    // 予定を立てたあとで機材が壊れていることもある。持ち出しに変える瞬間にも状態を見る
    if (
      UNLENDABLE_STATUSES.includes(row.item_status) &&
      (await getSetting('block_broken_lending')) === 'true'
    ) {
      throw new AppError(400, 'BROKEN_LENDING_BLOCKED', BROKEN_LENDING_MESSAGE);
    }

    const active = await findActiveLending(row.equipment_id);
    if (active) throw new AppError(400, 'ALREADY_LENT', 'この機材は貸出中です');

    try {
      await execute(
        `UPDATE equipment_lendings
            SET status = '${EQUIPMENT_LENDING_STATUS.LENT}', lent_at = CURRENT_DATE::text,
                lent_by = COALESCE($1, lent_by), updated_at = NOW()
          WHERE id = $2 AND status = 'planned'`,
        [userId, id],
      );
    } catch (e) {
      // 'lent' への変更もユニーク索引に掛かる（同時実行で別の貸出が先に通った場合）
      if (isUniqueViolation(e)) throw new AppError(400, 'ALREADY_LENT', 'この機材は貸出中です');
      throw e;
    }
  },

  /** 一括貸出。エラーは部分適用 (作成できたもの + エラーリスト) */
  async createBatch(input: BatchCreateInput, userId: string | null) {
    if (!Array.isArray(input.equipment_ids) || input.equipment_ids.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', '機材を1台以上選択してください');
    }
    if (!input.borrower_name) {
      throw new AppError(400, 'VALIDATION_ERROR', '借用者名は必須です');
    }
    const errors: string[] = [];
    const createdIds: string[] = [];
    // 設定はループの外で1回だけ読む
    const blockBroken = (await getSetting('block_broken_lending')) === 'true';
    const planned = !!input.planned_out_date;
    const dueDate = await resolveDueDate(input.due_date, input.lent_at, planned);
    for (const equipmentId of input.equipment_ids) {
      const item = (await queryOne(
        'SELECT id, name, status FROM equipment_items WHERE id = $1 AND deleted_at IS NULL',
        [equipmentId],
      )) as { id: string; name: string; status: string } | null;
      if (!item) { errors.push(`ID:${equipmentId} が見つかりません`); continue; }
      if (blockBroken && UNLENDABLE_STATUSES.includes(item.status)) {
        errors.push(`${item.name} は修理中・引退のため貸し出せません（貸出の決めごと）`); continue;
      }
      if (await findActiveLending(equipmentId)) {
        errors.push(`${item.name} は既に貸出中です`); continue;
      }
      const id = uuid();
      try {
        await execute(
          `INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes, status, lent_by, planned_out_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id, equipmentId, input.project_id ?? null, input.borrower_name,
            input.purpose ?? null, input.lent_at, dueDate,
            input.condition_out ?? null, input.notes ?? null,
            planned ? 'planned' : EQUIPMENT_LENDING_STATUS.LENT, userId,
            input.planned_out_date ?? null,
          ],
        );
      } catch (e) {
        // 部分適用の流儀に合わせ、同時実行の二重貸出もエラーリストに積んで続ける
        if (isUniqueViolation(e)) { errors.push(`${item.name} は既に貸出中です`); continue; }
        throw e;
      }
      createdIds.push(id);
    }
    if (createdIds.length === 0) {
      throw new AppError(400, 'BATCH_FAILED', errors.join('、'));
    }
    return {
      created_count: createdIds.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  },

  async returnLending(
    id: string,
    input: { condition_in?: string | null; notes?: string | null },
    userId: string | null,
  ) {
    await execute(
      `UPDATE equipment_lendings SET
         status='${EQUIPMENT_LENDING_STATUS.RETURNED}', returned_at=NOW(), condition_in=$1, notes=COALESCE($2, notes),
         returned_by=$3, updated_at=NOW()
       WHERE id=$4 AND status='${EQUIPMENT_LENDING_STATUS.LENT}'`,
      [input.condition_in ?? null, input.notes ?? null, userId, id],
    );
  },

  async delete(id: string) {
    await execute('DELETE FROM equipment_lendings WHERE id=$1', [id]);
  },
};
