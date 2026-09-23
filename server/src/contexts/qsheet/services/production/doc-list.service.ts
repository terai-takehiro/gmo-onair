/**
 * `list_production_docs`（MCP・段10 / 05-mcp.md §4-1）。
 *
 * 台本（qsheet_documents）・スケジュール表（qsheet_schedules）・技術資料（qsheet_tech_docs。
 * tech-docs.md §7-5）から、それぞれの HTTP 一覧と同じ見える範囲だけを一覧で返す。
 * 新しい「似ている」判定は作らない — 既存の HTTP 一覧（documents.routes.ts /
 * schedules.routes.ts / tech-doc.service.ts の `listTechDocs`）と同じアクセス制御を
 * ここでも組み立てるだけ。
 *
 * ⚠️ 運営マニュアル（qsheet_manuals）・会場図面（qsheet_venue_layouts）はまだ読まない
 * （production-manual.md・venue-layout.md §15-2 で「MCP 連携は別作業」）。`app` に
 * それらを渡されても台本・スケジュール表を返さないよう、読む種類は `LISTED_DOC_APPS` に限る。
 */
import { queryAll, queryOne } from '../../../../shared/db/connection';
import { isQsheetAdmin, type AccessUser } from '../../access';
import { docPathOf } from '../../../../shared/production/miniapps';

/** この一覧が読む資料の種類（MCP の `app` の enum もここから作る） */
export const LISTED_DOC_APPS = ['sheet', 'schedule', 'tech'] as const;
export type MiniAppDocKey = (typeof LISTED_DOC_APPS)[number];

export interface ProductionDocRow {
  app: MiniAppDocKey;
  id: string;
  docNo: string | null;
  title: string;
  projectId: string | null;
  glsNumber: string | null;
  /**
   * 台本=放送日・スケジュール表=実施日。技術資料は1つの資料が複数の作業日を持つ
   * （tech-docs.md §13-4 の決定 A）ので常に null（`date` 絞り込みは作業日のどれかで当てる）
   */
  date: string | null;
  status: string;
  sectionCount?: number;
  updatedAt: string;
  updatedByName: string | null;
  /** 資料を開く URL（`docPathOf`） */
  url: string;
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

/**
 * 1種類あたり、要求されたページを組み立てるのに要る件数だけ取る（page × limit）。
 * 以前は種類ごとに一律 200 件で打ち切ってから件数とページを数えていたため、200 件を超えると
 * 後ろのページが空になり、total も 200 に張り付いていた（PR #737 レビュー指摘）。
 * 件数は別に COUNT で数える。3種類を更新日時の新しい順に混ぜるので、先頭 page × limit 件は
 * 各種類の先頭 page × limit 件の中に必ず入る。
 */
async function fetchPage(baseSql: string, params: unknown[], orderCol: string, need: number): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const [countRow, rows] = await Promise.all([
    queryOne(`SELECT COUNT(*)::int AS n FROM (${baseSql}) AS x`, params),
    queryAll(`${baseSql} ORDER BY ${orderCol} DESC LIMIT ?`, [...params, need]),
  ]);
  return { rows, total: Number(countRow?.n) || 0 };
}

interface FetchResult { rows: ProductionDocRow[]; total: number }

async function resolveProjectId(input: ListProductionDocsInput): Promise<string | null | undefined> {
  if (input.projectId) return input.projectId;
  if (!input.glsNumber) return undefined;
  const row = await queryOne('SELECT id FROM projects WHERE gls_number = ? AND deleted_at IS NULL', [input.glsNumber]);
  return (row?.id as string) ?? null; // null = 指定されたが見つからない（0件で返す）
}

function sanitizeSearch(q: string): string {
  return q.slice(0, 100).replace(/[%_\\]/g, '\\$&');
}

async function fetchSheets(actor: AccessUser, projectId: string | null | undefined, input: ListProductionDocsInput): Promise<FetchResult> {
  if (projectId === null) return { rows: [], total: 0 }; // gls_number が解決できなかった
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
  const { rows, total } = await fetchPage(sql, params, 'd.updated_at', input.page * input.limit);
  return { total, rows: rows.map((r) => ({
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
    url: docPathOf('sheet', r.id as string),
  })) };
}

