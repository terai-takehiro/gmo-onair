/**
 * スケジュール表の項目（`qsheet_schedule_items`）— CRUD ＋ 一括更新（ドラッグ確定）。
 * 実装設計: 04-schedule-impl.md §4-1（B）・§4-2
 */
import { v4 as uuid } from 'uuid';
import { queryOne, execute, withTransaction, type Row } from '../../../shared/db/connection';
import { ITEM_KINDS } from '../../../shared/schedule/kinds';
import { NotFoundError, ValidationError, HttpError, checkOptimisticLock } from './httpErrors';

function withLinkBroken(row: Row): Row {
  return { ...row, link_broken: !!row.link_broken };
}

async function fetchItem(itemId: string): Promise<Row | undefined> {
  return queryOne(
    `SELECT i.*, (i.qsheet_document_id IS NOT NULL AND d.id IS NULL) AS link_broken
     FROM qsheet_schedule_items i
     LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
     WHERE i.id = $1 AND i.deleted_at IS NULL`,
    [itemId],
  );
}

/**
 * 横串（列をまたぐ項目 = Excel のセル結合。migration 280）の検査。
 * 0 = 全列・1 = 自分の列だけ・N = 自分の列から右へ N 列。上限 64（DB の CHECK と同じ）。
 */
function normalizeSpanCols(v: unknown): number {
  if (!Number.isFinite(v as number)) throw new ValidationError('span_cols は数値で指定してください');
  const n = Math.round(v as number);
  if (n < 0 || n > 64) throw new ValidationError('span_cols は 0〜64 で指定してください');
  return n;
}

function validateSpan(startMin: number, endMin: number): void {
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) throw new ValidationError('start_min / end_min は数値で指定してください');
  if (endMin <= startMin) throw new ValidationError('end_min は start_min より後にしてください');
  if (startMin < 0 || endMin > 2880) throw new ValidationError('時刻は 0〜2880 分の範囲で指定してください');
}

export interface CreateItemInput {
  columnId: string;
  title?: string;
  kind?: string;
  startMin: number;
  endMin: number;
  /** 横串（0 = 全列・1 = 自分の列だけ・N = 右へ N 列）。省略は 1 */
  spanCols?: number;
  assignee?: string | null;
  note?: string | null;
}

