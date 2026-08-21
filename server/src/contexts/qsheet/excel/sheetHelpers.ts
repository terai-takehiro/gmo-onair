/**
 * ExcelJS シート組み立ての共通ヘルパー（2 行ヘッダー・保護・目印）。実装設計: 03-excel.md §5。
 */
import ExcelJS from 'exceljs';
import { sheetMark, TEXT_NUM_FMT, type SheetLogicalName } from './schema';

export interface HeaderCol { key: string; label: string; width: number; locked: boolean; textFmt?: boolean }

/**
 * 2 行ヘッダー（1 行目: 日本語見出し・太字 / 2 行目: 機械キー・非表示）を書き、
 * A2 にシートの目印を入れる。データは 3 行目から書けるようになる。
 */
export function write2RowHeader(ws: ExcelJS.Worksheet, logical: SheetLogicalName, columns: HeaderCol[]): void {
  columns.forEach((col, i) => {
    const c = i + 1;
    ws.getColumn(c).width = col.width;
    const head = ws.getCell(1, c);
    head.value = col.label;
    head.font = { bold: true };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    ws.getCell(2, c).value = col.key;
    if (col.textFmt) ws.getColumn(c).numFmt = TEXT_NUM_FMT;
  });
  // シートの目印（§5-3）は最終列の 1 つ右（機械キー行）に置く。列1の機械キーと衝突させない。
  ws.getCell(2, columns.length + 1).value = sheetMark(logical);
  ws.getRow(2).hidden = true;
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

/** 既定で全セルをロックし、`unlockedCols`（1 始まり列番号）だけ編集可にしてシート保護する。パスワードは付けない（§5-6）。 */
export function protectEditableColumns(ws: ExcelJS.Worksheet, unlockedCols: number[], maxRow = 20000): void {
  const unlocked = new Set(unlockedCols);
  for (let r = 3; r <= maxRow; r++) {
    for (let c = 1; c <= ws.columnCount; c++) {
      ws.getCell(r, c).protection = { locked: !unlocked.has(c) };
    }
  }
  // ヘッダー行も編集させない
  for (let c = 1; c <= ws.columnCount; c++) {
    ws.getCell(1, c).protection = { locked: true };
    ws.getCell(2, c).protection = { locked: true };
  }
  ws.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatRows: true,
  } as any);
}

/** 定数リストのドロップダウン（`showErrorMessage` は §5-5 の「制約にしない」列で false にする）。 */
export function listValidation(options: readonly string[], opts: { allowBlank?: boolean; strict?: boolean } = {}): ExcelJS.DataValidation {
  return {
    type: 'list',
    allowBlank: opts.allowBlank ?? true,
    showErrorMessage: opts.strict ?? true,
    formulae: [`"${options.join(',')}"`],
  };
}

/** 別シートの範囲を参照するドロップダウン（定義名を使わず直接範囲参照。exceljs は範囲参照で十分動く）。 */
export function rangeValidation(sheetName: string, colLetter: string, rows: number, opts: { allowBlank?: boolean } = {}): ExcelJS.DataValidation {
  return {
    type: 'list',
    allowBlank: opts.allowBlank ?? true,
    showErrorMessage: true,
    formulae: [`'${sheetName}'!$${colLetter}$3:$${colLetter}$${Math.max(3, rows + 2)}`],
  };
}
