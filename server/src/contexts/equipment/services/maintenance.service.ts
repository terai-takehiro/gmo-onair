/**
 * equipment/services/maintenance.service.ts — Phase 3 v2.6.10
 * メンテナンス記録のロジック層。
 * 故障(breakdown) 報告時 → 機材を in_repair に / 完了時 → in_repair から active に戻す。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import {
  EQUIPMENT_STATUS,
  MAINTENANCE_STATUS,
} from '../../../shared/constants/statuses';

export interface ListFilter {
  equipment_id?: string;
  status?: string;
  record_type?: string;
}

export interface CreateInput {
  equipment_id: string;
  record_type: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  vendor_name?: string | null;
  repair_cost?: number | null;
}

export interface UpdateInput {
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  vendor_name?: string | null;
  repair_cost?: number | null;
  status: string;
  result?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export const maintenanceService = {
  async list(filter: ListFilter) {
    let sql = `
      SELECT mr.*, ei.name as equipment_name, ei.eq_code
      FROM maintenance_records mr
      JOIN equipment_items ei ON ei.id = mr.equipment_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let i = 1;
    if (filter.equipment_id) { sql += ` AND mr.equipment_id = $${i++}`; params.push(filter.equipment_id); }
    if (filter.status) { sql += ` AND mr.status = $${i++}`; params.push(filter.status); }
    if (filter.record_type) { sql += ` AND mr.record_type = $${i++}`; params.push(filter.record_type); }
    sql += ' ORDER BY mr.reported_at DESC';
    return queryAll(sql, params);
  },

  async create(input: CreateInput, userId: string | null): Promise<{ id: string }> {
    const id = uuid();
    await execute(
      `INSERT INTO maintenance_records (id, equipment_id, record_type, title, description, reported_by, assigned_to, vendor_name, repair_cost, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, input.equipment_id, input.record_type, input.title,
        input.description ?? null, userId, input.assigned_to ?? null,
        input.vendor_name ?? null, input.repair_cost ?? null,
        MAINTENANCE_STATUS.REPORTED,
      ],
    );

    // 故障報告時は機材ステータスを修理中に
    if (input.record_type === 'breakdown') {
      await execute(
        `UPDATE equipment_items SET status='${EQUIPMENT_STATUS.IN_REPAIR}', updated_at=NOW() WHERE id=$1`,
        [input.equipment_id],
      );
    }
    return { id };
  },

  async update(id: string, input: UpdateInput) {
    await execute(
      `UPDATE maintenance_records SET
         title=$1, description=$2, assigned_to=$3, vendor_name=$4, repair_cost=$5,
         status=$6, result=$7, started_at=$8, completed_at=$9, updated_at=NOW()
       WHERE id=$10`,
      [
        input.title, input.description ?? null, input.assigned_to ?? null,
        input.vendor_name ?? null, input.repair_cost ?? null,
        input.status, input.result ?? null,
        input.started_at ?? null, input.completed_at ?? null,
        id,
      ],
    );

    // 完了時は機材を修理中 → 稼働中に戻す
    if (input.status === MAINTENANCE_STATUS.COMPLETED) {
      const record = (await queryOne(
        'SELECT equipment_id FROM maintenance_records WHERE id=$1',
        [id],
      )) as { equipment_id: string } | null;
      if (record) {
        await execute(
          `UPDATE equipment_items SET status='${EQUIPMENT_STATUS.ACTIVE}', updated_at=NOW() WHERE id=$1 AND status='${EQUIPMENT_STATUS.IN_REPAIR}'`,
          [record.equipment_id],
        );
      }
    }
  },
};
