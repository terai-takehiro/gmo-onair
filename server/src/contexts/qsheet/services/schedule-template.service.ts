/**
 * スケジュール表のひな形（`qsheet_schedule_templates` ほか2本）— CRUD。
 * `project_flow_templates`（`flow-template.service.ts`）と意図的に同じ形。
 * 実装設計: 04-schedule-impl.md §4-4・§11-1
 *
 * ⚠️ ひな形の列・項目テーブルには `deleted_at` も `updated_at` も無い（履歴を持たない設計）。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, type Row } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from './httpErrors';

const COL_GROUPS = ['venue', 'prep', 'ops'];
const ANCHORS = ['day', 'onair'];

export interface TemplateColumn {
  id: string; template_id: string; col_group: string; label: string;
  room_id: string | null; color: string | null; width_px: number; sort_order: number;
}
export interface TemplateItem {
  id: string; template_id: string; column_id: string; title: string; kind: string;
  anchor: string; offset_min: number; duration_min: number; is_required: boolean; sort_order: number;
}
export interface TemplateWithChildren {
  id: string; name: string; description: string | null; location_id: string | null;
  is_system: boolean; sort_order: number;
  columns: TemplateColumn[];
  items: TemplateItem[];
}

async function attachChildren(tpls: Row[]): Promise<TemplateWithChildren[]> {
  if (tpls.length === 0) return [];
  const ids = tpls.map((t) => t.id as string);
  const placeholders = ids.map(() => '?').join(', ');
  const columns = (await queryAll(
    `SELECT * FROM qsheet_schedule_template_columns WHERE template_id IN (${placeholders}) ORDER BY sort_order`,
    ids,
  )) as unknown as TemplateColumn[];
  const items = (await queryAll(
    `SELECT * FROM qsheet_schedule_template_items WHERE template_id IN (${placeholders}) ORDER BY sort_order`,
    ids,
  )) as unknown as TemplateItem[];

  return tpls.map((t) => ({
    id: t.id as string,
    name: t.name as string,
    description: (t.description as string | null) ?? null,
    location_id: (t.location_id as string | null) ?? null,
    is_system: !!t.is_system,
    sort_order: Number(t.sort_order) || 0,
    columns: columns.filter((c) => c.template_id === t.id),
    items: items.filter((i) => i.template_id === t.id),
  }));
}

/**
 * ひな形の一覧。`locationId` で絞る（指定拠点 ＋ location_id IS NULL を、
 * 具体的なほうを先に。`templatesFor()` と同じ作法）。
 */
export async function listTemplates(locationId?: string | null): Promise<TemplateWithChildren[]> {
  const tpls = await queryAll(
    'SELECT * FROM qsheet_schedule_templates WHERE deleted_at IS NULL ORDER BY sort_order, name',
  );
  const withChildren = await attachChildren(tpls);
  if (!locationId) return withChildren;
  const specific = withChildren.filter((t) => t.location_id === locationId);
  const generic = withChildren.filter((t) => t.location_id === null);
  return [...specific, ...generic];
}

