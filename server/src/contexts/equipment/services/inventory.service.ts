/**
 * equipment/services/inventory.service.ts — Phase 3 v2.6.10
 * 棚卸しのロジック層。
 * 作成時 + 同期時に「現在 deleted/disposed 以外の機材を全件 check items に追加」する処理を共通化。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  INVENTORY_STATUS,
  EQUIPMENT_STATUS,
} from '../../../shared/constants/statuses';

export interface CreateInput {
  title: string;
  check_date: string;
  notes?: string | null;
}

export interface UpdateItemInput {
  found?: boolean | null;
  actual_location?: string | null;
  condition?: string | null;
  note?: string | null;
}

interface ActiveItem {
  id: string;
  location_name: string | null;
  location_detail: string | null;
}

/**
 * 棚卸し対象になる機材を一覧取得 (削除・廃棄は除外)
 */
async function listActiveEquipment(): Promise<ActiveItem[]> {
  return (await queryAll(`
    SELECT ei.id, el.name as location_name, ei.location_detail
    FROM equipment_items ei
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL AND ei.status != '${EQUIPMENT_STATUS.DISPOSED}'
  `)) as unknown as ActiveItem[];
}

/**
 * inventory_check_items にバッチ INSERT。1 クエリで多行投入する。
 */
async function batchInsertCheckItems(checkId: string, items: ActiveItem[]) {
  if (items.length === 0) return;
  const vals: string[] = [];
  const prms: unknown[] = [];
  items.forEach((item, idx) => {
    const base = idx * 4;
    vals.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4})`);
    prms.push(uuid(), checkId, item.id, item.location_name || item.location_detail || null);
  });
  await execute(
    `INSERT INTO inventory_check_items (id, check_id, equipment_id, expected_location) VALUES ${vals.join(',')}`,
    prms,
  );
}

export const inventoryService = {
  async list() {
    return queryAll('SELECT * FROM inventory_checks ORDER BY check_date DESC');
  },

  async create(input: CreateInput, userId: string | null): Promise<{ id: string }> {
    const id = uuid();
    await execute(
      'INSERT INTO inventory_checks (id, title, check_date, status, checked_by, notes) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, input.title, input.check_date, INVENTORY_STATUS.DRAFT, userId, input.notes ?? null],
    );
    await batchInsertCheckItems(id, await listActiveEquipment());
    return { id };
  },

  async getById(id: string) {
    const check = await queryOne('SELECT * FROM inventory_checks WHERE id=$1', [id]);
    if (!check) throw new AppError(404, 'NOT_FOUND', '棚卸しが見つかりません');

    const items = await queryAll(
      `SELECT ici.*, ei.name as equipment_name, ei.eq_code, ei.unit_number,
              ei.location_detail, el.name as location_name,
              COALESCE(el.sort_order, 9999) as location_sort
       FROM inventory_check_items ici
       JOIN equipment_items ei ON ei.id = ici.equipment_id
       LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
       WHERE ici.check_id = $1
       ORDER BY location_sort, el.name NULLS LAST, ei.location_detail NULLS LAST, ei.name, ei.unit_number`,
      [id],
    );
    return { ...(check as Record<string, unknown>), items };
  },

  async updateItem(checkId: string, itemId: string, input: UpdateItemInput) {
    await execute(
      `UPDATE inventory_check_items SET found=$1, actual_location=$2, condition=$3, note=$4, checked_at=NOW()
       WHERE id=$5 AND check_id=$6`,
      [
        input.found ?? null,
        input.actual_location ?? null,
        input.condition ?? null,
        input.note ?? null,
        itemId,
        checkId,
      ],
    );
  },

  async updateStatus(id: string, status: string) {
    const valid: string[] = Object.values(INVENTORY_STATUS);
    if (!valid.includes(status)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'status の値が不正です');
    }
    await execute('UPDATE inventory_checks SET status=$1, updated_at=NOW() WHERE id=$2', [status, id]);
  },

  async delete(id: string) {
    const check = await queryOne('SELECT id FROM inventory_checks WHERE id=$1', [id]);
    if (!check) throw new AppError(404, 'NOT_FOUND', '棚卸しが見つかりません');
    await execute('DELETE FROM inventory_check_items WHERE check_id=$1', [id]);
    await execute('DELETE FROM inventory_checks WHERE id=$1', [id]);
  },

  /** 既存の棚卸しに、その後追加された機材を補充する */
  async sync(id: string): Promise<{ added: number }> {
    const check = await queryOne('SELECT id FROM inventory_checks WHERE id=$1', [id]);
    if (!check) throw new AppError(404, 'NOT_FOUND', '棚卸しが見つかりません');

    const existing = (await queryAll(
      'SELECT equipment_id FROM inventory_check_items WHERE check_id=$1',
      [id],
    )) as { equipment_id: string }[];
    const existingIds = new Set(existing.map((e) => e.equipment_id));

    const all = await listActiveEquipment();
    const toInsert = all.filter((item) => !existingIds.has(item.id));
    await batchInsertCheckItems(id, toInsert);

    return { added: toInsert.length };
  },
};
