/**
 * equipment/services/stats.service.ts — Phase 3 v2.6.11
 * 機材ダッシュボードの集計クエリを集約。
 * recent_lendings / recent_maintenance は古いスキーマで JOIN が失敗する可能性を考慮し
 * try/catch で空配列フォールバック。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import {
  EQUIPMENT_LENDING_STATUS,
  EQUIPMENT_STATUS,
  INVENTORY_STATUS,
  MAINTENANCE_STATUS,
} from '../../../shared/constants/statuses';

interface CountRow {
  c?: number | string | null;
  count?: number | string | null;
}

const toInt = (v: CountRow | null | undefined): number => {
  const raw = v?.count ?? v?.c ?? '0';
  return parseInt(String(raw), 10) || 0;
};

export const statsService = {
  async getDashboardStats() {
    const totalItems = (await queryOne(
      'SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL',
    )) as CountRow | null;
    const activeItems = (await queryOne(
      `SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL AND status='${EQUIPMENT_STATUS.ACTIVE}'`,
    )) as CountRow | null;
    const inRepair = (await queryOne(
      `SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL AND status='${EQUIPMENT_STATUS.IN_REPAIR}'`,
    )) as CountRow | null;
    const lentOut = (await queryOne(
      `SELECT COUNT(*)::int as c FROM equipment_lendings WHERE status='${EQUIPMENT_LENDING_STATUS.LENT}'`,
    )) as CountRow | null;
    const overdue = (await queryOne(
      `SELECT COUNT(*)::int as c FROM equipment_lendings WHERE status='${EQUIPMENT_LENDING_STATUS.LENT}' AND due_date IS NOT NULL AND due_date < CURRENT_DATE::text`,
    )) as CountRow | null;
    const openMaintenance = (await queryOne(
      `SELECT COUNT(*)::int as c FROM maintenance_records WHERE status IN ('${MAINTENANCE_STATUS.REPORTED}', '${MAINTENANCE_STATUS.IN_PROGRESS}')`,
    )) as CountRow | null;
    const pendingInventory = (await queryOne(
      `SELECT COUNT(*)::int as c FROM inventory_checks WHERE status IN ('${INVENTORY_STATUS.DRAFT}', '${INVENTORY_STATUS.IN_PROGRESS}')`,
    )) as CountRow | null;

    let recentLendings: unknown[] = [];
    try {
      recentLendings = await queryAll(
        `SELECT el.id, el.borrower_name, el.due_date, el.lent_at,
                ei.name as equipment_name, ei.unit_number,
                p.name as project_name, p.gls_number
         FROM equipment_lendings el
         JOIN equipment_items ei ON ei.id = el.equipment_id
         LEFT JOIN projects p ON p.id = el.project_id
         WHERE el.status = '${EQUIPMENT_LENDING_STATUS.LENT}'
         ORDER BY el.lent_at DESC LIMIT 5`,
      );
    } catch {
      /* 古いスキーマでは projects/equipment_items の JOIN が失敗するため空配列で返す */
    }

    let recentMaintenance: unknown[] = [];
    try {
      recentMaintenance = await queryAll(
        `SELECT mr.id, mr.title, mr.record_type, mr.status, mr.created_at,
                ei.name as equipment_name
         FROM maintenance_records mr
         JOIN equipment_items ei ON ei.id = mr.equipment_id
         WHERE mr.status IN ('${MAINTENANCE_STATUS.REPORTED}', '${MAINTENANCE_STATUS.IN_PROGRESS}')
         ORDER BY mr.created_at DESC LIMIT 5`,
      );
    } catch {
      /* 同上 */
    }

    return {
      total_items: toInt(totalItems),
      active_items: toInt(activeItems),
      in_repair: toInt(inRepair),
      lent_out: toInt(lentOut),
      overdue: toInt(overdue),
      open_maintenance: toInt(openMaintenance),
      pending_inventory: toInt(pendingInventory),
      recent_lendings: recentLendings,
      recent_maintenance: recentMaintenance,
    };
  },
};