export async function getTemplate(id: string): Promise<TemplateWithChildren> {
  const row = await queryOne('SELECT * FROM qsheet_schedule_templates WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!row) throw new NotFoundError('ひな形が見つかりません');
  const [withChildren] = await attachChildren([row]);
  return withChildren;
}

export async function createTemplate(name: string, description: string | null, locationId: string | null): Promise<string> {
  if (!name.trim()) throw new ValidationError('ひな形の名前を入力してください');
  const id = `sdtpl-${uuid().slice(0, 8)}`;
  const max = await queryOne('SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM qsheet_schedule_templates');
  await execute(
    'INSERT INTO qsheet_schedule_templates (id, name, description, location_id, is_system, sort_order) VALUES ($1, $2, $3, $4, FALSE, $5)',
    [id, name.trim(), description, locationId, ((max?.m as number) ?? 0) + 1],
  );
  return id;
}

export async function duplicateTemplate(id: string, name: string): Promise<string> {
  const tpl = await getTemplate(id);
  const newId = `sdtpl-${uuid().slice(0, 8)}`;
  const max = await queryOne('SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM qsheet_schedule_templates');
  await execute(
    'INSERT INTO qsheet_schedule_templates (id, name, description, location_id, is_system, sort_order) VALUES ($1, $2, $3, $4, FALSE, $5)',
    [newId, name.trim() || `${tpl.name} のコピー`, tpl.description, tpl.location_id, ((max?.m as number) ?? 0) + 1],
  );
  const colIdMap = new Map<string, string>();
  for (const c of tpl.columns) {
    const newColId = `sdtc-${uuid().slice(0, 8)}`;
    colIdMap.set(c.id, newColId);
    await execute(
      'INSERT INTO qsheet_schedule_template_columns (id, template_id, col_group, label, room_id, color, width_px, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [newColId, newId, c.col_group, c.label, c.room_id, c.color, c.width_px, c.sort_order],
    );
  }
  for (const i of tpl.items) {
    const newColId = colIdMap.get(i.column_id);
    if (!newColId) continue;
    await execute(
      `INSERT INTO qsheet_schedule_template_items
         (id, template_id, column_id, title, kind, anchor, offset_min, duration_min, is_required, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [`sdti-${uuid().slice(0, 8)}`, newId, newColId, i.title, i.kind, i.anchor, i.offset_min, i.duration_min, i.is_required, i.sort_order],
    );
  }
  return newId;
}

export async function updateTemplate(id: string, patch: { name?: string; description?: string | null; location_id?: string | null }): Promise<void> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  if (typeof patch.name === 'string') { sets.push('name = ?'); params.push(patch.name.trim()); }
  if ('description' in patch) { sets.push('description = ?'); params.push(patch.description ?? null); }
  if ('location_id' in patch) { sets.push('location_id = ?'); params.push(patch.location_id ?? null); }
  await execute(`UPDATE qsheet_schedule_templates SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

/** 最初から入っている型は消せない（案件をつくるときに出す物が無くなる） */
export async function removeTemplate(id: string): Promise<void> {
  const row = await queryOne('SELECT is_system FROM qsheet_schedule_templates WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!row) throw new NotFoundError('ひな形が見つかりません');
  if (row.is_system) throw new ValidationError('最初から入っている型は消せません（中身は直せます）');
  await execute('UPDATE qsheet_schedule_templates SET deleted_at = NOW() WHERE id = $1', [id]);
}

export async function addTemplateColumn(templateId: string, input: { col_group: string; label: string; room_id?: string | null; color?: string | null }): Promise<string> {
  if (!COL_GROUPS.includes(input.col_group)) throw new ValidationError('col_group が不正です');
  if (!input.label?.trim()) throw new ValidationError('列名を入力してください');
  const id = `sdtc-${uuid().slice(0, 8)}`;
  const max = await queryOne('SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM qsheet_schedule_template_columns WHERE template_id = $1', [templateId]);
  await execute(
    'INSERT INTO qsheet_schedule_template_columns (id, template_id, col_group, label, room_id, color, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, templateId, input.col_group, input.label.trim(), input.room_id || null, input.color || null, ((max?.m as number) ?? -1) + 1],
  );
  return id;
}

export async function removeTemplateColumn(columnId: string): Promise<void> {
  await execute('DELETE FROM qsheet_schedule_template_columns WHERE id = ?', [columnId]);
}

export async function addTemplateItem(
  templateId: string,
  input: { column_id: string; title: string; kind?: string; anchor?: string; offset_min?: number; duration_min?: number; is_required?: boolean },
): Promise<string> {
  if (!input.column_id) throw new ValidationError('column_id を指定してください');
  const anchor = input.anchor && ANCHORS.includes(input.anchor) ? input.anchor : 'day';
  const id = `sdti-${uuid().slice(0, 8)}`;
  const max = await queryOne('SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM qsheet_schedule_template_items WHERE template_id = $1', [templateId]);
  await execute(
    `INSERT INTO qsheet_schedule_template_items
       (id, template_id, column_id, title, kind, anchor, offset_min, duration_min, is_required, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, templateId, input.column_id, (input.title || '').trim().slice(0, 200), input.kind || 'other', anchor,
      Math.round(input.offset_min ?? 0), Math.max(1, Math.round(input.duration_min ?? 30)), input.is_required ?? true, ((max?.m as number) ?? -1) + 1],
  );
  return id;
}

export async function updateTemplateItem(
  itemId: string,
  patch: { title?: string; kind?: string; anchor?: string; offset_min?: number; duration_min?: number; is_required?: boolean },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (typeof patch.title === 'string') { sets.push('title = ?'); params.push(patch.title.trim().slice(0, 200)); }
  if (typeof patch.kind === 'string') { sets.push('kind = ?'); params.push(patch.kind); }
  if (patch.anchor && ANCHORS.includes(patch.anchor)) { sets.push('anchor = ?'); params.push(patch.anchor); }
  if (typeof patch.offset_min === 'number') { sets.push('offset_min = ?'); params.push(Math.round(patch.offset_min)); }
  if (typeof patch.duration_min === 'number') { sets.push('duration_min = ?'); params.push(Math.max(1, Math.round(patch.duration_min))); }
  if (typeof patch.is_required === 'boolean') { sets.push('is_required = ?'); params.push(patch.is_required); }
  if (sets.length === 0) return;
  await execute(`UPDATE qsheet_schedule_template_items SET ${sets.join(', ')} WHERE id = ?`, [...params, itemId]);
}

export async function removeTemplateItem(itemId: string): Promise<void> {
  await execute('DELETE FROM qsheet_schedule_template_items WHERE id = ?', [itemId]);
}
