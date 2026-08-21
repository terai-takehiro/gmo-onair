/**
 * `get_qsheet`（MCP・段10 / 05-mcp.md §4-3）。
 *
 * 台本全文を既定で返さない — `data` 1本で数百 KB になり得るため、
 * `mode` で outline（既定）/ section / full を選ばせ、`include_text` で本文の有無を選ばせる。
 * セルは `blk.<type>#<n>`（blockRef）をキーに1行のテキストへ畳んで返す（03 の機械キーと共通）。
 */
import { queryAll, queryOne } from '../../../../shared/db/connection';
import { AppError } from '../../../../shared/middleware/errorHandler';
import { docTotalSec } from '../../../../shared/schedule/time';
import { blockRefTable, type BlockLike } from '../../../../shared/qsheet/blockRef';
import { isBlockType } from '../../../../shared/qsheet/blockTypes';

const MAX_FULL_ROWS = 400;
const TEXT_PREVIEW_LEN = 120;

type Json = Record<string, unknown>;

interface DocRow {
  id: string;
  title: string;
  doc_no: string | null;
  status: string;
  data: Json;
  project_id: string | null;
  created_by: string | null;
}

export async function fetchDocForRead(documentId: string): Promise<DocRow | null> {
  const row = await queryOne(
    'SELECT id, title, doc_no, status, data, project_id, created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL',
    [documentId],
  );
  if (!row) return null;
  const raw = row.data;
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Json | undefined;
  return {
    id: row.id as string,
    title: row.title as string,
    doc_no: (row.doc_no as string) ?? null,
    status: row.status as string,
    data: data && typeof data === 'object' ? data : {},
    project_id: (row.project_id as string) ?? null,
    created_by: (row.created_by as string) ?? null,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function draftLabelOf(meta: Json): { draftType: 'numbered' | '準備稿' | '決定稿'; draftNumber: number | null; draftLabel: string } {
  const rawType = typeof meta.draftType === 'string' ? meta.draftType : 'numbered';
  if (rawType === '準備稿' || rawType === '決定稿') {
    return { draftType: rawType, draftNumber: null, draftLabel: rawType };
  }
  const draftNumber = typeof meta.draftNumber === 'number' ? meta.draftNumber : 1;
  return { draftType: 'numbered', draftNumber, draftLabel: `第${draftNumber}稿` };
}

async function stageTemplateNames(): Promise<Map<string, string>> {
  const rows = await queryAll('SELECT id, name FROM qsheet_stage_templates WHERE deleted_at IS NULL ORDER BY name');
  return new Map(rows.map((r) => [r.id as string, r.name as string]));
}

// ============================================================
// outline
// ============================================================
export interface QsheetOutline {
  id: string;
  docNo: string | null;
  title: string;
  status: string;
  meta: {
    draftType: 'numbered' | '準備稿' | '決定稿';
    draftNumber: number | null;
    draftLabel: string;
    broadcastDate?: string;
    startTime?: string;
    broadcastStartTime?: string;
    location?: string;
    author?: string;
  };
  blocks: { ref: string; blockId: string; type: string; label: string }[];
  sections: { id: string; label: string; duration: string | null; rowCount: number; marker: 'break' | 'pageBreak' | 'vtr' | null }[];
  totals: { sections: number; rows: number; totalSec: number; durationText: string | null };
  masters: { persons: string[]; video: string[]; audio: string[]; telop: string[]; micTypes: string[]; micChannels: { ch: number; label?: string }[] };
  ledScenes: { id: string; name: string }[];
  stageTemplates: { id: string; name: string }[];
}

function fmtDurationText(totalSec: number): string | null {
  if (!totalSec) return null;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

export async function getQsheetOutline(doc: DocRow): Promise<QsheetOutline> {
  const data = doc.data;
  const meta = (data.meta && typeof data.meta === 'object' ? data.meta : {}) as Json;
  const blocks = Array.isArray(data.blocks) ? (data.blocks as BlockLike[]) : [];
  const refTable = blockRefTable(blocks);
  const sections = Array.isArray(data.sections) ? (data.sections as Json[]) : [];
  const masters = (data.masters && typeof data.masters === 'object' ? data.masters : {}) as Json;
  const ledScenes = Array.isArray(data.ledScenes) ? (data.ledScenes as Json[]) : [];

  const totalSec = docTotalSec(
    sections.map((s) => ({
      duration: s.duration as string | number | null,
      rows: Array.isArray(s.rows) ? (s.rows as Json[]).map((r) => ({ duration: r.duration as string | number | null })) : [],
    })),
    { preferRoleDuration: true },
  );
  const rowCount = sections.reduce((n, s) => n + (Array.isArray(s.rows) ? (s.rows as unknown[]).length : 0), 0);

  return {
    id: doc.id,
    docNo: doc.doc_no,
    title: doc.title,
    status: doc.status,
    meta: {
      ...draftLabelOf(meta),
      broadcastDate: typeof meta.broadcastDate === 'string' ? meta.broadcastDate : undefined,
      startTime: typeof meta.startTime === 'string' ? meta.startTime : undefined,
      broadcastStartTime: typeof meta.broadcastStartTime === 'string' ? meta.broadcastStartTime : undefined,
      location: typeof meta.location === 'string' ? meta.location : undefined,
      author: typeof meta.author === 'string' ? meta.author : undefined,
    },
    blocks: blocks
      .filter((b) => b?.id && b?.type)
      .map((b) => ({ ref: refTable.get(b.id) ?? '', blockId: b.id, type: String(b.type), label: String(b.label ?? '') })),
    sections: sections.map((s) => ({
      id: String(s.id ?? ''),
      label: String(s.label ?? ''),
      duration: typeof s.duration === 'string' ? s.duration : null,
      rowCount: Array.isArray(s.rows) ? (s.rows as unknown[]).length : 0,
      marker: s._break ? 'break' : s._pageBreak ? 'pageBreak' : s._vtr ? 'vtr' : null,
    })),
    totals: { sections: sections.length, rows: rowCount, totalSec, durationText: fmtDurationText(totalSec) },
    masters: {
      persons: Array.isArray(masters.persons) ? (masters.persons as string[]) : [],
      video: Array.isArray(masters.video) ? (masters.video as string[]) : [],
      audio: Array.isArray(masters.audio) ? (masters.audio as string[]) : [],
      telop: Array.isArray(masters.telop) ? (masters.telop as string[]) : [],
      micTypes: Array.isArray(masters.micTypes) ? (masters.micTypes as string[]) : [],
      micChannels: Array.isArray(masters.micChannels) ? (masters.micChannels as { ch: number; label?: string }[]) : [],
    },
    ledScenes: ledScenes.map((s) => ({ id: String(s.id ?? ''), name: String(s.name ?? '') })),
    stageTemplates: [...(await stageTemplateNames())].map(([id, name]) => ({ id, name })),
  };
}

// ============================================================
// rows（セルを blockRef キーの1行テキストへ畳む）
// ============================================================
export interface QsheetRowsSection {
  sectionId: string;
  label: string;
  rows: { id: string; label: string | null; duration: string | null; cells: Record<string, string> }[];
  truncated: boolean;
}

function formatCell(type: string, cell: unknown, ctx: { includeText: boolean; ledScenes: Map<string, string>; stageTemplates: Map<string, string> }): string {
  const c = cell && typeof cell === 'object' ? (cell as Json) : {};
  if (type === 'scenario') {
    const entry = (Array.isArray(c.entries) ? c.entries[0] : null) as Json | null;
    if (!entry) return '';
    const name = String(entry.name ?? '');
    const html = stripHtml(String(entry.html ?? ''));
    if (!ctx.includeText) {
      const preview = html.length > TEXT_PREVIEW_LEN ? `${html.slice(0, TEXT_PREVIEW_LEN)}…` : html;
      return `${name}｜(${preview.length}字)`;
    }
    return `${name}｜${html}`;
  }
  if (type === 'video' || type === 'audio' || type === 'telop') {
    const entry = (Array.isArray(c.entries) ? c.entries[0] : null) as Json | null;
    if (!entry) return '';
    return `${String(entry.label ?? '')}｜${String(entry.memo ?? '')}`;
  }
  if (type === 'audio_mic') {
    const assignments = Array.isArray(c.assignments) ? (c.assignments as Json[]) : [];
    return assignments
      .slice()
      .sort((a, b) => Number(a.ch ?? 0) - Number(b.ch ?? 0))
      .map((a) => `ch${a.ch}:${a.person ?? ''}(${a.micType ?? ''}/${a.state ?? ''})`)
      .join(' ');
  }
  if (type === 'led_xr') {
    const entry = (Array.isArray(c.entries) ? c.entries[0] : null) as Json | null;
    if (!entry) return '';
    const sceneName = typeof entry.sceneId === 'string' ? ctx.ledScenes.get(entry.sceneId) ?? '' : '';
    return `${sceneName}｜${entry.cueType ?? ''}｜${entry.transition ?? ''}`;
  }
  if (type === 'stage_diagram') {
    const name = typeof c.templateId === 'string' ? ctx.stageTemplates.get(c.templateId) ?? '' : '';
    return `${name}｜${c.note ?? ''}`;
  }
  if (type === 'slide') {
    // 06-editor.md §3 で書き込み経路を作るまでは常に空文字（05-mcp.md §4-3）
    return '';
  }
  // remarks / item / lighting
  return String(c.value ?? '');
}

function buildSectionRows(
  section: Json,
  blocks: BlockLike[],
  refTable: Map<string, string>,
  includeText: boolean,
  ledScenes: Map<string, string>,
  stageTemplates: Map<string, string>,
): QsheetRowsSection {
  const rows = Array.isArray(section.rows) ? (section.rows as Json[]) : [];
  const blockByRef = new Map<string, BlockLike>();
  for (const b of blocks) {
    const ref = refTable.get(b.id);
    if (ref) blockByRef.set(ref, b);
  }
  return {
    sectionId: String(section.id ?? ''),
    label: String(section.label ?? ''),
    truncated: false,
    rows: rows.map((r) => {
      const cellsRaw = (r.cells && typeof r.cells === 'object' ? r.cells : {}) as Json;
      const cells: Record<string, string> = {};
      for (const [ref, block] of blockByRef) {
        if (!isBlockType(block.type)) continue;
        const cell = cellsRaw[block.id];
        const text = formatCell(block.type, cell, { includeText, ledScenes, stageTemplates });
        if (text) cells[ref] = text;
      }
      return {
        id: String(r.id ?? ''),
        label: typeof r.label === 'string' ? r.label : null,
        duration: typeof r.duration === 'string' ? r.duration : null,
        cells,
      };
    }),
  };
}

export interface GetQsheetRowsInput {
  mode: 'section' | 'full';
  sectionId?: string;
  includeText: boolean;
}

export async function getQsheetRows(doc: DocRow, input: GetQsheetRowsInput): Promise<QsheetRowsSection[]> {
  const data = doc.data;
  const blocks = Array.isArray(data.blocks) ? (data.blocks as BlockLike[]) : [];
  const refTable = blockRefTable(blocks);
  const sections = Array.isArray(data.sections) ? (data.sections as Json[]) : [];
  const ledScenesArr = Array.isArray(data.ledScenes) ? (data.ledScenes as Json[]) : [];
  const ledScenes = new Map(ledScenesArr.map((s) => [String(s.id ?? ''), String(s.name ?? '')]));
  const stageTemplates = await stageTemplateNames();

  if (input.mode === 'section') {
    if (!input.sectionId) throw new AppError(400, 'BAD_REQUEST', 'mode=section のときは section_id が必須です');
    const section = sections.find((s) => String(s.id ?? '') === input.sectionId);
    if (!section) throw new AppError(404, 'NOT_FOUND', '指定された section_id が見つかりません');
    return [buildSectionRows(section, blocks, refTable, input.includeText, ledScenes, stageTemplates)];
  }

  const totalRows = sections.reduce((n, s) => n + (Array.isArray(s.rows) ? (s.rows as unknown[]).length : 0), 0);
  if (totalRows > MAX_FULL_ROWS) {
    throw new AppError(400, 'TOO_LARGE', `台本が大きすぎます（${totalRows}行）。mode='section' で section_id を指定してください。`);
  }
  return sections.map((s) => buildSectionRows(s, blocks, refTable, input.includeText, ledScenes, stageTemplates));
}
