// shared/utils/excel.ts — Excel共通ユーティリティ
// xlsx (SheetJS) ベース。日本語ヘッダー対応・複数シート対応。
import * as XLSX from 'xlsx';
import { Response } from 'express';
import { safeReadWorkbook } from './xlsx-safe';

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

// ヘッダー正規化 (NFKC: 半角カナ→全角カナ、全角英数→半角等) + 空白除去
export const normalizeHeader = (v: unknown): string =>
  String(v ?? '').normalize('NFKC').replace(/\s+/g, '').trim();

function readWorkbookFirstSheet(buffer: Buffer): { data: unknown[][]; warnings: string[] } {
  const wb = safeReadWorkbook(buffer, {
    cellFormula: false,
    cellStyles: false,
    cellHTML: false,
    cellNF: false,
    sheetStubs: false,
  });
  const wsName = wb.SheetNames[0];
  if (!wsName) return { data: [], warnings: ['シートが見つかりません'] };
  const ws = wb.Sheets[wsName];
  const rawRef = ws['!ref'];
  let limitedRange: XLSX.Range | undefined;
  if (rawRef) {
    const r = XLSX.utils.decode_range(rawRef);
    r.e.r = Math.min(r.e.r, 9999);
    r.e.c = Math.min(r.e.c, 49);
    limitedRange = r;
  }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', range: limitedRange }) as unknown[][];
  return { data, warnings: [] };
}

/**
 * Excelの1行目(ヘッダー行)だけを取得する (マッピングUI用)
 */
export function parseExcelHeaders(buffer: Buffer): string[] {
  const { data } = readWorkbookFirstSheet(buffer);
  if (!data[0]) return [];
  return (data[0] as unknown[]).map((h) => String(h ?? '').trim()).filter((h) => h !== '');
}

/**
 * BufferからExcelをパースして1シート目の行をオブジェクト配列で返す
 * 1行目を日本語ヘッダーとし、columnsで定義した key にマッピング
 *
 * mapping が指定された場合は自動マッチを上書き:
 *   { [columnKey]: excelHeaderName | null }
 *   null を指定すると明示的にスキップ
 */
export function parseExcelBuffer(
  buffer: Buffer,
  columns: { key: string; header: string }[],
  mapping?: Record<string, string | null>,
): { rows: Record<string, unknown>[]; warnings: string[] } {
  const { data, warnings: readWarnings } = readWorkbookFirstSheet(buffer);
  if (readWarnings.length) return { rows: [], warnings: readWarnings };
  if (data.length < 2) return { rows: [], warnings: ['データ行がありません'] };

  const rawHeaderRow = (data[0] || []).map((h) => String(h ?? '').trim());
  const normHeaderRow = rawHeaderRow.map(normalizeHeader);
  const warnings: string[] = [];

  // 期待される列 → Excelの列インデックス へマッピング
  const headerToKey = new Map<number, string>();
  const trackedIndexes: number[] = [];
  for (const col of columns) {
    let idx = -1;
    if (mapping && col.key in mapping) {
      const explicit = mapping[col.key];
      if (explicit === null || explicit === '') continue; // 明示的スキップ
      // 明示指定されたExcelヘッダー名で検索 (生値で完全一致)
      idx = rawHeaderRow.indexOf(explicit);
      if (idx === -1) {
        // 正規化してフォールバック
        const n = normalizeHeader(explicit);
        idx = normHeaderRow.indexOf(n);
      }
    } else {
      // 自動マッチ (正規化後に一致)
      idx = normHeaderRow.indexOf(normalizeHeader(col.header));
    }
    if (idx === -1) {
      warnings.push(`列 "${col.header}" が見つかりません — スキップします`);
      continue;
    }
    headerToKey.set(idx, col.key);
    trackedIndexes.push(idx);
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r] || [];
    const allTrackedEmpty = trackedIndexes.every((i) => {
      const v = row[i];
      return v === '' || v == null;
    });
    if (allTrackedEmpty) continue;
    const obj: Record<string, unknown> = {};
    for (const [idx, key] of headerToKey.entries()) {
      const v = row[idx];
      obj[key] = v === '' ? null : v;
    }
    rows.push(obj);
  }
  return { rows, warnings };
}
