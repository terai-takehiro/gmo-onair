// shared/utils/excel.ts — Excel共通ユーティリティ
// xlsx (SheetJS) ベース。日本語ヘッダー対応・複数シート対応。
import * as XLSX from 'xlsx';
import { Response } from 'express';

export interface SheetSpec {
  /** シート名 (日本語可、31文字以内) */
  name: string;
  /** カラム定義: { key, header, width? } */
  columns: { key: string; header: string; width?: number }[];
  /** データ行 (key→value のオブジェクト配列) */
  rows: Record<string, unknown>[];
}

/**
 * 複数シートのワークブックを生成してBufferで返す
 */
export function buildExcelWorkbook(sheets: SheetSpec[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const headers = sheet.columns.map((c) => c.header);
    const data: unknown[][] = [headers];
    for (const row of sheet.rows) {
      data.push(sheet.columns.map((c) => formatCell(row[c.key])));
    }
    const ws = XLSX.utils.aoa_to_sheet(data);
    // 列幅設定
    ws['!cols'] = sheet.columns.map((c) => ({ wch: c.width ?? Math.max(8, c.header.length * 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function formatCell(v: unknown): unknown {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/**
 * Excel ファイルをHTTPレスポンスとして送信
 */
export function excelResponse(res: Response, filename: string, buffer: Buffer): void {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}

/**
 * BufferからExcelをパースして1シート目の行をオブジェクト配列で返す
 * 1行目を日本語ヘッダーとし、columnsで定義した key にマッピング
 */
export function parseExcelBuffer(
  buffer: Buffer,
  columns: { key: string; header: string }[],
): { rows: Record<string, unknown>[]; warnings: string[] } {
  const wb = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: false,
    cellStyles: false,
    cellHTML: false,
    cellNF: false,
    sheetStubs: false,
  });
  const wsName = wb.SheetNames[0];
  if (!wsName) return { rows: [], warnings: ['シートが見つかりません'] };
  const ws = wb.Sheets[wsName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (data.length < 2) return { rows: [], warnings: ['データ行がありません'] };

  const headerRow = (data[0] || []).map((h) => String(h ?? '').trim());
  const warnings: string[] = [];

  // 日本語ヘッダーから key へのマッピング
  const headerToKey = new Map<string, string>();
  for (const col of columns) {
    const idx = headerRow.indexOf(col.header);
    if (idx === -1) {
      warnings.push(`列 "${col.header}" が見つかりません — スキップします`);
      continue;
    }
    headerToKey.set(String(idx), col.key);
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r] || [];
    if (row.every((v) => v === '' || v == null)) continue; // 空行スキップ
    const obj: Record<string, unknown> = {};
    for (const [idxStr, key] of headerToKey.entries()) {
      const v = row[Number(idxStr)];
      obj[key] = v === '' ? null : v;
    }
    rows.push(obj);
  }
  return { rows, warnings };
}
