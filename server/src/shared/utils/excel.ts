// shared/utils/excel.ts — Excel共通ユーティリティ
// exceljs ベース。日本語ヘッダー対応・複数シート対応。
//
// もとは xlsx (SheetJS) だったが、既知の脆弱性 (High) に修正版が出ないため
// 既に qsheet の Excel 機能で使っていた exceljs へ寄せた (R6-b・2026-08)。
// exceljs の書き込み/読み込みは非同期なので、この層の API も async になっている。
import ExcelJS from 'exceljs';
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
export async function buildExcelWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    ws.columns = sheet.columns.map((c) => ({ width: c.width ?? Math.max(8, c.header.length * 2) }));
    ws.addRow(sheet.columns.map((c) => c.header));
    for (const row of sheet.rows) {
      ws.addRow(sheet.columns.map((c) => formatCell(row[c.key])));
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function formatCell(v: unknown): string | number | boolean {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v as string | number;
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

/** Buffer から Workbook を読む (読み手はこの1か所に集約) */
export async function loadExcelWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

/**
 * セル値 → 素の値。旧 SheetJS の `sheet_to_json({ raw: true })` に相当する層:
 *   文字列/数値/真偽値はそのまま・空は ''・リッチテキストは連結・
 *   数式は計算結果・ハイパーリンクは表示文字列。
 * 日付だけは意図的に旧挙動 (シリアル値) と違えて **ISO 文字列** にする —
 * 取込側の日付パーサ (`asDate` / `parseFlexDate` 等) は ISO を受けるので、
 * シリアル値のまま流すより安全に読める。
 */
export function excelCellRaw(v: ExcelJS.CellValue): unknown {
  if (v == null) return '';
  if (v instanceof Date) return isoDate(v);
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text?: unknown }[]).map((t) => String(t.text ?? '')).join('');
    if ('hyperlink' in o) return String(o.text ?? o.hyperlink ?? '');
    if ('error' in o) return '';
    if ('result' in o) return excelCellRaw(o.result as ExcelJS.CellValue); // 数式は結果を使う
    if ('text' in o) return String(o.text ?? '');
    return '';
  }
  return v;
}

/** セル値 → 表示文字列 (旧 SheetJS の `{ raw: false }` 相当。数値も文字列にする) */
export function excelCellText(v: ExcelJS.CellValue): string {
  const raw = excelCellRaw(v);
  if (raw === '' || raw == null) return '';
  if (typeof raw === 'boolean') return raw ? 'TRUE' : 'FALSE';
  return String(raw);
}

function isoDate(d: Date): string {
  const iso = d.toISOString();
  // 時刻が 00:00:00 (日付だけのセル) なら日付部分のみ
  return iso.slice(11, 19) === '00:00:00' ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/**
 * 1シートを AoA (行の配列) にする。空セルは ''。
 * 旧 sheet_to_json({ header: 1, defval: '' }) の置き換え。
 */
export function sheetToAoa(
  ws: ExcelJS.Worksheet,
  opts: { maxRows?: number; maxCols?: number; text?: boolean } = {},
): unknown[][] {
  const rowCount = Math.min(ws.rowCount, opts.maxRows ?? ws.rowCount);
  const colCount = Math.min(ws.columnCount, opts.maxCols ?? ws.columnCount);
  const out: unknown[][] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const arr: unknown[] = [];
    for (let c = 1; c <= colCount; c++) {
      const v = row.getCell(c).value;
      arr.push(opts.text ? excelCellText(v) : excelCellRaw(v));
    }
    out.push(arr);
  }
  return out;
}

function readWorkbookFirstSheet(wb: ExcelJS.Workbook): { data: unknown[][]; warnings: string[] } {
  const ws = wb.worksheets[0];
  if (!ws) return { data: [], warnings: ['シートが見つかりません'] };
  // 旧実装と同じ読み取り上限 (10,000 行 × 50 列)
  const data = sheetToAoa(ws, { maxRows: 10000, maxCols: 50 });
  return { data, warnings: [] };
}

/**
 * Excelの1行目(ヘッダー行)だけを取得する (マッピングUI用)
 */
export async function parseExcelHeaders(buffer: Buffer): Promise<string[]> {
  const { data } = readWorkbookFirstSheet(await loadExcelWorkbook(buffer));
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
export async function parseExcelBuffer(
  buffer: Buffer,
  columns: { key: string; header: string }[],
  mapping?: Record<string, string | null>,
): Promise<{ rows: Record<string, unknown>[]; warnings: string[] }> {
  const { data, warnings: readWarnings } = readWorkbookFirstSheet(await loadExcelWorkbook(buffer));
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
