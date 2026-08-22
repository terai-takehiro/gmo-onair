/**
 * 台本 `.xlsx` 書き出し（ExcelJS）。実装設計: 03-excel.md §3〜§7。
 * 「今の台本そのもの」と「空のひな形」を同じ関数から出す（§5-1）。
 */
import ExcelJS from 'exceljs';
import {
  SHEET_NAMES, SCHEMA_VERSION, FIXED_COLUMNS, COLOR_COLUMN, BLOCK_FIELD_DEFS, ROW_KIND,
  DRAFT_TYPE_RAW_TO_JA, STATUS_RAW_TO_JA, HIGHLIGHT_COLOR_JA_TO_HEX, MIC_STATE_RAW_TO_JA,
  STAGE_ELEMENT_RAW_TO_JA, LED_CUE_OPTIONS, LED_TRANSITION_OPTIONS, TEXT_NUM_FMT,
} from './schema';
import { write2RowHeader, protectEditableColumns, listValidation, rangeValidation, type HeaderCol } from './sheetHelpers';
import { flattenScript, computeBlockCols } from './rows';

export interface QsheetDocForExport {
  id: string;
  title: string;
  status: string;
  broadcast_date: string | null;
  data: any;
}

export interface BuildOptions { empty?: boolean; exportedBy?: string | null }

const STATUS_OPTIONS = Object.values(STATUS_RAW_TO_JA);
const DRAFT_OPTIONS = Object.values(DRAFT_TYPE_RAW_TO_JA);
const COLOR_OPTIONS = ['', ...Object.keys(HIGHLIGHT_COLOR_JA_TO_HEX)];

export function buildQsheetWorkbook(doc: QsheetDocForExport, opts: BuildOptions = {}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GMO ONAiR';
  wb.created = new Date();

  const data = opts.empty ? { ...doc.data, sections: [] } : (doc.data || {});
  const flat = flattenScript(data);

  buildInfoSheet(wb, doc, opts);
  buildScriptSheet(wb, data, flat, opts);
  buildMicSheet(wb, data, opts);
  buildMicChSheet(wb, data, opts);
  buildLedSheet(wb, data, opts);
  buildStageSheets(wb, data, opts);
  buildMastersSheet(wb, data, opts);
  buildExampleSheet(wb);
  buildSchemaSheet(wb, doc, flat, opts);

  return wb;
}

