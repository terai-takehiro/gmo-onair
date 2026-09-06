/**
 * スケジュール表（`qsheet_schedules`）— 一覧・詳細・CRUD・共有。
 * 実装設計: docs/design/v4/qsheet-v4-coding/impl/04-schedule-impl.md §4-1・§4-2
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type Row } from '../../../shared/db/connection';
import { isQsheetAdmin } from '../access';
import { issueDocNo } from './docNo.service';
import { NotFoundError, ForbiddenError, ValidationError, checkOptimisticLock } from './httpErrors';
import { applyTemplateAll } from './schedule-template-apply.service';

interface AccessUser { id: string; role: string; permissions?: Record<string, string> }

// ⚠️ service_date は DATE。pg は JS の Date で返し、toISOString() は UTC に寄って
// 1日ずれる（flow-template.service.ts の ymd() が踏んだのと同じ罠）。
// 必ず SQL 側で to_char() して文字列にする（04-schedule-impl.md §3-1）。
const SELECT_BASE = `
  SELECT s.id, s.title, s.doc_no, to_char(s.service_date, 'YYYY-MM-DD') AS service_date,
         s.location_id, s.project_id, s.program_id, s.episode_id,
         s.view_start_min, s.view_end_min, s.slot_min, s.status, s.notes,
         s.created_by, s.updated_by, s.created_at, s.updated_at,
         u.name AS creator_name,
         l.name AS location_name,
         p.name AS project_name, p.gls_number,
         pr.name AS program_name,
         (SELECT COUNT(*)::int FROM qsheet_schedule_items i WHERE i.schedule_id = s.id AND i.deleted_at IS NULL) AS item_count,
         (SELECT COUNT(*)::int FROM qsheet_schedule_shares sh WHERE sh.schedule_id = s.id) AS share_count,
         -- 案件メンバー＋主担当の人数（自動で見える人数・14-schedule-v2-plan.md §3-2）。
         -- 番組の表は project_id が無いので常に NULL（明示共有だけ・画面はこの列を出さない）
         (CASE WHEN s.project_id IS NULL THEN NULL ELSE (
           SELECT COUNT(*)::int FROM (
             SELECT pm.user_id FROM project_members pm WHERE pm.project_id = s.project_id AND pm.deleted_at IS NULL AND pm.user_id IS NOT NULL
             UNION
             SELECT pj.assigned_to FROM projects pj WHERE pj.id = s.project_id
           ) member_ids
         ) END) AS project_member_count
  FROM qsheet_schedules s
  LEFT JOIN users u ON s.created_by = u.id
  LEFT JOIN studio_locations l ON s.location_id = l.id
  LEFT JOIN projects p ON s.project_id = p.id
  LEFT JOIN qsheet_programs pr ON s.program_id = pr.id
`;

export interface ListFilter {
  date_from?: string;
  date_to?: string;
  project_id?: string;
  program_id?: string;
  location_id?: string;
  status?: string;
  search?: string;
}

// MCP の update_schedule ツール (production.tools.ts) も同じ表を使う（唯一の正）。
export const SCHEDULE_STATUSES = ['draft', 'fixed', 'archived'] as const;
const VALID_STATUSES: readonly string[] = SCHEDULE_STATUSES;

export async function listSchedules(user: AccessUser, filter: ListFilter): Promise<Row[]> {
  let sql = `${SELECT_BASE} WHERE s.deleted_at IS NULL`;
  const params: unknown[] = [];
  let i = 1;

  if (!isQsheetAdmin(user)) {
    // 案件メンバー・主担当は自動で見える（§3-2）。番組は project_id が無いので対象外のまま
    sql += ` AND (s.created_by = $${i} OR EXISTS (
               SELECT 1 FROM qsheet_schedule_shares sh WHERE sh.schedule_id = s.id AND sh.user_id = $${i})
             OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = s.project_id AND pm.user_id = $${i} AND pm.deleted_at IS NULL)
             OR EXISTS (SELECT 1 FROM projects pj WHERE pj.id = s.project_id AND pj.assigned_to = $${i}))`;
    params.push(user.id);
    i++;
  }
  if (filter.date_from) { sql += ` AND s.service_date >= $${i++}`; params.push(filter.date_from); }
  if (filter.date_to) { sql += ` AND s.service_date <= $${i++}`; params.push(filter.date_to); }
  if (filter.project_id) { sql += ` AND s.project_id = $${i++}`; params.push(filter.project_id); }
  if (filter.program_id) { sql += ` AND s.program_id = $${i++}`; params.push(filter.program_id); }
  if (filter.location_id) { sql += ` AND s.location_id = $${i++}`; params.push(filter.location_id); }
  if (filter.status && VALID_STATUSES.includes(filter.status)) { sql += ` AND s.status = $${i++}`; params.push(filter.status); }
  if (filter.search) {
    const safe = filter.search.slice(0, 100).replace(/[%_\\]/g, '\\$&');
    sql += ` AND s.title ILIKE $${i++} ESCAPE '\\'`;
    params.push(`%${safe}%`);
  }
  sql += ' ORDER BY s.service_date DESC LIMIT 200';

  return queryAll(sql, params);
}

/** 行そのもの（access 判定・存在確認に使う最小情報） */
export async function getScheduleRaw(id: string): Promise<Row | undefined> {
  return queryOne('SELECT id, created_by, updated_at, updated_by FROM qsheet_schedules WHERE id = $1 AND deleted_at IS NULL', [id]);
}

