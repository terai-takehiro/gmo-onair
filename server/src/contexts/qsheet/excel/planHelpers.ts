/**
 * `plan.ts`（取込の下見）が使う小さい純関数群。ファイルを 400 行前後に保つための切り出し。
 */
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { STATUS_JA_TO_RAW, HIGHLIGHT_COLOR_JA_TO_HEX, normalizeHeader } from './schema';
import { findSheet, readKeyValueSheet, type TableRow } from './parseWorkbook';
import { writeBlockFields, isBlankCell, type CellCtx } from './cells';
import type { PlanSummary } from './planTypes';

export interface CurrentIndex {
  sectionIds: Set<string>;
  sectionById: Map<string, any>;
  rowById: Map<string, { row: any; sectionId: string }>;
  rowCount: number;
}
export function indexCurrent(current: any): CurrentIndex {
  const sectionIds = new Set<string>();
  const sectionById = new Map<string, any>();
  const rowById = new Map<string, { row: any; sectionId: string }>();
  let rowCount = 0;
  for (const sec of current?.sections || []) {
    if (!sec?.id) continue;
    sectionIds.add(sec.id);
    sectionById.set(sec.id, sec);
    for (const row of sec.rows || []) {
      if (!row?.id) continue;
      rowById.set(row.id, { row, sectionId: sec.id });
      rowCount++;
    }
  }
  return { sectionIds, sectionById, rowById, rowCount };
}

export function findColumn(keys: string[], headers: string[], expectedKey: string, expectedLabel: string): number {
  const idx = keys.indexOf(expectedKey);
  if (idx >= 0) return idx;
  const norm = normalizeHeader(expectedLabel);
  return headers.findIndex((h) => normalizeHeader(h) === norm);
}
export function valueAt(row: TableRow, idx: number): string | undefined {
  return idx >= 0 ? row.values[idx] : undefined;
}

/** 「台本情報」シート → `PATCH /documents/:id/meta` に渡す値（§7-1）。 */
export function buildMetaPatch(wb: ExcelJS.Workbook, warnings: string[]): Record<string, string> {
  const ws = findSheet(wb, 'info');
  if (!ws) return {};
  const kv = readKeyValueSheet(ws);
  const patch: Record<string, string> = {};
  if (kv['タイトル'] !== undefined) patch.title = kv['タイトル'];
  if (kv['放送日'] !== undefined) patch.broadcast_date = kv['放送日'];
  if (kv['状態'] !== undefined) {
    const raw = STATUS_JA_TO_RAW[kv['状態']];
    if (raw) patch.status = raw;
    else warnings.push(`「状態」の値「${kv['状態']}」は認識できないため状態は変更しません。`);
  }
  return patch;
}

export type RowOpEntry = { op: 'add' | 'update'; sectionId: string; rowId: string; patch: Record<string, any> };

export function emptySummary(): PlanSummary {
  return {
    sections: { add: 0, update: 0 }, rows: { add: 0, update: 0 },
    masters: { video: 0, audio: 0, telop: 0, persons: 0 }, ledScenes: { add: 0 }, errors: 0,
  };
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** `patch.cells` のうち現在値と同じブロックを取り除く（冪等性: 同じファイルの2回目取込で無駄な更新を出さない）。 */
export function pruneUnchangedCells(patch: Record<string, any>, existingCells: Record<string, any> | undefined): void {
  if (!patch.cells) return;
  const pruned: Record<string, unknown> = {};
  for (const [blockId, cell] of Object.entries(patch.cells)) {
    if (!sameValue(cell, existingCells?.[blockId])) pruned[blockId] = cell;
  }
  if (Object.keys(pruned).length > 0) patch.cells = pruned;
  else delete patch.cells;
}

export function mergeList(list: string[] | undefined, used: Set<string>): string[] {
  const base = Array.isArray(list) ? [...list] : [];
  for (const v of used) if (v && !base.includes(v)) base.push(v);
  return base;
}

/** 取込中に自動作成した LED シーンを ctx（呼び出しごとに新規）単位で溜める。 */
export const createdLedScenes = new WeakMap<object, any[]>();

/** ブロック列のテキストをセルへ反映し、`patch.cells[blockId]` にマージする（LED シーンの自動作成込み）。 */
export function applyBlockFieldsToPatch(
  entry: { patch: Record<string, any> },
  r: TableRow,
  resolvedBlockCols: { blockId: string; type: string; field: string; colIdx: number }[],
  ctx: CellCtx,
  warnings: string[],
  existingCells: Record<string, any> | undefined,
  usedVideo: Set<string>, usedAudio: Set<string>, usedTelop: Set<string>, usedPersons: Set<string>,
): void {
  const byBlock = new Map<string, Record<string, string | undefined>>();
  for (const bc of resolvedBlockCols) {
    const v = valueAt(r, bc.colIdx);
    if (v === undefined) continue;
    if (!byBlock.has(bc.blockId)) byBlock.set(bc.blockId, {});
    byBlock.get(bc.blockId)![bc.field] = v;
    if (bc.type === 'video' && bc.field === 'label' && v) usedVideo.add(v);
    if (bc.type === 'audio' && bc.field === 'label' && v) usedAudio.add(v);
    if (bc.type === 'telop' && bc.field === 'label' && v) usedTelop.add(v);
    if (bc.type === 'scenario' && bc.field === 'speaker' && v) usedPersons.add(v);
    // LED シーン名の自動作成（見つからない名前を初出時に作る。以後の行は ctx から解決できる）
    if (bc.type === 'led_xr' && bc.field === 'scene' && v && !ctx.ledSceneIdByName.has(v)) {
      const id = `led_${randomUUID()}`;
      ctx.ledSceneIdByName.set(v, id);
      ctx.ledSceneNameById.set(id, v);
      const list = createdLedScenes.get(ctx) || [];
      list.push({ id, name: v, wall: '', floor: '' });
      createdLedScenes.set(ctx, list);
    }
  }
  const blockTypeById = new Map(resolvedBlockCols.map((bc) => [bc.blockId, bc.type]));
  for (const [blockId, fields] of byBlock) {
    const type = blockTypeById.get(blockId)!;
    const { cell, warnings: w } = writeBlockFields(type, fields, existingCells?.[blockId], ctx);
    // 行がその型を使っていない（元々ブランク・結果もブランク）なら、空セルをわざわざ作らない
    // （§8-5 冪等性: 使っていない列のためだけに「更新」が発生しない）
    if (!(isBlankCell(type, cell) && isBlankCell(type, existingCells?.[blockId]))) {
      entry.patch.cells = entry.patch.cells || {};
      entry.patch.cells[blockId] = cell;
    }
    warnings.push(...w);
  }
}

export function applyColorToPatch(entry: { patch: Record<string, any> }, colorText: string, scenarioBlockId: string, existingCells: Record<string, any> | undefined): void {
  const v = (colorText || '').trim();
  const hex = v ? (HIGHLIGHT_COLOR_JA_TO_HEX[v] || (v.startsWith('#') ? v : undefined)) : undefined;
  const existingCell = entry.patch.cells?.[scenarioBlockId] ?? existingCells?.[scenarioBlockId] ?? {};
  const entries = Array.isArray(existingCell.entries) ? [...existingCell.entries] : [{}];
  entries[0] = { ...(entries[0] || {}), highlight: hex };
  entry.patch.cells = entry.patch.cells || {};
  entry.patch.cells[scenarioBlockId] = { ...existingCell, entries };
}