export function qsheetFilename(doc: QsheetDocForExport, ext: 'xlsx' | 'csv'): string {
  const title = (doc.title || doc.data?.meta?.title || 'cuesheet').replace(/[\\/:*?"<>|]/g, '_');
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${title}_${ymd}.${ext}`;
}

// ============================================================
// 1. 台本情報（info）— キー/値の 2 列
// ============================================================
function buildInfoSheet(wb: ExcelJS.Workbook, doc: QsheetDocForExport, _opts: BuildOptions): void {
  const ws = wb.addWorksheet(SHEET_NAMES.info);
  const meta = doc.data?.meta || {};
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 40;
  ws.getCell(1, 1).value = '#sheet:info';
  ws.getRow(1).hidden = true;

  const draftJa = DRAFT_TYPE_RAW_TO_JA[meta.draftType] ?? DRAFT_TYPE_RAW_TO_JA.numbered;
  const statusJa = STATUS_RAW_TO_JA[doc.status] ?? STATUS_RAW_TO_JA.draft;
  const rows: { key: string; value: unknown; locked?: boolean; validation?: ExcelJS.DataValidation }[] = [
    { key: 'タイトル', value: doc.title || meta.title || '' },
    { key: '稿種別', value: draftJa, validation: listValidation(DRAFT_OPTIONS, { strict: true }) },
    { key: '稿番号', value: meta.draftNumber ?? '' },
    { key: '放送日', value: doc.broadcast_date || meta.broadcastDate || '' },
    { key: '収録日', value: meta.recordingDate || '' },
    { key: 'リハーサル日', value: meta.rehearsalDate || '' },
    { key: '場所', value: meta.location || '' },
    { key: '作成者', value: meta.author || '' },
    { key: '台本開始時刻', value: meta.startTime || '' },
    { key: '放送開始時刻', value: meta.broadcastStartTime || '' },
    { key: '状態', value: statusJa, validation: listValidation(STATUS_OPTIONS, { strict: true }) },
    { key: '更新日時', value: meta.updatedAt || '', locked: true },
    { key: '台本ID', value: doc.id, locked: true },
  ];
  let r = 2;
  for (const row of rows) {
    const kc = ws.getCell(r, 1);
    kc.value = row.key;
    kc.font = { bold: true };
    kc.protection = { locked: true };
    const vc = ws.getCell(r, 2);
    vc.value = row.value as any;
    vc.numFmt = TEXT_NUM_FMT;
    vc.protection = { locked: !!row.locked };
    if (row.validation) vc.dataValidation = row.validation;
    r++;
  }
  ws.protect('', { selectLockedCells: true, selectUnlockedCells: true } as any);
}

// ============================================================
// 2. 進行台本（script）— 主役シート
// ============================================================
function scriptColumns(blockCols: ReturnType<typeof computeBlockCols>, hasScenario: boolean): HeaderCol[] {
  const cols: HeaderCol[] = FIXED_COLUMNS.map((c) => ({ key: c.key, label: c.label, width: c.width, locked: c.locked, textFmt: true }));
  if (hasScenario) cols.push({ key: COLOR_COLUMN.key, label: COLOR_COLUMN.label, width: COLOR_COLUMN.width, locked: false, textFmt: true });
  for (const bc of blockCols) {
    const defs = BLOCK_FIELD_DEFS[bc.type] || [];
    for (const def of defs) {
      const label = def.suffix ? `${bc.label}:${def.suffix}` : bc.label;
      cols.push({ key: `${bc.blockKey}.${def.field}`, label, width: def.width, locked: def.locked, textFmt: true });
    }
  }
  return cols;
}

function buildScriptSheet(wb: ExcelJS.Workbook, data: any, flat: ReturnType<typeof flattenScript>, _opts: BuildOptions): void {
  const ws = wb.addWorksheet(SHEET_NAMES.script);
  const columns = scriptColumns(flat.blockCols, flat.hasScenario);
  write2RowHeader(ws, 'script', columns);

  let r = 3;
  for (const rec of flat.records) {
    ws.getCell(r, 1).value = rec.kind;
    ws.getCell(r, 2).value = rec.id;
    ws.getCell(r, 3).value = rec.parentId;
    ws.getCell(r, 4).value = rec.no === '' ? '' : String(rec.no);
    ws.getCell(r, 5).value = rec.name;
    ws.getCell(r, 6).value = rec.dur;
    ws.getCell(r, 7).value = rec.rowLabel;
    let c = 8;
    if (flat.hasScenario) {
      ws.getCell(r, c).value = rec.color;
      if (rec.color && HIGHLIGHT_COLOR_JA_TO_HEX[rec.color]) {
        ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HIGHLIGHT_COLOR_JA_TO_HEX[rec.color].slice(1).toUpperCase()}` } };
      }
      c++;
    }
    for (const bc of flat.blockCols) {
      const defs = BLOCK_FIELD_DEFS[bc.type] || [];
      const fields = rec.cells[bc.blockKey] || {};
      for (const def of defs) {
        const cell = ws.getCell(r, c);
        cell.value = fields[def.field] || '';
        if (def.field === 'text') cell.alignment = { wrapText: true, vertical: 'top' };
        c++;
      }
    }
    r++;
  }

  // 入力規則（§5-5）
  const kindCol = 1, colorCol = flat.hasScenario ? 8 : -1;
  applyColumnValidation(ws, kindCol, listValidation(Object.values(ROW_KIND), { strict: true }));
  if (colorCol > 0) applyColumnValidation(ws, colorCol, listValidation(COLOR_OPTIONS));
  let c = flat.hasScenario ? 9 : 8;
  for (const bc of flat.blockCols) {
    const defs = BLOCK_FIELD_DEFS[bc.type] || [];
    for (const def of defs) {
      if (bc.type === 'scenario' && def.field === 'q') applyColumnValidation(ws, c, listValidation(['○']));
      if (bc.type === 'led_xr' && def.field === 'cue') applyColumnValidation(ws, c, listValidation(LED_CUE_OPTIONS, { strict: false }));
      if (bc.type === 'led_xr' && def.field === 'transition') applyColumnValidation(ws, c, listValidation(LED_TRANSITION_OPTIONS, { strict: false }));
      if (bc.type === 'led_xr' && def.field === 'scene') applyColumnValidation(ws, c, rangeValidation(SHEET_NAMES.led, 'B', (data?.ledScenes || []).length));
      if (bc.type === 'stage_diagram' && def.field === 'template') applyColumnValidation(ws, c, rangeValidation(SHEET_NAMES.stage, 'B', (data?.stageTemplates || []).length));
      c++;
    }
  }

  const unlocked: number[] = [];
  columns.forEach((col, i) => { if (!col.locked) unlocked.push(i + 1); });
  protectEditableColumns(ws, unlocked, Math.max(200, flat.records.length + 100));
  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 2 }];
}

