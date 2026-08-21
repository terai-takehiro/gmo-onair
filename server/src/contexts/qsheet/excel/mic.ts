/**
 * マイク香盤シートの取込。実装設計 03-excel.md §7-2。`plan.ts` から切り出し。
 */
import ExcelJS from 'exceljs';
import { MIC_STATE_JA_TO_RAW } from './schema';
import { findSheet, readTableSheet } from './parseWorkbook';
import { findColumn, valueAt, type CurrentIndex } from './planHelpers';

export function applyMicSheet(
  wb: ExcelJS.Workbook, current: any, idx: CurrentIndex, rowAliasMap: Map<string, string>,
  blockCols: { blockId: string; blockKey: string; type: string }[], warnings: string[],
): { byRowId: Map<string, Record<string, unknown>> } {
  const byRowId = new Map<string, Record<string, unknown>>();
  const ws = findSheet(wb, 'mic');
  if (!ws) return { byRowId };
  const { rows, keys, headers } = readTableSheet(ws);
  const idxRowId = findColumn(keys, headers, 'rowId', '行ID');
  const idxBlockKey = findColumn(keys, headers, 'blockKey', '列');
  const idxCh = findColumn(keys, headers, 'ch', 'Ch');
  const idxState = findColumn(keys, headers, 'state', '状態');
  const idxPerson = findColumn(keys, headers, 'person', '人');
  const idxMicType = findColumn(keys, headers, 'micType', 'マイク種別');
  const micBlocks = blockCols.filter((b) => b.type === 'audio_mic');
  const defaultBlockId = micBlocks[0]?.blockId;

  const grouped = new Map<string, any[]>(); // `${rowId}|${blockId}` -> assignments
  for (const r of rows) {
    const rowIdText = (valueAt(r, idxRowId) || '').trim();
    if (!rowIdText) continue;
    const resolvedRowId = idx.rowById.has(rowIdText) ? rowIdText : rowAliasMap.get(rowIdText);
    if (!resolvedRowId) {
      warnings.push(`マイク香盤シート${r.sheetRow}行目: 行ID「${rowIdText}」が見つかりません。`);
      continue;
    }
    const blockKeyText = idxBlockKey >= 0 ? (valueAt(r, idxBlockKey) || '').trim() : '';
    const blockId = (blockKeyText && micBlocks.find((b) => b.blockKey === blockKeyText)?.blockId) || defaultBlockId;
    if (!blockId) { warnings.push(`マイク香盤シート${r.sheetRow}行目: マイク香盤ブロックが台本に無いため無視しました。`); continue; }
    const ch = Number(valueAt(r, idxCh));
    if (!Number.isFinite(ch)) continue;
    const stateJa = (valueAt(r, idxState) || '').trim();
    const state = MIC_STATE_JA_TO_RAW[stateJa] || 'off';
    const key = `${resolvedRowId}|${blockId}`;
    const list = grouped.get(key) || [];
    list.push({ ch, state, person: valueAt(r, idxPerson) || '', micType: valueAt(r, idxMicType) || '' });
    grouped.set(key, list);
  }

  for (const [key, list] of grouped) {
    const [rowId, blockId] = key.split('|');
    const patch = byRowId.get(rowId) || {};
    patch[blockId] = { assignments: list.sort((a, b) => a.ch - b.ch) };
    byRowId.set(rowId, patch);
  }
  return { byRowId };
}
