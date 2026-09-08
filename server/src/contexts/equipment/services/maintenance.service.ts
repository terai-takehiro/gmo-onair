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
  /** 修理引取／発送日（機材を修理業者に渡した／送った日） */
  repair_sent_at?: string | null;
  /** 修理受取／返送日（機材が戻ってきた日） */
  repair_returned_at?: string | null;
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
  /** 修理引取／発送日（機材を修理業者に渡した／送った日） */
  repair_sent_at?: string | null;
  /** 修理受取／返送日（機材が戻ってきた日） */
  repair_returned_at?: string | null;
}

export const maintenanceService = {
  async list(filter: ListFilter) {
    /*
     * **付属品 (子機材) の記録も、どの親のものかが分かる形で返す。**
     *
     * メンテナンスは子機材にも起きます (カメラセットの中のレンズだけ修理に出す)。
     * 記録そのものは前から `equipment_id` に何を入れても作れましたが、一覧には
     * `Y-C-000012 ・ レンズ` としか出ないため、**同じ名前のレンズが何本もあると
     * どのセットのものか分かりません**。親を引いて `parent_name` を添えます
     * (親が無い機材では NULL。画面側は出し分ける)。
     */
    let sql = `
      SELECT mr.*, ei.name as equipment_name, ei.eq_code, ei.parent_id,
             p.eq_code as parent_eq_code, p.name as parent_name
      FROM maintenance_records mr
      JOIN equipment_items ei ON ei.id = mr.equipment_id
      LEFT JOIN equipment_items p ON p.id = ei.parent_id AND p.deleted_at IS NULL
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
      `INSERT INTO maintenance_records
         (id, equipment_id, record_type, title, description, reported_by, assigned_to, vendor_name, repair_cost, status, repair_sent_at, repair_returned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id, input.equipment_id, input.record_type, input.title,
        input.description ?? null, userId, input.assigned_to ?? null,
        input.vendor_name ?? null, input.repair_cost ?? null,
        MAINTENANCE_STATUS.REPORTED,
        input.repair_sent_at ?? null, input.repair_returned_at ?? null,
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
         status=$6, result=$7, started_at=$8, completed_at=$9,
         repair_sent_at=$10, repair_returned_at=$11, updated_at=NOW()
       WHERE id=$12`,
      [
        input.title, input.description ?? null, input.assigned_to ?? null,
        input.vendor_name ?? null, input.repair_cost ?? null,
        input.status, input.result ?? null,
        input.started_at ?? null, input.completed_at ?? null,
        input.repair_sent_at ?? null, input.repair_returned_at ?? null,
        id,
      ],
    );

    // 完了時は機材を修理中 → 稼働中に戻す。
    //
    // ⚠️ **他に未完了の「故障」が残っていれば戻さない**（Codexレビュー指摘・2巡目）。
    // 「記録」種別を足したことで、同じ機材に故障（未完了・修理中）と軽微な記録
    // （リセット等）が同時に立ち、後者だけ先に完了する組み合わせが起きうる。
    // 無条件に戻すと、故障がまだ直っていないのに機材が「稼働中」に見え、
    // 貸出候補（`status: 'active'` で引く `LendingDialog`）にも出てしまう。
    //
    // ⚠️ **見る記録の種類は「故障」だけに絞る**（1巡目の直しへのさらなる指摘）。
    // 機材を `in_repair` にするのは `create()` の `record_type === 'breakdown'` の
    // ときだけ。ここを種類を問わず「未完了なら何でもブロック」にすると、
    // 逆に**故障を完了させても、無関係な「記録」が残っているだけで稼働中に
    // 戻せなくなる**（その記録が中止・完了されるまで永久に修理中のまま）。
    if (input.status === MAINTENANCE_STATUS.COMPLETED) {
      const record = (await queryOne(
        'SELECT equipment_id FROM maintenance_records WHERE id=$1',
        [id],
      )) as { equipment_id: string } | null;
      if (record) {
        const stillOpen = await queryOne(
          `SELECT id FROM maintenance_records
             WHERE equipment_id=$1 AND id<>$2 AND record_type='breakdown'
               AND status NOT IN ('${MAINTENANCE_STATUS.COMPLETED}', '${MAINTENANCE_STATUS.CANCELLED}')
             LIMIT 1`,
          [record.equipment_id, id],
        );
        if (!stillOpen) {
          await execute(
            `UPDATE equipment_items SET status='${EQUIPMENT_STATUS.ACTIVE}', updated_at=NOW() WHERE id=$1 AND status='${EQUIPMENT_STATUS.IN_REPAIR}'`,
            [record.equipment_id],
          );
        }
      }
    }
  },
};