function applyColumnValidation(ws: ExcelJS.Worksheet, col: number, dv: ExcelJS.DataValidation, maxRow = 200): void {
  for (let r = 3; r <= maxRow; r++) ws.getCell(r, col).dataValidation = dv;
}

// ============================================================
// 3. マイク香盤（mic）
// ============================================================
function buildMicSheet(wb: ExcelJS.Workbook, data: any, _opts: BuildOptions): void {
  const ws = wb.addWorksheet(SHEET_NAMES.mic);
  const columns: HeaderCol[] = [
    { key: 'rowId', label: '行ID', width: 16, locked: false, textFmt: true },
    { key: 'rowRef', label: '行の目印', width: 24, locked: true },
    { key: 'blockKey', label: '列', width: 14, locked: true, textFmt: true },
    { key: 'ch', label: 'Ch', width: 6, locked: false },
    { key: 'state', label: '状態', width: 8, locked: false },
    { key: 'person', label: '人', width: 14, locked: false },
    { key: 'micType', label: 'マイク種別', width: 14, locked: false },
  ];
  write2RowHeader(ws, 'mic', columns);

  const allCols = computeBlockCols(data?.blocks || []);
  const colByBlockId = new Map(allCols.map((c) => [c.blockId, c]));
  const micBlocks = (data?.blocks || []).filter((b: any) => b?.type === 'audio_mic');
  let r = 3;
  let secLabel = '';
  for (const sec of data?.sections || []) {
    if (sec?._pageBreak) continue;
    secLabel = sec?.label || (sec?._break ? 'CM' : sec?._vtr ? 'VTR' : secLabel);
    for (const row of sec?.rows || []) {
      for (const blk of micBlocks) {
        const bc = colByBlockId.get(blk.id); // 序数付き blockKey
        const cell = row.cells?.[blk.id];
        const assignments = (cell?.assignments || []).slice().sort((a: any, b: any) => a.ch - b.ch);
        for (const a of assignments) {
          ws.getCell(r, 1).value = row.id || '';
          ws.getCell(r, 2).value = `${secLabel} / ${row.label || row.duration || ''}`;
          ws.getCell(r, 3).value = bc?.blockKey || 'blk.audio_mic#1';
          ws.getCell(r, 4).value = a.ch;
          ws.getCell(r, 5).value = MIC_STATE_RAW_TO_JA[a.state] || 'OFF';
          ws.getCell(r, 6).value = a.person || '';
          ws.getCell(r, 7).value = a.micType || '';
          r++;
        }
      }
    }
  }
  applyColumnValidation(ws, 5, listValidation(Object.values(MIC_STATE_RAW_TO_JA), { strict: true }), Math.max(200, r + 200));
  applyColumnValidation(ws, 6, rangeValidation(SHEET_NAMES.masters, 'A', (data?.masters?.persons || []).length), Math.max(200, r + 200));
  applyColumnValidation(ws, 7, rangeValidation(SHEET_NAMES.masters, 'E', (data?.masters?.micTypes || []).length), Math.max(200, r + 200));
  protectEditableColumns(ws, [1, 4, 5, 6, 7], Math.max(200, r + 200));
}

