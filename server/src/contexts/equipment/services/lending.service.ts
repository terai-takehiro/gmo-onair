/**
 * equipment/services/lending.service.ts — Phase 3 v2.6.10
 * 貸出記録のロジック層。単発 / 一括 lending、返却処理。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { EQUIPMENT_LENDING_STATUS } from '../../../shared/constants/statuses';

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
}

async function findActiveLending(equipmentId: string) {
  return queryOne(
    `SELECT id FROM equipment_lendings WHERE equipment_id = $1 AND status = '${EQUIPMENT_LENDING_STATUS.LENT}'`,
    [equipmentId],
  );
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
    const item = await queryOne(
      'SELECT id, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL',
      [input.equipment_id],
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', '機材が見つかりません');

    const active = await findActiveLending(input.equipment_id);
    if (active) throw new AppError(400, 'ALREADY_LENT', 'この機材は貸出中です');

    const id = uuid();
    await execute(
      `INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes, status, lent_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, input.equipment_id, input.project_id ?? null, input.borrower_name,
        input.purpose ?? null, input.lent_at, input.due_date ?? null,
        input.condition_out ?? null, input.notes ?? null,
        EQUIPMENT_LENDING_STATUS.LENT, userId,
      ],
    );
    return { id };
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
    for (const equipmentId of input.equipment_ids) {
      const item = (await queryOne(
        'SELECT id, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL',
        [equipmentId],
      )) as { id: string; name: string } | null;
      if (!item) { errors.push(`ID:${equipmentId} が見つかりません`); continue; }
      if (await findActiveLending(equipmentId)) {
        errors.push(`${item.name} は既に貸出中です`); continue;
      }
      const id = uuid();
      await execute(
        `INSERT INTO equipment_lendings (id, equipment_id, project_id, borrower_name, purpose, lent_at, due_date, condition_out, notes, status, lent_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id, equipmentId, input.project_id ?? null, input.borrower_name,
          input.purpose ?? null, input.lent_at, input.due_date ?? null,
          input.condition_out ?? null, input.notes ?? null,
          EQUIPMENT_LENDING_STATUS.LENT, userId,
        ],
      );
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
