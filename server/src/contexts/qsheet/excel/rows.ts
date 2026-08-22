/**
 * 進行台本シート（script）の行データを組み立てる（書き出し方向・唯一の正）。
 * `.xlsx` の「進行台本」シートも `.csv` も、ここで作った `ScriptRecord[]` から出す
 * （実装設計 03-excel.md §1-2「CSV 書き出しが2本あって出力が違う」を再発させない）。
 */
import { ROW_KIND, machineKey, HIGHLIGHT_COLOR_HEX_TO_JA } from './schema';
import { readBlockFields, type CellCtx } from './cells';

export interface BlockCol { blockId: string; blockKey: string; type: string; label: string; ordinal: number }

export interface ScriptRecord {
  kind: string;
  id: string;
  parentId: string;
  no: number | '';
  name: string;
  dur: string;
  rowLabel: string;
  color: string;
  cells: Record<string, Record<string, string>>; // blockKey -> { field: text }
}

/** `data.blocks` から列一覧を作る（同型ブロックは型内で 1 始まりの序数を振る。§4-3）。 */
export function computeBlockCols(blocks: any[]): BlockCol[] {
  const counters: Record<string, number> = {};
  return (blocks || []).filter((b) => b && b.id && b.type).map((b) => {
    const ordinal = (counters[b.type] = (counters[b.type] || 0) + 1);
    return { blockId: b.id, blockKey: machineKey(b.type, ordinal, '').replace(/\.$/, ''), type: b.type, label: b.label || b.type, ordinal };
  });
}

function buildCtx(data: any): CellCtx {
  const ledSceneNameById = new Map<string, string>();
  const ledSceneIdByName = new Map<string, string>();
  for (const s of data?.ledScenes || []) {
    if (!s?.id) continue;
    ledSceneNameById.set(s.id, s.name || '');
    if (s.name) ledSceneIdByName.set(s.name, s.id);
  }
  const stageTemplateNameById = new Map<string, string>();
  const stageTemplateIdByName = new Map<string, string>();
  for (const t of data?.stageTemplates || []) {
    if (!t?.id) continue;
    stageTemplateNameById.set(t.id, t.name || '');
    if (t.name) stageTemplateIdByName.set(t.name, t.id);
  }
  return { ledSceneNameById, ledSceneIdByName, stageTemplateNameById, stageTemplateIdByName };
}
export { buildCtx };

function colorLabel(hex: string | undefined): string {
  if (!hex) return '';
  return HIGHLIGHT_COLOR_HEX_TO_JA[hex] || hex;
}

/** scenario ブロックの highlight を「行の色」として読む（実装は entries[0].highlight。§5-8 の注記）。 */
function rowColor(row: any, scenarioBlockId: string | null): string {
  if (!scenarioBlockId) return '';
  const en = (row?.cells?.[scenarioBlockId]?.entries || [])[0];
  return colorLabel(en?.highlight);
}

export interface FlattenResult { records: ScriptRecord[]; blockCols: BlockCol[]; hasScenario: boolean }

export function flattenScript(data: any): FlattenResult {
  const blocks: any[] = data?.blocks || [];
  const blockCols = computeBlockCols(blocks);
  const scenarioBlock = blocks.find((b) => b?.type === 'scenario') || null;
  const ctx = buildCtx(data);
  const records: ScriptRecord[] = [];
  let no = 1;

  for (const sec of data?.sections || []) {
    if (!sec || typeof sec !== 'object') continue;
    if (sec._pageBreak) {
      records.push({ kind: ROW_KIND.PAGE_BREAK, id: sec.id || '', parentId: '', no: '', name: '', dur: '', rowLabel: '', color: '', cells: {} });
      continue;
    }
    const kind = sec._break ? ROW_KIND.BREAK : sec._vtr ? ROW_KIND.VTR : ROW_KIND.SECTION;
    records.push({
      kind, id: sec.id || '', parentId: '', no: '', name: sec.label || '', dur: sec.duration || '', rowLabel: '', color: '', cells: {},
    });
    for (const row of sec.rows || []) {
      if (!row || typeof row !== 'object') continue;
      const cells: Record<string, Record<string, string>> = {};
      for (const bc of blockCols) {
        cells[bc.blockKey] = readBlockFields(bc.type, row.cells?.[bc.blockId], ctx);
      }
      records.push({
        kind: ROW_KIND.ROW,
        id: row.id || '',
        parentId: sec.id || '',
        no: no++,
        name: '',
        dur: row.duration || '',
        rowLabel: row.label || '',
        color: rowColor(row, scenarioBlock?.id || null),
        cells,
      });
    }
  }

  return { records, blockCols, hasScenario: !!scenarioBlock };
}