// ============================================================
// 4. マイクCh（micch）
// ============================================================
function buildMicChSheet(wb: ExcelJS.Workbook, data: any, _opts: BuildOptions): void {
  const ws = wb.addWorksheet(SHEET_NAMES.micch);
  write2RowHeader(ws, 'micch', [
    { key: 'ch', label: 'Ch', width: 6, locked: false },
    { key: 'label', label: 'ラベル', width: 20, locked: false },
  ]);
  let r = 3;
  for (const ch of data?.masters?.micChannels || []) {
    ws.getCell(r, 1).value = ch.ch;
    ws.getCell(r, 2).value = ch.label || '';
    r++;
  }
  protectEditableColumns(ws, [1, 2], Math.max(100, r + 50));
}

// ============================================================
// 5. LEDシーン（led）
// ============================================================
function buildLedSheet(wb: ExcelJS.Workbook, data: any, _opts: BuildOptions): void {
  const ws = wb.addWorksheet(SHEET_NAMES.led);
  write2RowHeader(ws, 'led', [
    { key: 'id', label: 'シーンID', width: 16, locked: true, textFmt: true },
    { key: 'name', label: 'シーン名', width: 20, locked: false },
    { key: 'wall', label: '壁', width: 16, locked: false },
    { key: 'floor', label: '床', width: 16, locked: false },
  ]);
  let r = 3;
  for (const s of data?.ledScenes || []) {
    ws.getCell(r, 1).value = s.id || '';
    ws.getCell(r, 2).value = s.name || '';
    ws.getCell(r, 3).value = s.wall || '';
    ws.getCell(r, 4).value = s.floor || '';
    r++;
  }
  protectEditableColumns(ws, [2, 3, 4], Math.max(100, r + 50));
}

// ============================================================
// 6・7. 立ち位置図ひな形（stage）／立ち位置図の要素（stagepos）
// ============================================================
function buildStageSheets(wb: ExcelJS.Workbook, data: any, _opts: BuildOptions): void {
  const templates = data?.stageTemplates || [];

  const wsT = wb.addWorksheet(SHEET_NAMES.stage);
  write2RowHeader(wsT, 'stage', [
    { key: 'id', label: 'ひな形ID', width: 16, locked: true, textFmt: true },
    { key: 'name', label: 'ひな形名', width: 20, locked: false },
    { key: 'count', label: '要素数', width: 8, locked: true },
  ]);
  let rt = 3;
  for (const t of templates) {
    wsT.getCell(rt, 1).value = t.id || '';
    wsT.getCell(rt, 2).value = t.name || '';
    wsT.getCell(rt, 3).value = (t.elements || []).length;
    rt++;
  }
  protectEditableColumns(wsT, [2], Math.max(100, rt + 50));

  const wsE = wb.addWorksheet(SHEET_NAMES.stagepos);
  write2RowHeader(wsE, 'stagepos', [
    { key: 'templateId', label: 'ひな形ID', width: 16, locked: false, textFmt: true },
    { key: 'type', label: '種類', width: 8, locked: false },
    { key: 'label', label: 'ラベル', width: 16, locked: false },
    { key: 'x', label: 'X', width: 8, locked: false },
    { key: 'y', label: 'Y', width: 8, locked: false },
    { key: 'r', label: '半径', width: 8, locked: false },
    { key: 'w', label: '幅', width: 8, locked: false },
    { key: 'h', label: '高さ', width: 8, locked: false },
  ]);
  let re = 3;
  for (const t of templates) {
    for (const el of t.elements || []) {
      wsE.getCell(re, 1).value = t.id || '';
      wsE.getCell(re, 2).value = STAGE_ELEMENT_RAW_TO_JA[el.type] || el.type || '';
      wsE.getCell(re, 3).value = el.label || '';
      wsE.getCell(re, 4).value = el.x ?? '';
      wsE.getCell(re, 5).value = el.y ?? '';
      wsE.getCell(re, 6).value = el.r ?? '';
      wsE.getCell(re, 7).value = el.w ?? '';
      wsE.getCell(re, 8).value = el.h ?? '';
      re++;
    }
  }
  applyColumnValidation(wsE, 2, listValidation(['人', '四角'], { strict: true }), Math.max(200, re + 200));
  applyColumnValidation(wsE, 1, rangeValidation(SHEET_NAMES.stage, 'B', templates.length), Math.max(200, re + 200));
  protectEditableColumns(wsE, [1, 2, 3, 4, 5, 6, 7, 8], Math.max(200, re + 200));
}

