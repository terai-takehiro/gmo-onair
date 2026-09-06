/**
 * スケジュール表の Excel 書き出し（ExcelJS・3シート）。実装設計: 04-schedule-impl.md §7
 *
 * ⚠️ `shared/utils/excel.ts`（SheetJS）は1文字も触らない。台本用（03）とも
 * 互いに import しない（README §2 の「Excel は共通化しない」の趣旨。02 も独立させる）。
 */
import ExcelJS from 'exceljs';
import { fmtHmPad, secToMinCeil } from '../../../shared/schedule/time';
import { ITEM_KIND_DEFS, COL_GROUP_LABEL, type ColGroup } from '../../../shared/schedule/kinds';
import type { ItemBreakdown } from '../services/schedule-breakdown.service';

export interface WorkbookColumn {
  id: string;
  col_group: ColGroup;
  label: string;
  room_name: string | null;
  sort_order: number;
}
export interface WorkbookItem {
  id: string;
  column_id: string;
  title: string;
  kind: string;
  start_min: number;
  end_min: number;
  /** 横串（0 = 全列・1 = 自分の列だけ・N = 右へ N 列。migration 280） */
  span_cols?: number;
  assignee: string | null;
  note: string | null;
  qsheet_document_id: string | null;
  link_broken: boolean;
}
export interface WorkbookSchedule {
  title: string;
  service_date: string;
  location_name: string | null;
  view_start_min: number;
  view_end_min: number;
  slot_min: number;
}

const GROUP_ORDER: ColGroup[] = ['venue', 'prep', 'ops'];
const KIND_FILL = new Map<string, string>(ITEM_KIND_DEFS.map((d) => [d.kind, d.color]));

function fill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } };
}

function buildGridSheet(wb: ExcelJS.Workbook, schedule: WorkbookSchedule, columns: WorkbookColumn[], items: WorkbookItem[]): void {
  const ws = wb.addWorksheet('スケジュール表', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] });
  const sorted = [...columns].sort((a, b) => GROUP_ORDER.indexOf(a.col_group) - GROUP_ORDER.indexOf(b.col_group) || a.sort_order - b.sort_order);

  ws.getColumn(1).width = 10;
  ws.getCell(1, 1).value = '時刻';
  ws.getCell(2, 1).value = '';

  // 1行目: グループ見出しを結合、2行目: 列名
  let col = 2;
  for (const group of GROUP_ORDER) {
    const inGroup = sorted.filter((c) => c.col_group === group);
    if (inGroup.length === 0) continue;
    const startCol = col;
    for (const c of inGroup) {
      ws.getColumn(col).width = 18;
      ws.getCell(2, col).value = c.col_group === 'venue' ? (c.room_name || c.label) : c.label;
      col++;
    }
    ws.getCell(1, startCol).value = COL_GROUP_LABEL[group];
    if (col - 1 > startCol) ws.mergeCells(1, startCol, 1, col - 1);
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { bold: true };

  const slotMin = schedule.slot_min;
  const viewStart = schedule.view_start_min;
  const viewEnd = schedule.view_end_min;
  const rowCount = Math.max(1, Math.ceil((viewEnd - viewStart) / slotMin));
  const firstDataRow = 3;
  const lastDataRow = firstDataRow + rowCount - 1;

  for (let r = 0; r < rowCount; r++) {
    ws.getCell(firstDataRow + r, 1).value = fmtHmPad(viewStart + r * slotMin);
  }

  const colIndexOf = new Map(sorted.map((c, i) => [c.id, i + 2]));
  const occupied = new Set<string>(); // "row:col"

  // 横串（列をまたぐ項目）は「セルの結合」で描く。規則は shared/src/schedule/span.ts と同じ
  // （サーバーは server/src/ の外を import できないため、ここに短く書き写している）。
  // 幅の広い項目から先に置く — 先に置いた項目とぶつかった側を落とす仕組みなので、
  // 1列の項目が先に場所を取ると横串が丸ごと消えてしまう。
  const spanCount = (item: WorkbookItem): number => {
    const v = item.span_cols ?? 1;
    if (v === 0) return sorted.length;
    return Math.max(1, Math.floor(v));
  };
  const placedFirst = [...items].sort((a, b) => spanCount(b) - spanCount(a));

  for (const item of placedFirst) {
    const c = colIndexOf.get(item.column_id);
    if (!c) continue;
    // 覆う列の範囲（全列は表の左端から。右に足りなければ、ある所までに詰める）
    const startCol = (item.span_cols ?? 1) === 0 ? 2 : c;
    const endCol = Math.min(sorted.length + 1, startCol + spanCount(item) - 1);
    let startRow = firstDataRow + Math.floor((item.start_min - viewStart) / slotMin);
    let endRow = firstDataRow + Math.ceil((item.end_min - viewStart) / slotMin) - 1;
    startRow = Math.max(firstDataRow, startRow);
    endRow = Math.min(lastDataRow, endRow);
    if (startRow > endRow) continue; // 表示範囲の外

    // 既に埋まっているセルと衝突するときは書かない（Excel はセルの二重結合を許さない）
    let collides = false;
    for (let r = startRow; r <= endRow; r++) {
      for (let cc = startCol; cc <= endCol; cc++) if (occupied.has(`${r}:${cc}`)) collides = true;
    }
    if (collides) continue;
    for (let r = startRow; r <= endRow; r++) {
      for (let cc = startCol; cc <= endCol; cc++) occupied.add(`${r}:${cc}`);
    }

    const cell = ws.getCell(startRow, startCol);
    cell.value = item.title || '（無題）';
    cell.fill = fill(KIND_FILL.get(item.kind) ?? 'F2F2F2');
    cell.alignment = { vertical: 'top', wrapText: true };
    if (endRow > startRow || endCol > startCol) ws.mergeCells(startRow, startCol, endRow, endCol);
  }

  ws.getColumn(1).font = { bold: true };
}

