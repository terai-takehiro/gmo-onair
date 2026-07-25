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

    // ── 日々の画面 (17b) 用 ────────────────────────────
    // 返ってきていないもの / 今日と明日の出し入れ / 種別ごとの在庫。
    // 新しいテーブルは作らず、貸出の日付から導出する。
    let overdueLendings: unknown[] = [];
    let todayMoves: unknown[] = [];
    let byType: unknown[] = [];
    try {
      overdueLendings = await queryAll(
        `SELECT el.id, el.borrower_name, el.due_date, el.lent_at,
                ei.id AS equipment_id, ei.name AS equipment_name, ei.eq_code, ei.unit_number,
                p.name AS project_name, p.gls_number,
                (CURRENT_DATE - el.due_date::date) AS days_late
         FROM equipment_lendings el
         JOIN equipment_items ei ON ei.id = el.equipment_id
         LEFT JOIN projects p ON p.id = el.project_id
         WHERE el.status = '${EQUIPMENT_LENDING_STATUS.LENT}'
           AND el.due_date IS NOT NULL AND el.due_date < CURRENT_DATE::text
         ORDER BY el.due_date ASC
         LIMIT 30`,
      );
    } catch { /* 古いスキーマでは JOIN が失敗するため空で返す */ }

    try {
      // 出庫 = 今日/明日に貸し出す予定 / 返却 = 今日/明日が返却予定
      todayMoves = await queryAll(
        `SELECT * FROM (
           SELECT 'out' AS kind, el.id, el.lent_at::date AS on_date, el.borrower_name,
                  ei.name AS equipment_name, ei.eq_code, p.name AS project_name, p.gls_number
           FROM equipment_lendings el
           JOIN equipment_items ei ON ei.id = el.equipment_id
           LEFT JOIN projects p ON p.id = el.project_id
           WHERE el.lent_at::date IN (CURRENT_DATE, CURRENT_DATE + 1)
           UNION ALL
           SELECT 'in' AS kind, el.id, el.due_date::date AS on_date, el.borrower_name,
                  ei.name AS equipment_name, ei.eq_code, p.name AS project_name, p.gls_number
           FROM equipment_lendings el
           JOIN equipment_items ei ON ei.id = el.equipment_id
           LEFT JOIN projects p ON p.id = el.project_id
           WHERE el.status = '${EQUIPMENT_LENDING_STATUS.LENT}'
             AND el.due_date IS NOT NULL
             AND el.due_date::date IN (CURRENT_DATE, CURRENT_DATE + 1)
         ) m
         ORDER BY m.on_date ASC, m.kind DESC
         LIMIT 40`,
      );
    } catch { /* 同上 */ }

    try {
      byType = await queryAll(
        `SELECT COALESCE(ei.equipment_type_code, '?') AS type,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM equipment_lendings el
                    WHERE el.equipment_id = ei.id AND el.status = '${EQUIPMENT_LENDING_STATUS.LENT}'
                  )
                )::int AS lent
         FROM equipment_items ei
         WHERE ei.deleted_at IS NULL
         GROUP BY COALESCE(ei.equipment_type_code, '?')
         ORDER BY COUNT(*) DESC`,
      );
    } catch { /* 同上 */ }

    return {
      overdue_lendings: overdueLendings,
      today_moves: todayMoves,
      by_type: byType,
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
