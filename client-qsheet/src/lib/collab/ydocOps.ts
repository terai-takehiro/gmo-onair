// Qシート 同時共同編集 (Phase 2.2b) — Y.Doc 粒度操作の語彙
//
// 安定 ID (Phase 0) をキーに section/row を特定して Y 構造を直接操作する。
// index ではなく id で探すことで、他ユーザーの挿入/削除で index がずれても正しい対象を編集できる。
// これらの操作は useCollabDoc の mutate() (= ydoc.transact(fn,'local')) の中で呼ぶ想定。

import * as Y from 'yjs';
import { toYValue, fromYValue } from '@gmo-onair/shared/src/collab/yjsDoc';

type YMap = Y.Map<any>;
type YArr = Y.Array<any>;

export function getSections(ydoc: Y.Doc): YArr {
  return ydoc.getArray('sections');
}

function indexById(arr: YArr, id: string): number {
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i);
    if (m instanceof Y.Map && m.get('id') === id) return i;
  }
  return -1;
}

export function findSection(ydoc: Y.Doc, sectionId: string): YMap | null {
  const arr = getSections(ydoc);
  const i = indexById(arr, sectionId);
  return i >= 0 ? (arr.get(i) as YMap) : null;
}

function ensureRows(section: YMap): YArr {
  let rows = section.get('rows');
  if (!(rows instanceof Y.Array)) {
    rows = new Y.Array<any>();
    section.set('rows', rows);
  }
  return rows as YArr;
}

function ensureCells(row: YMap): YMap {
  let cells = row.get('cells');
  if (!(cells instanceof Y.Map)) {
    cells = new Y.Map<any>();
    row.set('cells', cells);
  }
  return cells as YMap;
}

export function findRow(ydoc: Y.Doc, sectionId: string, rowId: string): YMap | null {
  const sec = findSection(ydoc, sectionId);
  if (!sec) return null;
  const rows = ensureRows(sec);
  const i = indexById(rows, rowId);
  return i >= 0 ? (rows.get(i) as YMap) : null;
}

// ── meta / masters / blocks / extras (低頻度・粒度荒め) ──
export function setMeta(ydoc: Y.Doc, key: string, value: unknown): void {
  ydoc.getMap('meta').set(key, toYValue(value));
}
export function setMastersList(ydoc: Y.Doc, key: string, list: unknown): void {
  ydoc.getMap('masters').set(key, toYValue(list));
}
export function setBlocks(ydoc: Y.Doc, blocks: unknown[]): void {
  const arr = ydoc.getArray('blocks');
  if (arr.length) arr.delete(0, arr.length);
  arr.push((blocks || []).map(toYValue));
}
export function setExtra(ydoc: Y.Doc, key: string, value: unknown): void {
  ydoc.getMap('extras').set(key, toYValue(value));
}

// ── section 構造 ──
export function addSection(ydoc: Y.Doc, section: any, atIndex?: number): void {
  const arr = getSections(ydoc);
  const idx = atIndex === undefined ? arr.length : Math.max(0, Math.min(atIndex, arr.length));
  arr.insert(idx, [toYValue(section)]);
}
export function deleteSection(ydoc: Y.Doc, sectionId: string): void {
  const arr = getSections(ydoc);
  const i = indexById(arr, sectionId);
  if (i >= 0) arr.delete(i, 1);
}
export function setSectionField(ydoc: Y.Doc, sectionId: string, field: string, value: unknown): void {
  const sec = findSection(ydoc, sectionId);
  if (sec) sec.set(field, toYValue(value));
}
export function moveSection(ydoc: Y.Doc, sectionId: string, toIndex: number): void {
  const arr = getSections(ydoc);
  const from = indexById(arr, sectionId);
  if (from < 0) return;
  // Yjs には配列の atomic move が無いため clone を delete+insert する
  const clone = fromYValue(arr.get(from));
  arr.delete(from, 1);
  const to = Math.max(0, Math.min(toIndex, arr.length));
  arr.insert(to, [toYValue(clone)]);
}

// ── row 構造 ──
export function setRowField(ydoc: Y.Doc, sectionId: string, rowId: string, field: string, value: unknown): void {
  const row = findRow(ydoc, sectionId, rowId);
  if (row) row.set(field, toYValue(value));
}
/** 1 セル (blockId) をまるごと置き換える (セル単位 LWW)。 */
export function setRowCell(ydoc: Y.Doc, sectionId: string, rowId: string, blockId: string, cell: unknown): void {
  const row = findRow(ydoc, sectionId, rowId);
  if (row) ensureCells(row).set(blockId, toYValue(cell));
}
/** afterRowId の直後に行を挿入 (null なら末尾)。 */
export function insertRowAfter(ydoc: Y.Doc, sectionId: string, afterRowId: string | null, row: any): void {
  const sec = findSection(ydoc, sectionId);
  if (!sec) return;
  const rows = ensureRows(sec);
  let idx = rows.length;
  if (afterRowId) {
    const at = indexById(rows, afterRowId);
    if (at >= 0) idx = at + 1;
  }
  rows.insert(idx, [toYValue(row)]);
}
export function deleteRow(ydoc: Y.Doc, sectionId: string, rowId: string): void {
  const sec = findSection(ydoc, sectionId);
  if (!sec) return;
  const rows = ensureRows(sec);
  const i = indexById(rows, rowId);
  if (i >= 0) rows.delete(i, 1);
}
export function moveRow(ydoc: Y.Doc, sectionId: string, rowId: string, toIndex: number): void {
  const sec = findSection(ydoc, sectionId);
  if (!sec) return;
  const rows = ensureRows(sec);
  const from = indexById(rows, rowId);
  if (from < 0) return;
  const clone = fromYValue(rows.get(from)); // move 中は CRDT identity を失う (documented)
  rows.delete(from, 1);
  const to = Math.max(0, Math.min(toIndex, rows.length));
  rows.insert(to, [toYValue(clone)]);
}