export async function getScheduleWithMeta(id: string): Promise<Row | undefined> {
  return queryOne(`${SELECT_BASE} WHERE s.id = $1 AND s.deleted_at IS NULL`, [id]);
}

export async function getScheduleColumns(scheduleId: string): Promise<Row[]> {
  return queryAll(
    `SELECT c.*, r.name AS room_name FROM qsheet_schedule_columns c
     LEFT JOIN studio_rooms r ON c.room_id = r.id
     WHERE c.schedule_id = $1 AND c.deleted_at IS NULL
     ORDER BY CASE c.col_group WHEN 'venue' THEN 0 WHEN 'prep' THEN 1 ELSE 2 END, c.sort_order`,
    [scheduleId],
  );
}

export async function getScheduleItems(scheduleId: string): Promise<Row[]> {
  return queryAll(
    `SELECT i.*, (i.qsheet_document_id IS NOT NULL AND d.id IS NULL) AS link_broken
     FROM qsheet_schedule_items i
     LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
     WHERE i.schedule_id = $1 AND i.deleted_at IS NULL
     ORDER BY i.start_min`,
    [scheduleId],
  );
}

export interface CreateScheduleInput {
  title: string;
  serviceDate: string;
  locationId?: string | null;
  projectId?: string | null;
  /** 番組（マニュアル・案件管理外）。`projectId` と同時には立てない（migration 227） */
  programId?: string | null;
  episodeId?: string | null;
  templateId?: string | null;
  onairStartMin?: number | null;
  createdBy: string;
}

const MAX_TITLE = 500;

export async function createSchedule(input: CreateScheduleInput): Promise<Row> {
  if (!input.serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate)) {
    throw new ValidationError('service_date は YYYY-MM-DD 形式で指定してください');
  }
  const id = uuid();
  const docNo = await issueDocNo('schedule');
  const title = (input.title || '').slice(0, MAX_TITLE);

  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO qsheet_schedules (id, title, doc_no, service_date, location_id, project_id, program_id, episode_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, docNo, input.serviceDate, input.locationId || null, input.projectId || null, input.programId || null, input.episodeId || null, input.createdBy, input.createdBy],
    );
    if (input.templateId) {
      // 新規作成時は「表も文書もまだ無い」ので、onair_start_min の既定が出せない（§4-4）。
      // 足りなければここで 400（ValidationError）。トランザクションごと ROLLBACK される。
      await applyTemplateAll(tx, id, input.templateId, input.onairStartMin ?? null);
    }
  });

  const row = await getScheduleWithMeta(id);
  if (!row) throw new Error('createSchedule: INSERT 直後の SELECT が空でした');
  return row;
}

export interface UpdateScheduleInput {
  title?: string;
  serviceDate?: string;
  locationId?: string | null;
  projectId?: string | null;
  programId?: string | null;
  episodeId?: string | null;
  viewStartMin?: number;
  viewEndMin?: number;
  slotMin?: number;
  status?: string;
  notes?: string | null;
  expectedUpdatedAt?: unknown;
}

