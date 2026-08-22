/**
 * 生成4機能に渡す材料の集め方（段8・04-ai.md §2-1）。全機能が共有する。
 *
 * **best-effort。** 1件のクエリが失敗しても生成そのものを止めない
 * （案件が消えている・拠点が未設定、等）— 「材料が薄い」で通し、AI には
 * 「不明」と伝わるだけにする。DB 例外を投げるのは呼び出し元の権限チェックだけ。
 *
 * ⚠️ 渡さないもの（§2-1）: 見積・原価・仕入・支払条件。金額が `payload_snapshot` に
 * 焼き込まれると、教師データの閲覧権限を財務並みに上げる必要が出る。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
// ⚠️ `projects.notes` は migration 184 で落とした列（メモはやり取りへ一本化された）。
// `MEMO_LATERAL`（いちばん新しいメモを引き直す）を使う。`droppedColumns.test.ts` が
// `p.notes` を直書きすると止める。
import { MEMO_LATERAL } from '../../sales/services/project.service';
import { findSimilarDocs, type SimilarDocSummary } from './similar';
import { listActiveKnowledge, currentKnowledgeRev, type KnowledgeForPrompt } from './knowledge';

export interface ProjectMaterial {
  id: string;
  name: string;
  projectType: string | null;
  projectCategory: string | null;
  audience: string | null;
  broadcastType: string | null;
  mediaPlatform: string | null;
  tags: string | null;
  /** いちばん新しいメモ（`activity_logs.activity_type='memo'`）。旧 `projects.notes` の代わり */
  memoExcerpt: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  companyName: string | null;
  customerId: string | null;
}

export interface EpisodeMaterial {
  id: string;
  episodeNumber: number;
  episodeCode: string;
  recordingDate: string | null;
  broadcastDate: string | null;
  notes: string | null;
}

export interface VenueMaterial {
  locationId: string | null;
  locationName: string | null;
  roomNames: string[];
}

export interface ScheduleItemMaterial {
  kind: string;
  startMin: number;
  endMin: number;
  title: string;
  assignee: string | null;
}

export interface GenerationMaterials {
  project: ProjectMaterial | null;
  episode: EpisodeMaterial | null;
  venue: VenueMaterial | null;
  scheduleItems: ScheduleItemMaterial[];
  /** `getFeedbackDigest(kind, 90, {segmentKey, source:'server'}).advice` の先頭6〜8件（§2-1・§6-1） */
  advice: string[];
  /** `type:<project_category>|loc:<location_id>` の形（04-ai.md §6-1） */
  segmentKey: string | null;
  /** 過去の類似 Qシート（骨格の要約のみ・本文は含まない） */
  similar: SimilarDocSummary[];
  /** 人が承認したナレッジ（3段目・§6-3）。`draft` は含まない */
  knowledge: KnowledgeForPrompt[];
  /** ナレッジの現在の版（表全体の最大 rev）。`promptVersionOf` の第2引数に渡す（§6-5a） */
  knowledgeRev: number;
}

function buildSegmentKey(projectCategory: string | null, locationId: string | null): string | null {
  const parts: string[] = [];
  if (projectCategory) parts.push(`type:${projectCategory}`);
  if (locationId) parts.push(`loc:${locationId}`);
  return parts.length ? parts.join('|') : null;
}

async function fetchProject(projectId: string | null): Promise<ProjectMaterial | null> {
  if (!projectId) return null;
  try {
    const row = await queryOne(
      `SELECT p.id, p.name, p.project_type, p.project_category, p.audience,
              p.broadcast_type, p.media_platform, p.tags,
              memo.description AS memo_excerpt,
              p.event_start, p.event_end, p.customer_id, co.name AS company_name
         FROM projects p
         LEFT JOIN companies co ON co.id = p.customer_id
         ${MEMO_LATERAL}
        WHERE p.id = ? AND p.deleted_at IS NULL`,
      [projectId],
    );
    if (!row) return null;
    return {
      id: row.id as string, name: (row.name as string) ?? '',
      projectType: (row.project_type as string) ?? null,
      projectCategory: (row.project_category as string) ?? null,
      audience: (row.audience as string) ?? null,
      broadcastType: (row.broadcast_type as string) ?? null,
      mediaPlatform: (row.media_platform as string) ?? null,
      tags: (row.tags as string) ?? null,
      memoExcerpt: (row.memo_excerpt as string) ?? null,
      eventStart: (row.event_start as string) ?? null,
      eventEnd: (row.event_end as string) ?? null,
      companyName: (row.company_name as string) ?? null,
      customerId: (row.customer_id as string) ?? null,
    };
  } catch (e) {
    console.warn('[qsheet-ai] project material 取得に失敗しました（続行）:', (e as Error).message);
    return null;
  }
}

async function fetchEpisode(episodeId: string | null): Promise<EpisodeMaterial | null> {
  if (!episodeId) return null;
  try {
    const row = await queryOne(
      `SELECT id, episode_number, episode_code, recording_date, broadcast_date, notes
         FROM episodes WHERE id = ? AND deleted_at IS NULL`,
      [episodeId],
    );
    if (!row) return null;
    return {
      id: row.id as string, episodeNumber: Number(row.episode_number) || 0,
      episodeCode: (row.episode_code as string) ?? '',
      recordingDate: (row.recording_date as string) ?? null,
      broadcastDate: (row.broadcast_date as string) ?? null,
      notes: (row.notes as string) ?? null,
    };
  } catch (e) {
    console.warn('[qsheet-ai] episode material 取得に失敗しました（続行）:', (e as Error).message);
    return null;
  }
}