function buildListSheet(wb: ExcelJS.Workbook, columns: WorkbookColumn[], items: WorkbookItem[], breakdownByItem: Map<string, ItemBreakdown>): void {
  const ws = wb.addWorksheet('項目一覧');
  const colLabel = new Map(columns.map((c) => [c.id, c.col_group === 'venue' ? (c.room_name || c.label) : c.label]));
  const kindLabel = new Map<string, string>(ITEM_KIND_DEFS.map((d) => [d.kind, d.label]));

  ws.columns = [
    { header: '開始', key: 'start', width: 8 },
    { header: '終了', key: 'end', width: 8 },
    { header: '所要(分)', key: 'durationMin', width: 10 },
    { header: '列', key: 'col', width: 16 },
    { header: '横串', key: 'span', width: 8 },
    { header: '区分', key: 'kind', width: 10 },
    { header: '項目名', key: 'title', width: 28 },
    { header: '担当', key: 'assignee', width: 16 },
    { header: '備考', key: 'note', width: 28 },
    { header: '台本', key: 'doc', width: 10 },
    // ⚠️ stage_label（進み具合の判定式）は出さない（§7-3・§12-5）。事実の数だけ。
    { header: 'ロール数', key: 'sections', width: 10 },
    { header: '行数', key: 'rows', width: 8 },
    { header: '台本の尺(分)', key: 'docMin', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const item of [...items].sort((a, b) => a.start_min - b.start_min)) {
    const b = breakdownByItem.get(item.id);
    const docTotalSec = b?.doc_total_sec ?? null;
    ws.addRow({
      start: fmtHmPad(item.start_min),
      end: fmtHmPad(item.end_min),
      durationMin: item.end_min - item.start_min,
      col: colLabel.get(item.column_id) ?? '',
      span: (item.span_cols ?? 1) === 0 ? '全列' : ((item.span_cols ?? 1) > 1 ? `${item.span_cols}列` : ''),
      kind: kindLabel.get(item.kind) ?? item.kind,
      title: item.title,
      assignee: item.assignee ?? '',
      note: item.note ?? '',
      doc: item.qsheet_document_id ? (item.link_broken ? '（消えています）' : 'あり') : '',
      sections: b?.section_count ?? '',
      rows: b?.row_count ?? '',
      docMin: docTotalSec != null ? secToMinCeil(docTotalSec) : '',
    });
  }
}

function buildLegendSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet('凡例');
  ws.columns = [
    { header: '区分', key: 'kind', width: 16 },
    { header: '色', key: 'color', width: 12 },
    { header: '説明', key: 'note', width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const d of ITEM_KIND_DEFS) {
    const row = ws.addRow({ kind: d.label, color: '', note: '' });
    row.getCell('color').fill = fill(d.color);
  }
}

export function buildScheduleWorkbook(
  schedule: WorkbookSchedule,
  columns: WorkbookColumn[],
  items: WorkbookItem[],
  breakdown: ItemBreakdown[],
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GMO ONAiR';
  wb.created = new Date();

  const breakdownByItem = new Map(breakdown.map((b) => [b.item_id, b]));
  buildGridSheet(wb, schedule, columns, items);
  buildListSheet(wb, columns, items, breakdownByItem);
  buildLegendSheet(wb);
  return wb;
}

/** ファイル名。`/` などは `_` に置換（§7-4） */
export function scheduleFilename(schedule: WorkbookSchedule): string {
  const place = (schedule.location_name || schedule.title || 'スケジュール表').replace(/[\\/:*?"<>|]/g, '_');
  return `スケジュール表_${schedule.service_date}_${place}.xlsx`;
}