export async function updateSchedule(id: string, userId: string, input: UpdateScheduleInput): Promise<Row> {
  const existing = await queryOne(
    `SELECT s.id, s.created_by, s.updated_at, s.updated_by, u.name AS updater_name
     FROM qsheet_schedules s LEFT JOIN users u ON s.updated_by = u.id
     WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id],
  );
  if (!existing) throw new NotFoundError('スケジュール表が見つかりません');
  checkOptimisticLock(
    input.expectedUpdatedAt,
    { updated_at: existing.updated_at, updated_by: existing.updated_by, updater_name: existing.updater_name },
    userId,
    'このスケジュール表',
  );

  const sets: string[] = ['updated_by = ?', 'updated_at = NOW()'];
  const params: unknown[] = [userId];
  if (typeof input.title === 'string') { sets.push('title = ?'); params.push(input.title.slice(0, MAX_TITLE)); }
  if (typeof input.serviceDate === 'string') { sets.push('service_date = ?'); params.push(input.serviceDate); }
  if ('locationId' in input) { sets.push('location_id = ?'); params.push(input.locationId || null); }
  if ('projectId' in input) { sets.push('project_id = ?'); params.push(input.projectId || null); }
  if ('programId' in input) { sets.push('program_id = ?'); params.push(input.programId || null); }
  if ('episodeId' in input) { sets.push('episode_id = ?'); params.push(input.episodeId || null); }
  if (typeof input.viewStartMin === 'number') { sets.push('view_start_min = ?'); params.push(Math.round(input.viewStartMin)); }
  if (typeof input.viewEndMin === 'number') { sets.push('view_end_min = ?'); params.push(Math.round(input.viewEndMin)); }
  if (typeof input.slotMin === 'number') { sets.push('slot_min = ?'); params.push(Math.round(input.slotMin)); }
  if (typeof input.status === 'string' && VALID_STATUSES.includes(input.status)) { sets.push('status = ?'); params.push(input.status); }
  if ('notes' in input) { sets.push('notes = ?'); params.push(input.notes ?? null); }

  await execute(`UPDATE qsheet_schedules SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  const row = await getScheduleWithMeta(id);
  if (!row) throw new Error('updateSchedule: UPDATE 直後の SELECT が空でした');
  return row;
}

export async function deleteSchedule(id: string, user: AccessUser): Promise<void> {
  const existing = await queryOne('SELECT id, created_by FROM qsheet_schedules WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw new NotFoundError('スケジュール表が見つかりません');
  if (!isQsheetAdmin(user) && (existing.created_by as string) !== user.id) {
    throw new ForbiddenError('このスケジュール表を削除する権限がありません');
  }
  await execute('UPDATE qsheet_schedules SET deleted_at = NOW(), updated_by = $1 WHERE id = $2', [user.id, id]);
}

/** 明示共有の一覧（案件メンバーは含まない・§3-2 は動的判定のため一覧に写らない） */
export async function getShares(id: string): Promise<Row[]> {
  return queryAll(
    `SELECT s.user_id, u.name, u.email
     FROM qsheet_schedule_shares s
     LEFT JOIN users u ON s.user_id = u.id
     WHERE s.schedule_id = $1
     ORDER BY u.name`,
    [id],
  );
}

export async function setShares(id: string, userIds: unknown, actingUserId: string): Promise<number> {
  const ownerRow = await queryOne('SELECT created_by FROM qsheet_schedules WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!ownerRow) throw new NotFoundError('スケジュール表が見つかりません');
  const ownerId = (ownerRow.created_by as string) ?? null;

  const requested = Array.isArray(userIds)
    ? Array.from(new Set(userIds.filter((u): u is string => typeof u === 'string' && u.length > 0))).filter((u) => u !== ownerId)
    : [];

  let validIds: string[] = [];
  if (requested.length > 0) {
    const placeholders = requested.map((_, idx) => `$${idx + 1}`).join(', ');
    const found = await queryAll(`SELECT id FROM users WHERE deleted_at IS NULL AND id IN (${placeholders})`, requested);
    validIds = found.map((r) => r.id as string);
  }

  await execute('DELETE FROM qsheet_schedule_shares WHERE schedule_id = $1', [id]);
  for (const uid of validIds) {
    await execute(
      `INSERT INTO qsheet_schedule_shares (schedule_id, user_id, created_by) VALUES ($1, $2, $3)
       ON CONFLICT (schedule_id, user_id) DO NOTHING`,
      [id, uid, actingUserId],
    );
  }
  return validIds.length;
}
