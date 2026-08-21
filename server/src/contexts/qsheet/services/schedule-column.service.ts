/**
 * スケジュール表の列（`qsheet_schedule_columns`）— CRUD ＋ 並べ替え。
 * 実装設計: 04-schedule-impl.md §4-1（B）・§4-3
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type Row } from '../../../shared/db/connection';
import { NotFoundError, ValidationError, checkOptimisticLock } from './httpErrors';

const COL_GROUPS = ['venue', 'prep', 'ops'];

export interface CreateColumnInput {
  colGroup: string;
  label: string;
  roomId?: string | null;
  color?: string | null;
  sortOrder?: number;
}

export async function createColumn(scheduleId: string, input: CreateColumnInput): Promise<Row> {
  if (!COL_GROUPS.includes(input.colGroup)) throw new ValidationError('col_group が不正です');
  if (!input.label || !input.label.trim()) throw new ValidationError('列名を入力してください');
  if (input.colGroup !== 'venue' && input.roomId) throw new ValidationError('会場以外の列に room_id は指定できません');

  const id = uuid();
  let sortOrder = input.sortOrder;
  if (typeof sortOrder !== 'number') {
    const max = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM qsheet_schedule_columns WHERE schedule_id = $1 AND col_group = $2 AND deleted_at IS NULL',
      [scheduleId, input.colGroup],
    );
    sortOrder = ((max?.m as number) ?? -1) + 1;
  }

  await execute(
    `INSERT INTO qsheet_schedule_columns (id, schedule_id, col_group, label, room_id, color, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, scheduleId, input.colGroup, input.label.trim().slice(0, 200), input.roomId || null, input.color || null, sortOrder],
  );
  const row = await queryOne('SELECT * FROM qsheet_schedule_columns WHERE id = $1', [id]);
  if (!row) throw new Error('createColumn: INSERT 直後の SELECT が空でした');
  return row;
}

export interface UpdateColumnInput {
  label?: string;
  roomId?: string | null;
  color?: string | null;
  widthPx?: number;
  expectedUpdatedAt?: unknown;
}

export async function updateColumn(scheduleId: string, columnId: string, userId: string, input: UpdateColumnInput): Promise<Row> {
  const existing = await queryOne(
    'SELECT id, col_group, updated_at FROM qsheet_schedule_columns WHERE id = $1 AND schedule_id = $2 AND deleted_at IS NULL',
    [columnId, scheduleId],
  );
  if (!existing) throw new NotFoundError('列が見つかりません');
  // 列は updated_by を持たないので「別の人が」とは言わず「別のタブ/端末で」に統一する
  checkOptimisticLock(input.expectedUpdatedAt, { updated_at: existing.updated_at, updated_by: null }, userId, 'この列');

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  if (typeof input.label === 'string') { sets.push('label = ?'); params.push(input.label.trim().slice(0, 200)); }
  if ('roomId' in input) {
    if (existing.col_group !== 'venue' && input.roomId) throw new ValidationError('会場以外の列に room_id は指定できません');
    sets.push('room_id = ?');
    params.push(input.roomId || null);
  }
  if ('color' in input) { sets.push('color = ?'); params.push(input.color || null); }
  if (typeof input.widthPx === 'number') {
    const w = Math.round(input.widthPx);
    if (w < 80 || w > 640) throw new ValidationError('width_px は 80〜640 の範囲で指定してください');
    sets.push('width_px = ?');
    params.push(w);
  }

  await execute(`UPDATE qsheet_schedule_columns SET ${sets.join(', ')} WHERE id = ?`, [...params, columnId]);
  const row = await queryOne('SELECT * FROM qsheet_schedule_columns WHERE id = $1', [columnId]);
  if (!row) throw new Error('updateColumn: UPDATE 直後の SELECT が空でした');
  return row;
}

/** 列を消す。中の項目も同時にソフトデリートする */
export async function deleteColumn(scheduleId: string, columnId: string): Promise<number> {
  const existing = await queryOne(
    'SELECT id FROM qsheet_schedule_columns WHERE id = $1 AND schedule_id = $2 AND deleted_at IS NULL',
    [columnId, scheduleId],
  );
  if (!existing) throw new NotFoundError('列が見つかりません');

  return withTransaction(async (tx) => {
    const items = await tx.queryAll(
      'UPDATE qsheet_schedule_items SET deleted_at = NOW() WHERE column_id = ? AND deleted_at IS NULL RETURNING id',
      [columnId],
    );
    await tx.execute('UPDATE qsheet_schedule_columns SET deleted_at = NOW() WHERE id = ?', [columnId]);
    return items.length;
  });
}

interface ReorderEntry { id: string; col_group: string; sort_order: number }

/**
 * 並べ替え。`expected_updated_at` を取らない（04-schedule-impl.md §4-3）。
 * レスポンスで全列を返し、画面はそれで差し替える。
 */
export async function reorderColumns(scheduleId: string, order: ReorderEntry[]): Promise<Row[]> {
  if (!Array.isArray(order) || order.length === 0) throw new ValidationError('order を指定してください');
  for (const e of order) {
    if (typeof e.id !== 'string' || !COL_GROUPS.includes(e.col_group) || typeof e.sort_order !== 'number') {
      throw new ValidationError('order の形式が不正です');
    }
  }
  const ids = order.map((e) => e.id);
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
  const existing = await queryAll(
    `SELECT id FROM qsheet_schedule_columns WHERE schedule_id = $1 AND deleted_at IS NULL AND id IN (${placeholders})`,
    [scheduleId, ...ids],
  );
  const existingIds = new Set(existing.map((r) => r.id as string));

  await withTransaction(async (tx) => {
    for (const e of order) {
      if (!existingIds.has(e.id)) continue; // 他人が消した列は静かに無視
      await tx.execute(
        'UPDATE qsheet_schedule_columns SET col_group = ?, sort_order = ?, updated_at = NOW() WHERE id = ?',
        [e.col_group, e.sort_order, e.id],
      );
    }
  });

  return queryAll(
    `SELECT c.*, r.name AS room_name FROM qsheet_schedule_columns c
     LEFT JOIN studio_rooms r ON c.room_id = r.id
     WHERE c.schedule_id = $1 AND c.deleted_at IS NULL
     ORDER BY CASE c.col_group WHEN 'venue' THEN 0 WHEN 'prep' THEN 1 ELSE 2 END, c.sort_order`,
    [scheduleId],
  );
}
