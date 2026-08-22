// Qシート 同時共同編集 (Phase 2.2b) — Y.Doc 粒度操作の語彙
//
// 安定 ID (Phase 0) をキーに section/row を特定して Y 構造を直接操作する。
// index ではなく id で探すことで、他ユーザーの挿入/削除で index がずれても正しい対象を編集できる。
// これらの操作は useCollabDoc の mutate() (= ydoc.transact(fn,'local')) の中で呼ぶ想定。

import * as Y from 'yjs';
import { toYValue, fromYValue } from '@gmo-onair/shared/src/collab/yjsDoc';
import { genId } from '../stableIds';

type YMap = Y.Map<any>;
type YArr = Y.Array<any>;

/**
 * 挿入する section / row に id が無ければ付ける。
 * **id 無しの Y ノードを 1 つも作らせない**のがこの関数の役割。
 * id が無いと差分器 (ydocDiff) が毎回「まだ無いもの」と判定し、編集のたびに再追加して
 * 倍々に増える (CSV 取込が id を付けていなかったときに実際に起きた)。
 */
function withId(node: any, prefix: 'sec' | 'row'): any {
  if (!node || typeof node !== 'object') return node;
  let out = node;
  if (!out.id) out = { ...out, id: genId(prefix) };
  if (prefix === 'sec' && Array.isArray(out.rows) && out.rows.some((r: any) => r && typeof r === 'object' && !r.id)) {
    out = { ...out, rows: out.rows.map((r: any) => withId(r, 'row')) };
  }
  return out;
}

/**
 * Y.Doc に既に入っている id 無しの section / row に id を後付けする (変更があれば true)。
 * 旧版が書き込んだ文書を開いたときの回復用。**差分を取る前に呼ぶこと** —
 * 後から呼ぶと、その回の差分がまだ id 無しの prev/next を見て増殖させてしまう。
 */
export function backfillIds(ydoc: Y.Doc): boolean {
  let changed = false;
  const secs = getSections(ydoc);
  for (let i = 0; i < secs.length; i++) {
    const sec = secs.get(i);
    if (!(sec instanceof Y.Map)) continue;
    if (!sec.get('id')) {
      sec.set('id', genId('sec'));
      changed = true;
    }
    const rows = sec.get('rows');
    if (!(rows instanceof Y.Array)) continue;
    for (let j = 0; j < rows.length; j++) {
      const row = rows.get(j);
      if (row instanceof Y.Map && !row.get('id')) {
        row.set('id', genId('row'));
        changed = true;
      }
    }
  }
  return changed;
}

export function getSections(ydoc: Y.Doc): YArr {
  return ydoc.getArray('sections');
}

/** 現在の section id 一覧 (順序どおり)。差分の並び替え照合に使う。 */
export function listSectionIds(ydoc: Y.Doc): string[] {
  const arr = getSections(ydoc);
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i);
    if (m instanceof Y.Map) out.push(m.get('id'));
  }
  return out;
}

/** 指定 section の現在の row id 一覧 (順序どおり)。 */
export function listRowIds(ydoc: Y.Doc, sectionId: string): string[] {
  const sec = findSection(ydoc, sectionId);
  if (!sec) return [];
  const rows = sec.get('rows');
  if (!(rows instanceof Y.Array)) return [];
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const m = rows.get(i);
    if (m instanceof Y.Map) out.push(m.get('id'));
  }
  return out;
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
export function deleteMeta(ydoc: Y.Doc, key: string): void {
  ydoc.getMap('meta').delete(key);
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
  arr.insert(idx, [toYValue(withId(section, 'sec'))]);
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
export function deleteSectionField(ydoc: Y.Doc, sectionId: string, field: string): void {
  const sec = findSection(ydoc, sectionId);
  if (sec) sec.delete(field);
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
export function deleteRowField(ydoc: Y.Doc, sectionId: string, rowId: string, field: string): void {
  const row = findRow(ydoc, sectionId, rowId);
  if (row) row.delete(field);
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
  rows.insert(idx, [toYValue(withId(row, 'row'))]);
}
export function deleteRowCell(ydoc: Y.Doc, sectionId: string, rowId: string, blockId: string): void {
  const row = findRow(ydoc, sectionId, rowId);
  if (!row) return;
  const cells = row.get('cells');
  if (cells instanceof Y.Map) cells.delete(blockId);
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
