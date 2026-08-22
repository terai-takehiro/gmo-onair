/**
 * `list_production_docs`（MCP・段10 / 05-mcp.md §4-1）。
 *
 * 台本（qsheet_documents）とスケジュール表（qsheet_schedules）の両方から、
 * 見える範囲（作成者本人／共有先／`system_admin`）だけを一覧で返す。
 * 新しい「似ている」判定は作らない — 既存の HTTP 一覧（documents.routes.ts /
 * schedules.routes.ts）と同じアクセス制御をここでも組み立てるだけ。
 */
import { queryAll, queryOne } from '../../../../shared/db/connection';
import { isQsheetAdmin, type AccessUser } from '../../access';

export type MiniAppDocKey = 'sheet' | 'schedule';

export interface ProductionDocRow {
  app: MiniAppDocKey;
  id: string;
  docNo: string | null;
  title: string;
  projectId: string | null;
  glsNumber: string | null;
  date: string | null;
  status: string;
  sectionCount?: number;
  updatedAt: string;
  updatedByName: string | null;
}

export interface ListProductionDocsInput {
  projectId?: string;
  glsNumber?: string;
  date?: string;
  app?: MiniAppDocKey;
  q?: string;
  limit: number;
  page: number;
}

export interface ListProductionDocsResult {
  docs: ProductionDocRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  note: string;
}

const FETCH_CAP = 200;

async function resolveProjectId(input: ListProductionDocsInput): Promise<string | null | undefined> {
  if (input.projectId) return input.projectId;
  if (!input.glsNumber) return undefined;
  const row = await queryOne('SELECT id FROM projects WHERE gls_number = ? AND deleted_at IS NULL', [input.glsNumber]);
  return (row?.id as string) ?? null; // null = 指定されたが見つからない（0件で返す）
}

function sanitizeSearch(q: string): string {
  return q.slice(0, 100).replace(/[%_\\]/g, '\\$&');
}

async function fetchSheets(actor: AccessUser, projectId: string | null | undefined, input: ListProductionDocsInput): Promise<ProductionDocRow[]> {
  if (projectId === null) return []; // gls_number が解決できなかった
  let sql = `
    SELECT d.id, d.doc_no, d.title, d.project_id, p.gls_number, d.broadcast_date AS date,
           d.status,
           CASE WHEN jsonb_typeof(d.data->'sections') = 'array' THEN jsonb_array_length(d.data->'sections') ELSE 0 END AS section_count,
           d.updated_at, u.name AS updated_by_name
    FROM qsheet_documents d
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN users u ON u.id = d.updated_by
    WHERE d.deleted_at IS NULL
  `;
  const params: unknown[] = [];
  if (!isQsheetAdmin(actor)) {
    sql += ` AND (d.created_by = ? OR EXISTS (SELECT 1 FROM qsheet_document_shares s WHERE s.document_id = d.id AND s.user_id = ?))`;
    params.push(actor.id, actor.id);
  }
  if (projectId) { sql += ' AND d.project_id = ?'; params.push(projectId); }
  if (input.date) { sql += ' AND d.broadcast_date = ?'; params.push(input.date); }
  if (input.q) { sql += " AND (d.title ILIKE ? ESCAPE '\\' OR d.doc_no ILIKE ? ESCAPE '\\')"; const safe = `%${sanitizeSearch(input.q)}%`; params.push(safe, safe); }
  sql += ' ORDER BY d.updated_at DESC LIMIT ?';
  params.push(FETCH_CAP);

  const rows = await queryAll(sql, params);
  return rows.map((r) => ({
    app: 'sheet' as const,
    id: r.id as string,
    docNo: (r.doc_no as string) ?? null,
    title: r.title as string,
    projectId: (r.project_id as string) ?? null,
    glsNumber: (r.gls_number as string) ?? null,
    date: (r.date as string) ?? null,
    status: r.status as string,
    sectionCount: Number(r.section_count) || 0,
    updatedAt: new Date(r.updated_at as string).toISOString(),
    updatedByName: (r.updated_by_name as string) ?? null,
  }));
}

async function fetchSchedules(actor: AccessUser, projectId: string | null | undefined, input: ListProductionDocsInput): Promise<ProductionDocRow[]> {
  if (projectId === null) return [];
  let sql = `
    SELECT s.id, s.doc_no, s.title, s.project_id, p.gls_number,
           to_char(s.service_date, 'YYYY-MM-DD') AS date, s.status, s.updated_at, u.name AS updated_by_name
    FROM qsheet_schedules s
    LEFT JOIN projects p ON p.id = s.project_id
    LEFT JOIN users u ON u.id = s.updated_by
    WHERE s.deleted_at IS NULL
  `;
  const params: unknown[] = [];
  if (!isQsheetAdmin(actor)) {
    sql += ` AND (s.created_by = ? OR EXISTS (SELECT 1 FROM qsheet_schedule_shares sh WHERE sh.schedule_id = s.id AND sh.user_id = ?))`;
    params.push(actor.id, actor.id);
  }
  if (projectId) { sql += ' AND s.project_id = ?'; params.push(projectId); }
  if (input.date) { sql += ' AND s.service_date = ?'; params.push(input.date); }
  if (input.q) { sql += " AND (s.title ILIKE ? ESCAPE '\\' OR s.doc_no ILIKE ? ESCAPE '\\')"; const safe = `%${sanitizeSearch(input.q)}%`; params.push(safe, safe); }
  sql += ' ORDER BY s.updated_at DESC LIMIT ?';
  params.push(FETCH_CAP);

  const rows = await queryAll(sql, params);
  return rows.map((r) => ({
    app: 'schedule' as const,
    id: r.id as string,
    docNo: (r.doc_no as string) ?? null,
    title: r.title as string,
    projectId: (r.project_id as string) ?? null,
    glsNumber: (r.gls_number as string) ?? null,
    date: (r.date as string) ?? null,
    status: r.status as string,
    updatedAt: new Date(r.updated_at as string).toISOString(),
    updatedByName: (r.updated_by_name as string) ?? null,
  }));
}

export async function listProductionDocs(actor: AccessUser, input: ListProductionDocsInput): Promise<ListProductionDocsResult> {
  const projectId = await resolveProjectId(input);
  const [sheets, schedules] = await Promise.all([
    input.app === 'schedule' ? Promise.resolve([]) : fetchSheets(actor, projectId, input),
    input.app === 'sheet' ? Promise.resolve([]) : fetchSchedules(actor, projectId, input),
  ]);

  const merged = [...sheets, ...schedules].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const total = merged.length;
  const start = (input.page - 1) * input.limit;
  const docs = merged.slice(start, start + input.limit);

  return {
    docs,
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) },
    note: '共有されていない資料は含みません。',
  };
}
