/**
 * CSV 書き出し。`.xlsx` の「進行台本」シートと**同じ `flattenScript()`** から出す
 * （実装設計 03-excel.md §1-2・§2「CSV が2本あって出力が違う」を再発させない）。
 * CSV は他システムへ渡す片道の書き出し専用（取込は `.xlsx` に一本化。§1）。
 */
import { FIXED_COLUMNS, COLOR_COLUMN, BLOCK_FIELD_DEFS } from './schema';
import { flattenScript } from './rows';

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildQsheetCsv(data: any): string {
  const flat = flattenScript(data);
  const headers = [...FIXED_COLUMNS.map((c) => c.label)];
  if (flat.hasScenario) headers.push(COLOR_COLUMN.label);
  for (const bc of flat.blockCols) {
    const defs = BLOCK_FIELD_DEFS[bc.type] || [];
    for (const def of defs) headers.push(def.suffix ? `${bc.label}:${def.suffix}` : bc.label);
  }

  const lines = [headers.map(csvEscape).join(',')];
  for (const rec of flat.records) {
    const row: string[] = [rec.kind, rec.id, rec.parentId, rec.no === '' ? '' : String(rec.no), rec.name, rec.dur, rec.rowLabel];
    if (flat.hasScenario) row.push(rec.color);
    for (const bc of flat.blockCols) {
      const defs = BLOCK_FIELD_DEFS[bc.type] || [];
      const fields = rec.cells[bc.blockKey] || {};
      for (const def of defs) row.push(fields[def.field] || '');
    }
    lines.push(row.map(csvEscape).join(','));
  }
  return '﻿' + lines.join('\r\n');
}
