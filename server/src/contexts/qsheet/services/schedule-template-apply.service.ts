/**
 * ひな形の下見（`preview`）と適用（`apply`）。実装設計: 04-schedule-impl.md §4-4
 *
 * - `preview` は保存しない。時刻が解決できない項目も落とさず `start_min: null` で返す。
 * - `apply` は「足すだけ」。既存の列・項目を書き換えも削除もしない。2回目の適用も許す
 *   （列グループごとに別のひな形を当てたい／当日までに会場が1つ増える、が普通にあるため）。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, withTransaction, type Row } from '../../../shared/db/connection';
import { getTemplate, type TemplateWithChildren, type TemplateColumn, type TemplateItem } from './schedule-template.service';
import { ValidationError } from './httpErrors';

interface DbClient {
  execute(sql: string, params?: unknown[]): Promise<void>;
  queryAll(sql: string, params?: unknown[]): Promise<Row[]>;
}

export interface ApplyPreviewColumn { col: TemplateColumn; already_present: boolean }
export interface ApplyPreviewItem {
  item: TemplateItem;
  start_min: number | null;
  end_min: number | null;
  already_applied: boolean;
  checked_by_default: boolean;
}
export interface ApplyPreview {
  columns: ApplyPreviewColumn[];
  items: ApplyPreviewItem[];
  requires_onair_start: boolean;
}

function resolveTimes(item: TemplateItem, onairStartMin: number | null): { start: number | null; end: number | null } {
  const base = item.anchor === 'onair' ? onairStartMin : 0;
  if (base == null) return { start: null, end: null };
  const start = base + item.offset_min;
  return { start, end: start + item.duration_min };
}

export async function previewTemplate(templateId: string, scheduleId: string, onairStartMin: number | null): Promise<ApplyPreview> {
  const tpl = await getTemplate(templateId);

  const existingCols = await queryAll(
    'SELECT col_group, label FROM qsheet_schedule_columns WHERE schedule_id = $1 AND deleted_at IS NULL',
    [scheduleId],
  );
  const existingColKeys = new Set(existingCols.map((r) => `${r.col_group}::${r.label}`));

  const existingItemTplIds = new Set(
    (await queryAll(
      `SELECT source_template_item_id FROM qsheet_schedule_items
       WHERE schedule_id = $1 AND deleted_at IS NULL AND source_template_item_id IS NOT NULL`,
      [scheduleId],
    )).map((r) => r.source_template_item_id as string),
  );

  const columns: ApplyPreviewColumn[] = tpl.columns.map((col) => ({
    col,
    already_present: existingColKeys.has(`${col.col_group}::${col.label}`),
  }));

  const items: ApplyPreviewItem[] = tpl.items.map((item) => {
    const already_applied = existingItemTplIds.has(item.id);
    const { start, end } = resolveTimes(item, onairStartMin);
    return {
      item,
      start_min: start,
      end_min: end,
      already_applied,
      checked_by_default: item.is_required && !already_applied,
    };
  });

  return { columns, items, requires_onair_start: tpl.items.some((i) => i.anchor === 'onair') };
}

export interface ApplyResult { created_columns: number; created_items: number; skipped: string[] }

async function applyCore(
  db: DbClient,
  scheduleId: string,
  templateId: string,
  tpl: TemplateWithChildren,
  columnIds: string[],
  itemIds: string[],
  onairStartMin: number | null,
): Promise<ApplyResult> {
  const existingColRows = await db.queryAll(
    'SELECT id, col_group, label FROM qsheet_schedule_columns WHERE schedule_id = ? AND deleted_at IS NULL',
    [scheduleId],
  );
  const colKeyToId = new Map(existingColRows.map((r) => [`${r.col_group}::${r.label}`, r.id as string]));

  const alreadyAppliedIds = new Set(
    (await db.queryAll(
      `SELECT source_template_item_id FROM qsheet_schedule_items
       WHERE schedule_id = ? AND deleted_at IS NULL AND source_template_item_id IS NOT NULL`,
      [scheduleId],
    )).map((r) => r.source_template_item_id as string),
  );

  const tplColById = new Map(tpl.columns.map((c) => [c.id, c]));
  const tplItemById = new Map(tpl.items.map((i) => [i.id, i]));

  let createdColumns = 0;
  for (const colId of columnIds) {
    const col = tplColById.get(colId);
    if (!col) continue;
    const key = `${col.col_group}::${col.label}`;
    if (colKeyToId.has(key)) continue; // 同じ会場・分類の列がもう有る → 作らず既存へ相乗り
    const newId = uuid();
    await db.execute(
      `INSERT INTO qsheet_schedule_columns (id, schedule_id, col_group, label, room_id, color, sort_order, source_template_id, source_template_col_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, scheduleId, col.col_group, col.label, col.room_id, col.color, col.sort_order, templateId, col.id],
    );
    colKeyToId.set(key, newId);
    createdColumns++;
  }

  let createdItems = 0;
  const skipped: string[] = [];
  for (const itemId of itemIds) {
    const item = tplItemById.get(itemId);
    if (!item) continue;
    if (alreadyAppliedIds.has(item.id)) { skipped.push(`${item.title}（すでに追加済み）`); continue; }

    const { start, end } = resolveTimes(item, onairStartMin);
    if (start == null || end == null) { skipped.push(`${item.title}（本番開始時刻が未入力のため置けません）`); continue; }
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.min(2880, end);
    if (clampedEnd <= clampedStart) { skipped.push(`${item.title}（表示できる時刻の範囲を外れました）`); continue; }

    const tplCol = tplColById.get(item.column_id);
    const actualColId = tplCol ? colKeyToId.get(`${tplCol.col_group}::${tplCol.label}`) : undefined;
    if (!actualColId) { skipped.push(`${item.title}（列が見つかりません）`); continue; }

    await db.execute(
      `INSERT INTO qsheet_schedule_items
         (id, schedule_id, column_id, title, kind, start_min, end_min, source_template_id, source_template_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), scheduleId, actualColId, item.title, item.kind, clampedStart, clampedEnd, templateId, item.id],
    );
    createdItems++;
  }

  return { created_columns: createdColumns, created_items: createdItems, skipped };
}

/** 選んだ列・項目だけを適用する（`POST /schedules/:id/apply-template`） */
export async function applyTemplate(
  scheduleId: string,
  templateId: string,
  columnIds: string[],
  itemIds: string[],
  onairStartMin: number | null,
): Promise<ApplyResult> {
  const tpl = await getTemplate(templateId);
  const selectedItems = itemIds.map((id) => tpl.items.find((i) => i.id === id)).filter((i): i is TemplateItem => !!i);
  if (selectedItems.some((i) => i.anchor === 'onair') && onairStartMin == null) {
    throw new ValidationError('本番開始時刻（onair_start_min）を入力してください');
  }
  return withTransaction((tx) => applyCore(tx, scheduleId, templateId, tpl, columnIds, itemIds, onairStartMin));
}

/**
 * ひな形をまるごと適用する（`POST /schedules` の `template_id`）。
 * 呼び出し側の `withTransaction` の中から呼ぶ想定（`schedule.service.ts` の `createSchedule`）。
 */
export async function applyTemplateAll(
  tx: DbClient,
  scheduleId: string,
  templateId: string,
  onairStartMin: number | null,
): Promise<ApplyResult> {
  const tpl = await getTemplate(templateId);
  if (tpl.items.some((i) => i.anchor === 'onair') && onairStartMin == null) {
    throw new ValidationError('このひな形には本番開始時刻からの項目が含まれます。onair_start_min を入力してください');
  }
  return applyCore(tx, scheduleId, templateId, tpl, tpl.columns.map((c) => c.id), tpl.items.map((i) => i.id), onairStartMin);
}