export async function createItem(scheduleId: string, input: CreateItemInput): Promise<Row> {
  const column = await queryOne(
    'SELECT id FROM qsheet_schedule_columns WHERE id = $1 AND schedule_id = $2 AND deleted_at IS NULL',
    [input.columnId, scheduleId],
  );
  if (!column) throw new ValidationError('column_id が不正です');

  const kind = input.kind && ITEM_KINDS.includes(input.kind as (typeof ITEM_KINDS)[number]) ? input.kind : 'other';
  validateSpan(input.startMin, input.endMin);

  const spanCols = input.spanCols === undefined ? 1 : normalizeSpanCols(input.spanCols);

  const id = uuid();
  await execute(
    `INSERT INTO qsheet_schedule_items (id, schedule_id, column_id, title, kind, start_min, end_min, span_cols, assignee, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, scheduleId, input.columnId, (input.title ?? '').slice(0, 500), kind, Math.round(input.startMin), Math.round(input.endMin), spanCols, input.assignee || null, input.note || null],
  );
  const row = await fetchItem(id);
  if (!row) throw new Error('createItem: INSERT 直後の SELECT が空でした');
  return withLinkBroken(row);
}

export interface UpdateItemInput {
  columnId?: string;
  title?: string;
  kind?: string;
  startMin?: number;
  endMin?: number;
  spanCols?: number;
  assignee?: string | null;
  note?: string | null;
  expectedUpdatedAt?: unknown;
}

export async function updateItem(scheduleId: string, itemId: string, userId: string, input: UpdateItemInput): Promise<Row> {
  const existing = await queryOne(
    'SELECT id, start_min, end_min, updated_at FROM qsheet_schedule_items WHERE id = $1 AND schedule_id = $2 AND deleted_at IS NULL',
    [itemId, scheduleId],
  );
  if (!existing) throw new NotFoundError('項目が見つかりません');
  checkOptimisticLock(input.expectedUpdatedAt, { updated_at: existing.updated_at, updated_by: null }, userId, 'この項目');

  const nextStart = typeof input.startMin === 'number' ? input.startMin : (existing.start_min as number);
  const nextEnd = typeof input.endMin === 'number' ? input.endMin : (existing.end_min as number);
  if (typeof input.startMin === 'number' || typeof input.endMin === 'number') validateSpan(nextStart, nextEnd);

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  if (typeof input.columnId === 'string') {
    const column = await queryOne(
      'SELECT id FROM qsheet_schedule_columns WHERE id = $1 AND schedule_id = $2 AND deleted_at IS NULL',
      [input.columnId, scheduleId],
    );
    if (!column) throw new ValidationError('column_id が不正です');
    sets.push('column_id = ?');
    params.push(input.columnId);
  }
  if (typeof input.title === 'string') { sets.push('title = ?'); params.push(input.title.slice(0, 500)); }
  if (typeof input.kind === 'string') {
    if (!ITEM_KINDS.includes(input.kind as (typeof ITEM_KINDS)[number])) throw new ValidationError('kind が不正です');
    sets.push('kind = ?');
    params.push(input.kind);
  }
  if (typeof input.startMin === 'number') { sets.push('start_min = ?'); params.push(Math.round(input.startMin)); }
  if (typeof input.endMin === 'number') { sets.push('end_min = ?'); params.push(Math.round(input.endMin)); }
  if (input.spanCols !== undefined) { sets.push('span_cols = ?'); params.push(normalizeSpanCols(input.spanCols)); }
  if ('assignee' in input) { sets.push('assignee = ?'); params.push(input.assignee || null); }
  if ('note' in input) { sets.push('note = ?'); params.push(input.note || null); }

  await execute(`UPDATE qsheet_schedule_items SET ${sets.join(', ')} WHERE id = ?`, [...params, itemId]);
  const row = await fetchItem(itemId);
  if (!row) throw new Error('updateItem: UPDATE 直後の SELECT が空でした');
  return withLinkBroken(row);
}

export async function deleteItem(scheduleId: string, itemId: string): Promise<void> {
  const existing = await queryOne(
    'SELECT id FROM qsheet_schedule_items WHERE id = $1 AND schedule_id = $2 AND deleted_at IS NULL',
    [itemId, scheduleId],
  );
  if (!existing) throw new NotFoundError('項目が見つかりません');
  await execute('UPDATE qsheet_schedule_items SET deleted_at = NOW() WHERE id = $1', [itemId]);
}

export interface BulkEntry {
  id: string;
  columnId?: string;
  startMin?: number;
  endMin?: number;
  expectedUpdatedAt?: unknown;
}

/**
 * ドラッグ確定。1件でも 409 なら全部やめる（1トランザクション。§4-2）。
 * 競合した id の配列を投げる（ConflictError の extra に積む）。
 */
export async function bulkUpdateItems(scheduleId: string, userId: string, entries: BulkEntry[]): Promise<Row[]> {
  if (!Array.isArray(entries) || entries.length === 0) throw new ValidationError('items を指定してください');

  return withTransaction(async (tx) => {
    const conflicts: string[] = [];
    for (const e of entries) {
      if (typeof e.id !== 'string') throw new ValidationError('items[].id が不正です');
      const existing = await tx.queryOne(
        'SELECT id, start_min, end_min, updated_at FROM qsheet_schedule_items WHERE id = ? AND schedule_id = ? AND deleted_at IS NULL',
        [e.id, scheduleId],
      );
      if (!existing) throw new NotFoundError('項目が見つかりません');

      if (typeof e.expectedUpdatedAt === 'string' && e.expectedUpdatedAt) {
        const expectedMs = new Date(e.expectedUpdatedAt).getTime();
        const currentMs = new Date(existing.updated_at as string).getTime();
        if (Number.isFinite(expectedMs) && Number.isFinite(currentMs) && expectedMs !== currentMs) {
          conflicts.push(e.id);
        }
      }
    }
    if (conflicts.length > 0) {
      throw new HttpError(409, 'CONFLICT', '一部の項目が他の人によって更新されています。競合した項目は元の位置に戻ります。', { conflicts });
    }

    for (const e of entries) {
      const sets: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      if (typeof e.columnId === 'string') { sets.push('column_id = ?'); params.push(e.columnId); }
      if (typeof e.startMin === 'number') { sets.push('start_min = ?'); params.push(Math.round(e.startMin)); }
      if (typeof e.endMin === 'number') { sets.push('end_min = ?'); params.push(Math.round(e.endMin)); }
      await tx.execute(`UPDATE qsheet_schedule_items SET ${sets.join(', ')} WHERE id = ?`, [...params, e.id]);
    }

    const ids = entries.map((e) => e.id);
    const placeholders = ids.map(() => '?').join(', ');
    return tx.queryAll(
      `SELECT i.*, (i.qsheet_document_id IS NOT NULL AND d.id IS NULL) AS link_broken
       FROM qsheet_schedule_items i
       LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
       WHERE i.id IN (${placeholders})`,
      ids,
    );
  });
}