async function fetchSchedules(actor: AccessUser, projectId: string | null | undefined, input: ListProductionDocsInput): Promise<FetchResult> {
  if (projectId === null) return { rows: [], total: 0 };
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
  const { rows, total } = await fetchPage(sql, params, 's.updated_at', input.page * input.limit);
  return { total, rows: rows.map((r) => ({
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
    url: docPathOf('schedule', r.id as string),
  })) };
}

/**
 * 技術資料（tech-docs.md §7-5）。見える範囲は `canAccessTechDoc`（作成者 / 案件メンバー /
 * `projects.assigned_to` / 管理者。明示共有は無い）を1本の SQL に展開したもの ——
 * `tech-doc.service.ts` の `listTechDocs` と同じ行条件（N+1 を作らない）。
 */
async function fetchTechDocs(actor: AccessUser, projectId: string | null | undefined, input: ListProductionDocsInput): Promise<FetchResult> {
  if (projectId === null) return { rows: [], total: 0 };
  let sql = `
    SELECT t.id, t.doc_no, t.title, t.project_id, p.gls_number, t.status, t.updated_at, u.name AS updated_by_name
    FROM qsheet_tech_docs t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.updated_by
    WHERE t.deleted_at IS NULL
  `;
  const params: unknown[] = [];
  if (!isQsheetAdmin(actor)) {
    sql += ` AND (t.created_by = ? OR (t.project_id IS NOT NULL AND (
               EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = ? AND pm.deleted_at IS NULL)
               OR EXISTS (SELECT 1 FROM projects pj WHERE pj.id = t.project_id AND pj.assigned_to = ?)
             )))`;
    params.push(actor.id, actor.id, actor.id);
  }
  if (projectId) { sql += ' AND t.project_id = ?'; params.push(projectId); }
  // 資料そのものは日を持たない（作業日はスタッフ行が持つ）ので、その日の作業日を持つ資料に当てる
  if (input.date) { sql += ' AND EXISTS (SELECT 1 FROM qsheet_tech_staff_rows sr WHERE sr.tech_doc_id = t.id AND sr.work_date = ?)'; params.push(input.date); }
  if (input.q) { sql += " AND (t.title ILIKE ? ESCAPE '\\' OR t.doc_no ILIKE ? ESCAPE '\\')"; const safe = `%${sanitizeSearch(input.q)}%`; params.push(safe, safe); }
  const { rows, total } = await fetchPage(sql, params, 't.updated_at', input.page * input.limit);
  return { total, rows: rows.map((r) => ({
    app: 'tech' as const,
    id: r.id as string,
    docNo: (r.doc_no as string) ?? null,
    title: r.title as string,
    projectId: (r.project_id as string) ?? null,
    glsNumber: (r.gls_number as string) ?? null,
    date: null,
    status: r.status as string,
    updatedAt: new Date(r.updated_at as string).toISOString(),
    updatedByName: (r.updated_by_name as string) ?? null,
    url: docPathOf('tech', r.id as string),
  })) };
}

const EMPTY: FetchResult = { rows: [], total: 0 };

export async function listProductionDocs(actor: AccessUser, input: ListProductionDocsInput): Promise<ListProductionDocsResult> {
  const projectId = await resolveProjectId(input);
  const wants = (app: MiniAppDocKey) => !input.app || input.app === app;
  const [sheets, schedules, techDocs] = await Promise.all([
    wants('sheet') ? fetchSheets(actor, projectId, input) : Promise.resolve(EMPTY),
    wants('schedule') ? fetchSchedules(actor, projectId, input) : Promise.resolve(EMPTY),
    wants('tech') ? fetchTechDocs(actor, projectId, input) : Promise.resolve(EMPTY),
  ]);

  const merged = [...sheets.rows, ...schedules.rows, ...techDocs.rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const total = sheets.total + schedules.total + techDocs.total;
  const start = (input.page - 1) * input.limit;
  const docs = merged.slice(start, start + input.limit);

  return {
    docs,
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) },
    note: '見る権限の無い資料（共有されていない台本・スケジュール表、案件メンバーでない技術資料）は含みません。運営マニュアル・会場図面はこの一覧の対象外です。',
  };
}