async function fetchVenue(locationId: string | null): Promise<VenueMaterial | null> {
  if (!locationId) return null;
  try {
    const loc = await queryOne(
      'SELECT id, name FROM studio_locations WHERE id = ? AND deleted_at IS NULL', [locationId],
    );
    if (!loc) return null;
    const rooms = await queryAll(
      'SELECT name FROM studio_rooms WHERE location_id = ? AND deleted_at IS NULL ORDER BY sort_order',
      [locationId],
    );
    return {
      locationId: loc.id as string, locationName: (loc.name as string) ?? null,
      roomNames: rooms.map((r) => String(r.name ?? '')).filter(Boolean),
    };
  } catch (e) {
    console.warn('[qsheet-ai] venue material 取得に失敗しました（続行）:', (e as Error).message);
    return null;
  }
}

async function fetchScheduleItems(scheduleId: string | null): Promise<ScheduleItemMaterial[]> {
  if (!scheduleId) return [];
  try {
    const rows = await queryAll(
      `SELECT kind, start_min, end_min, title, assignee
         FROM qsheet_schedule_items
        WHERE schedule_id = ? AND deleted_at IS NULL
        ORDER BY start_min`,
      [scheduleId],
    );
    return rows.map((r) => ({
      kind: String(r.kind ?? 'other'), startMin: Number(r.start_min) || 0,
      endMin: Number(r.end_min) || 0, title: String(r.title ?? ''),
      assignee: (r.assignee as string) ?? null,
    }));
  } catch (e) {
    console.warn('[qsheet-ai] schedule items 取得に失敗しました（続行）:', (e as Error).message);
    return [];
  }
}

/**
 * digest を読む（1段目・§6-1）。`source: 'server'` を明示する — 生成4機能はサーバー内の
 * 呼び出しなので、MCP 経由（`propose_sheet_draft`。旧 `propose_qsheet_draft`）の傾向と混ぜない。
 * `segmentKey` は §6-1 の「式典と配信で尺の傾向が逆」を踏まえた絞り込み
 * （母数が10未満なら `getFeedbackDigest` 側が全社の digest に自動で落とす）。
 */
async function fetchAdvice(kind: string, segmentKey: string | null): Promise<string[]> {
  try {
    const digest = await getFeedbackDigest(kind, 90, { segmentKey: segmentKey ?? undefined, source: 'server' });
    return (digest.advice ?? []).slice(0, 8);
  } catch (e) {
    console.warn('[qsheet-ai] advice 取得に失敗しました（続行）:', (e as Error).message);
    return [];
  }
}

/** 3段目・ナレッジ（§6-3）。active のものだけ・draft は絶対に混ぜない */
async function fetchKnowledge(kind: string, segmentKey: string | null): Promise<{ knowledge: KnowledgeForPrompt[]; knowledgeRev: number }> {
  const [knowledge, knowledgeRev] = await Promise.all([
    listActiveKnowledge(kind, segmentKey),
    currentKnowledgeRev(),
  ]);
  return { knowledge, knowledgeRev };
}

export interface GatherOptions {
  kind: string; // getFeedbackDigest の kind
  viewerId: string;
  isAdmin: boolean;
  /** 見本探しから除く自分自身（②③生成なら生成元の document_id） */
  excludeDocumentId?: string | null;
}

/** ②骨格・③セリフ: 対象文書から材料を集める */
export async function gatherMaterialsForDocument(
  documentId: string, opts: GatherOptions,
): Promise<GenerationMaterials> {
  const doc = await queryOne(
    'SELECT project_id, episode_id FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [documentId],
  );
  const projectId = (doc?.project_id as string) ?? null;
  const episodeId = (doc?.episode_id as string) ?? null;
  // segmentKey は project に依存するので先に確定させる（advice/knowledge が参照するため）
  const project = await fetchProject(projectId);
  const segmentKey = buildSegmentKey(project?.projectCategory ?? null, null);
  const [episode, advice, similar, { knowledge, knowledgeRev }] = await Promise.all([
    fetchEpisode(episodeId),
    fetchAdvice(opts.kind, segmentKey),
    findSimilarDocs({
      viewerId: opts.viewerId, isAdmin: opts.isAdmin, scope: 'visible',
      projectId, excludeDocumentId: opts.excludeDocumentId ?? documentId, limit: 3,
    }).catch(() => []),
    fetchKnowledge(opts.kind, segmentKey),
  ]);
  return {
    project, episode, venue: null, scheduleItems: [], advice, segmentKey, similar, knowledge, knowledgeRev,
  };
}

/** ①枠: 対象スケジュール表から材料を集める */
export async function gatherMaterialsForSchedule(
  scheduleId: string, opts: GatherOptions,
): Promise<GenerationMaterials> {
  const sch = await queryOne(
    'SELECT project_id, episode_id, location_id FROM qsheet_schedules WHERE id = ? AND deleted_at IS NULL',
    [scheduleId],
  );
  const projectId = (sch?.project_id as string) ?? null;
  const episodeId = (sch?.episode_id as string) ?? null;
  const locationId = (sch?.location_id as string) ?? null;
  const project = await fetchProject(projectId);
  const segmentKey = buildSegmentKey(project?.projectCategory ?? null, locationId);
  const [episode, venue, scheduleItems, advice, { knowledge, knowledgeRev }] = await Promise.all([
    fetchEpisode(episodeId), fetchVenue(locationId),
    fetchScheduleItems(scheduleId), fetchAdvice(opts.kind, segmentKey),
    fetchKnowledge(opts.kind, segmentKey),
  ]);
  return {
    project, episode, venue, scheduleItems, advice, segmentKey, similar: [], knowledge, knowledgeRev,
  };
}
