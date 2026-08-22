/**
 * アップロードされた `.xlsx` を汎用の行データへ読む（低レベル読み取りのみ・業務判断はしない）。
 * 実装設計 03-excel.md §5-2〜§5-3（2 行ヘッダー・シートの目印）に対応。
 */
import ExcelJS from 'exceljs';
import { sheetMark, normalizeHeader, type SheetLogicalName } from './schema';

/** シートを論理名で探す。まず A2 系の目印を全シート走査、無ければシート名の完全一致。 */
export function findSheet(wb: ExcelJS.Workbook, logical: SheetLogicalName): ExcelJS.Worksheet | null {
  const mark = sheetMark(logical);
  for (const ws of wb.worksheets) {
    const row2 = ws.getRow(2);
    for (let c = 1; c <= Math.min(row2.cellCount + 1, 400); c++) {
      if (String(row2.getCell(c).value ?? '') === mark) return ws;
    }
  }
  const byName = wb.worksheets.find((ws) => normalizeHeader(ws.name) === normalizeHeader(mark.replace('#sheet:', '')));
  return byName || null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const anyV = v as any;
    if (anyV.richText) return anyV.richText.map((t: any) => t.text).join('');
    if (anyV.text) return String(anyV.text);
    if (anyV.result != null) return String(anyV.result);
    return '';
  }
  return String(v).trim();
}

export interface TableRow { sheetRow: number; byKey: Record<string, string>; byHeader: Record<string, string>; values: string[] }

/**
 * 「1 行目=日本語見出し・2 行目=機械キー（非表示）・3 行目〜=データ」の共通形を読む。
 * 完全な空行（全セル空）は無視する。
 */
export function readTableSheet(ws: ExcelJS.Worksheet): { rows: TableRow[]; headers: string[]; keys: string[] } {
  const headerRow = ws.getRow(1);
  const keyRow = ws.getRow(2);
  const colCount = Math.max(headerRow.cellCount, keyRow.cellCount);
  const headers: string[] = [];
  const keys: string[] = [];
  for (let c = 1; c <= colCount; c++) {
    const key = cellText(keyRow.getCell(c).value);
    if (key.startsWith('#sheet:')) break; // シートの目印セルより先は列ではない
    headers.push(cellText(headerRow.getCell(c).value));
    keys.push(key);
  }

  const rows: TableRow[] = [];
  const maxRow = Math.min(ws.rowCount, 20000);
  for (let r = 3; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const byKey: Record<string, string> = {};
    const byHeader: Record<string, string> = {};
    const values: string[] = [];
    let hasContent = false;
    for (let c = 1; c <= headers.length; c++) {
      const text = cellText(row.getCell(c).value);
      if (text !== '') hasContent = true;
      values.push(text);
      if (keys[c - 1]) byKey[keys[c - 1]] = text;
      if (headers[c - 1]) byHeader[headers[c - 1]] = text;
    }
    if (!hasContent) continue;
    rows.push({ sheetRow: r, byKey, byHeader, values });
  }
  return { rows, headers, keys };
}

/** 「台本情報」シートのキー/値レイアウトを読む（列1=日本語キー・列2=値）。 */
export function readKeyValueSheet(ws: ExcelJS.Worksheet): Record<string, string> {
  const out: Record<string, string> = {};
  const maxRow = Math.min(ws.rowCount, 100);
  for (let r = 2; r <= maxRow; r++) {
    const key = cellText(ws.getCell(r, 1).value);
    if (!key) continue;
    out[key] = cellText(ws.getCell(r, 2).value);
  }
  return out;
}
