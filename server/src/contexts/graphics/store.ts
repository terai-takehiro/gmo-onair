// テロップCG（graphics）の共通データ取得・整形。
// REST（projects/pages/public.routes）と Socket（cg:*）が同じ形を返すよう、
// DB 行 → camelCase の写像と cue の upsert をここ1か所に閉じる。
import { execute, queryAll, queryOne, Row } from '../../shared/db/connection';

export const SLOTS = ['fullscreen', 'lower', 'side', 'ticker', 'clock', 'flash'] as const;
export type Slot = (typeof SLOTS)[number];

export const PART_KEYS = [
  'name', 'title', 'list', 'ticker', 'countdown', 'score', 'flash', 'side', 'vote',
] as const;
export type PartKey = (typeof PART_KEYS)[number];

export const PROOF_STATES = ['draft', 'unproofed', 'proofed'] as const;
export type ProofState = (typeof PROOF_STATES)[number];

/** プロジェクト単位の見た目テーマ（graphics_projects.theme。既定は migration 245 の 'ceremony-gold'） */
export const THEMES = ['ceremony-gold', 'news-navy', 'corporate-light', 'variety-pop'] as const;
export type Theme = (typeof THEMES)[number];

// 呼出番号のスロット別ブロック（モックの採番どおり: 下部=101〜・サイド=110〜・
// フル=201〜・ティッカー=301〜・時計=401〜・速報=501〜）。ブロック内の
// 最小の空き番号を払い出す（graphics.md §2「テンキー入力で即スタンバイ」）。
export const SLOT_CALL_BASE: Record<Slot, number> = {
  lower: 101,
  side: 110,
  fullscreen: 201,
  ticker: 301,
  clock: 401,
  flash: 501,
};

export interface GraphicsProject {
  id: number;
  ownerType: string;
  ownerId: string;
  name: string;
  theme: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface GraphicsPage {
  id: number;
  projectId: number;
  callNo: number;
  slot: string;
  partKey: string;
  name: string;
  fields: Record<string, unknown>;
  proofState: string;
  sortOrder: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface GraphicsCue {
  projectId: number;
  slot: string;
  pageId: number | null;
  isLive: boolean;
  takenAt: unknown;
  updatedAt: unknown;
}

export const REQUEST_STATUSES = ['requested', 'converted', 'dismissed'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** 発注（テロ原）。docs/design/v4/graphics.md §3・§9 段5 */
export interface GraphicsRequest {
  id: number;
  projectId: number;
  title: string;
  detail: string | null;
  desiredSlot: string | null;
  desiredPartKey: string | null;
  desiredTiming: string | null;
  requestedBy: string | null;
  status: string;
  convertedPageId: number | null;
  createdAt: unknown;
  updatedAt: unknown;
}

export function mapProject(r: Row): GraphicsProject {
  return {
    id: r.id as number,
    ownerType: r.owner_type as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    theme: r.theme as string,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapPage(r: Row): GraphicsPage {
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    callNo: r.call_no as number,
    slot: r.slot as string,
    partKey: r.part_key as string,
    name: r.name as string,
    fields: (r.fields ?? {}) as Record<string, unknown>,
    proofState: r.proof_state as string,
    sortOrder: r.sort_order as number,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapCue(r: Row): GraphicsCue {
  return {
    projectId: r.project_id as number,
    slot: r.slot as string,
    pageId: (r.page_id as number | null) ?? null,
    isLive: r.is_live as boolean,
    takenAt: r.taken_at ?? null,
    updatedAt: r.updated_at,
  };
}

export function mapRequest(r: Row): GraphicsRequest {
  return {
    id: r.id as number,
    projectId: r.project_id as number,
    title: r.title as string,
    detail: (r.detail as string | null) ?? null,
    desiredSlot: (r.desired_slot as string | null) ?? null,
    desiredPartKey: (r.desired_part_key as string | null) ?? null,
    desiredTiming: (r.desired_timing as string | null) ?? null,
    requestedBy: (r.requested_by as string | null) ?? null,
    status: r.status as string,
    convertedPageId: (r.converted_page_id as number | null) ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchProject(id: number): Promise<GraphicsProject | null> {
  const row = await queryOne(`SELECT * FROM graphics_projects WHERE id = ?`, [id]);
  return row ? mapProject(row) : null;
}

export async function fetchPages(projectId: number): Promise<GraphicsPage[]> {
  const rows = await queryAll(
    `SELECT * FROM graphics_pages WHERE project_id = ? ORDER BY sort_order, call_no, id`,
    [projectId]
  );
  return rows.map(mapPage);
}

/** 発注一覧。status を渡すとその状態だけに絞る（既定は絞り込みなし＝全件） */
export async function fetchRequests(projectId: number, status?: string): Promise<GraphicsRequest[]> {
  const rows = status
    ? await queryAll(
        `SELECT * FROM graphics_requests WHERE project_id = ? AND status = ? ORDER BY created_at DESC`,
        [projectId, status]
      )
    : await queryAll(
        `SELECT * FROM graphics_requests WHERE project_id = ? ORDER BY created_at DESC`,
        [projectId]
      );
  return rows.map(mapRequest);
}

export async function fetchCues(projectId: number): Promise<GraphicsCue[]> {
  const rows = await queryAll(
    `SELECT * FROM graphics_cue_state WHERE project_id = ? ORDER BY slot`,
    [projectId]
  );
  return rows.map(mapCue);
}

export interface GraphicsBundle {
  project: GraphicsProject;
  pages: GraphicsPage[];
  cues: GraphicsCue[];
}

export async function fetchBundle(projectId: number): Promise<GraphicsBundle | null> {
  const project = await fetchProject(projectId);
  if (!project) return null;
  const [pages, cues] = await Promise.all([fetchPages(projectId), fetchCues(projectId)]);
  return { project, pages, cues };
}

/**
 * スロット cue の upsert（pageId null = クリア）。
 * is_live / taken_at は pageId から導出する — 「載っているのに live でない」中間状態を
 * REST と Socket のどちらの経路でも作らせないため。
 */
export async function upsertCue(
  projectId: number,
  slot: Slot,
  pageId: number | null
): Promise<GraphicsCue[]> {
  const isLive = pageId !== null;
  await execute(
    `INSERT INTO graphics_cue_state (project_id, slot, page_id, is_live, taken_at, updated_at)
     VALUES (?, ?, ?, ?, ${isLive ? 'NOW()' : 'NULL'}, NOW())
     ON CONFLICT (project_id, slot) DO UPDATE
       SET page_id = EXCLUDED.page_id,
           is_live = EXCLUDED.is_live,
           taken_at = EXCLUDED.taken_at,
           updated_at = NOW()`,
    [projectId, slot, pageId, isLive]
  );
  return fetchCues(projectId);
}

/** スロット別ブロック内の最小の空き呼出番号を払い出す。 */
export async function nextCallNo(projectId: number, slot: Slot): Promise<number> {
  const rows = await queryAll(
    `SELECT call_no FROM graphics_pages WHERE project_id = ?`,
    [projectId]
  );
  const used = new Set(rows.map((r) => r.call_no as number));
  let n = SLOT_CALL_BASE[slot];
  while (used.has(n)) n += 1;
  return n;
}
