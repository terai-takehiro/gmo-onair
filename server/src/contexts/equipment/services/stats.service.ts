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
    /*
     * ⚠️ **「機材点数」の数え方を機材台帳（一覧）と揃えた**（UXレポート 2026-08-18 指摘）。
     * 以前は子機材（付属品・`parent_id IS NOT NULL`）を含めた全件を数えており、
     * 台帳一覧の既定表示（`item.service.ts` の `include_children !== '1'` のとき
     * `parent_id IS NULL`）と母数が違って「常設 1,503点」対「機材 1,000点」のように
     * 同じ「機材点数」が画面によって別の値になっていた。**親機材のみ**を数えるほうに
     * 揃える（台帳側は「付属品も出す」トグルで子機材を含められるが、既定は親のみなので
     * ダッシュボードの既定表示もそれに合わせる）。子機材込みの総数が要るときは
     * `total_items_with_children` を使う
     */
    const totalItems = (await queryOne(
      'SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL AND parent_id IS NULL',
    )) as CountRow | null;
    const totalItemsWithChildren = (await queryOne(
      'SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL',
    )) as CountRow | null;
    const activeItems = (await queryOne(
      `SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL AND parent_id IS NULL AND status='${EQUIPMENT_STATUS.ACTIVE}'`,
    )) as CountRow | null;
    const inRepair = (await queryOne(
      `SELECT COUNT(*)::int as c FROM equipment_items WHERE deleted_at IS NULL AND parent_id IS NULL AND status='${EQUIPMENT_STATUS.IN_REPAIR}'`,
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
      /*
       * ⚠️ **返却予定日が早い順（＝返却遅延が先頭）に返す。**
       * 以前は `lent_at DESC`（直近に貸し出した5件）だったため、
       * 上の `overdue`（`equipment_lendings` 全体を正確に COUNT）が
       * 5件を超える、または遅延している貸出が直近5件に入っていないと、
       * ダッシュボードの KPI タイル「返却遅延 N点」と、この一覧を絞り込む
       * 「返してもらう」セクションの遅延件数が食い違っていた。
       * `due_date` 昇順（NULL は末尾）にし、上限も5→20に上げて、
       * 遅延しているものが先頭から漏れなく出やすくする
       */
      recentLendings = await queryAll(
        `SELECT el.id, el.borrower_name, el.due_date, el.lent_at,
                ei.name as equipment_name, ei.unit_number,
                p.name as project_name, p.gls_number
         FROM equipment_lendings el
         JOIN equipment_items ei ON ei.id = el.equipment_id
         LEFT JOIN projects p ON p.id = el.project_id
         WHERE el.status = '${EQUIPMENT_LENDING_STATUS.LENT}'
         ORDER BY el.due_date IS NULL, el.due_date ASC, el.lent_at DESC LIMIT 20`,
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

    /**
     * 「本日・明日の入出庫」(モックのダッシュボード・migration 168)。
     *
     * **出庫は予定 (`status='planned'`)、入庫は返却予定日**で数える。
     * 貸出の行は持ち出した瞬間に作られるので、出す予定を `lent_at` で
     * 代用すると「まだ出していないのに貸出中」になる。
     */
    const inOut = (await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'planned' AND planned_out_date = CURRENT_DATE::text)::int  AS out_today,
         COUNT(*) FILTER (WHERE status = 'planned' AND planned_out_date = (CURRENT_DATE + 1)::text)::int AS out_tomorrow,
         COUNT(*) FILTER (WHERE status = '${EQUIPMENT_LENDING_STATUS.LENT}' AND due_date = CURRENT_DATE::text)::int AS in_today,
         COUNT(*) FILTER (WHERE status = '${EQUIPMENT_LENDING_STATUS.LENT}' AND due_date = (CURRENT_DATE + 1)::text)::int AS in_tomorrow
       FROM equipment_lendings`,
    )) as Record<string, number> | null;

    return {
      /** 本日・明日の入出庫。出庫は予定の行、入庫は返却予定日 */
      in_out: {
        out_today: Number(inOut?.out_today ?? 0),
        out_tomorrow: Number(inOut?.out_tomorrow ?? 0),
        in_today: Number(inOut?.in_today ?? 0),
        in_tomorrow: Number(inOut?.in_tomorrow ?? 0),
      },
      total_items: toInt(totalItems),
      total_items_with_children: toInt(totalItemsWithChildren),
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