// ============================================================
// 8. マスター（masters）
// ============================================================
function buildMastersSheet(wb: ExcelJS.Workbook, data: any, _opts: BuildOptions): void {
  const ws = wb.addWorksheet(SHEET_NAMES.masters);
  write2RowHeader(ws, 'masters', [
    { key: 'persons', label: '話者', width: 16, locked: false },
    { key: 'video', label: '映像ID', width: 16, locked: false },
    { key: 'audio', label: '音声ID', width: 16, locked: false },
    { key: 'telop', label: 'テロップID', width: 16, locked: false },
    { key: 'micTypes', label: 'マイク種別', width: 16, locked: false },
  ]);
  const m = data?.masters || {};
  const lists = [m.persons || [], m.video || [], m.audio || [], m.telop || [], m.micTypes || []];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    const r = i + 3;
    lists.forEach((list, c) => { if (list[i] !== undefined) ws.getCell(r, c + 1).value = list[i]; });
  }
  protectEditableColumns(ws, [1, 2, 3, 4, 5], Math.max(100, maxLen + 100));
}

// ============================================================
// 9. 記入例（example）— 罠の注意書き（§5-7）
// ============================================================
function buildExampleSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet(SHEET_NAMES.example);
  ws.getColumn(1).width = 100;
  const notes = [
    '記入例・注意（この行は読み飛ばされます）',
    '1. 尺は文字列で入れてください。「1:30」「90」「0:01:30」が使えます。Excel が時刻に変えてしまった場合はセル書式を「文字列」に戻してから入力し直してください。',
    '2. CM は種別列で「CM」を選んでください。ロール名が「CMあけトーク」でも CM 行にはなりません。',
    '3. ID 列を消さないでください。消すと「新しい行」として増えます（元の行は残ります）。',
    '4. 列を消しても構いません。消した列の内容は変更されません（消えません）。',
    '5. 行を並べ替えるときは行ごと切り取り／挿入してください。オートフィルタでの並べ替えは付けていません。',
    '6. 画像はここでは変えられません。画像の追加・差し替えはアプリの画面で行ってください。',
    '7. 新しい行を追加するときは ID 列を空にしてください。マイク香盤シートからその行を指したいときだけ、自分で覚えやすい名前（例: 新1）を ID 列に入れてください。',
    '8. 取込は自分ひとりで編集しているときに行ってください。他の人と同時に編集していると、並べ替えた行の他人の変更が取りこぼされることがあります。',
  ];
  notes.forEach((text, i) => {
    const c = ws.getCell(i + 1, 1);
    c.value = text;
    if (i === 0) c.font = { bold: true };
    c.alignment = { wrapText: true };
  });
}

// ============================================================
// 10. _schema（veryHidden）
// ============================================================
function buildSchemaSheet(wb: ExcelJS.Workbook, doc: QsheetDocForExport, flat: ReturnType<typeof flattenScript>, opts: BuildOptions): void {
  const ws = wb.addWorksheet(SHEET_NAMES.schema, { state: 'veryHidden' });
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 80;
  const blocksJson = JSON.stringify((doc.data?.blocks || []).map((b: any) => ({
    key: flat.blockCols.find((c) => c.type === b.type && c.label === (b.label || b.type))?.blockKey,
    blockId: b.id, type: b.type, label: b.label || b.type,
  })));
  const rows: [string, string][] = [
    ['schemaVersion', String(SCHEMA_VERSION)],
    ['appVersion', process.env.npm_package_version || ''],
    ['documentId', doc.id],
    ['exportedAt', new Date().toISOString()],
    ['exportedBy', opts.exportedBy || ''],
    ['blocks', blocksJson],
  ];
  rows.forEach(([k, v], i) => {
    ws.getCell(i + 1, 1).value = k;
    ws.getCell(i + 1, 2).value = v;
  });
}
