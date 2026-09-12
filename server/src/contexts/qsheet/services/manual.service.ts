/**
 * 運営マニュアル（`qsheet_manuals` / `qsheet_manual_pages`）— 段A：一覧・詳細・CRUD・ページ管理
 * ＋段B：紙面（`blocks`）の保存・楽観ロック。
 * 設計: docs/design/v4/production-manual.md §5〜§6（確定/rev・編集ロック・秘密の伏せ字解除・
 * 差し込み・ひな形・AI は段C以降・今回は実装しない）。
 * 実装パターンは schedule.service.ts / schedule-column.service.ts をそのまま踏襲する。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type Row } from '../../../shared/db/connection';
import { isQsheetAdmin } from '../access';
import { issueDocNo } from './docNo.service';
import { NotFoundError, ValidationError, checkOptimisticLock } from './httpErrors';

interface AccessUser { id: string; role: string; permissions?: Record<string, string> }

const SELECT_BASE = `
  SELECT m.id, m.doc_no, m.title, m.project_id, m.program_id,
         to_char(m.service_date, 'YYYY-MM-DD') AS service_date,
         m.status, m.rev, m.created_by, m.updated_by, m.created_at, m.updated_at,
         u.name AS creator_name,
         p.name AS project_name, p.gls_number,
         pr.name AS program_name,
         (SELECT COUNT(*)::int FROM qsheet_manual_pages mp WHERE mp.manual_id = m.id) AS page_count
  FROM qsheet_manuals m
  LEFT JOIN users u ON m.created_by = u.id
  LEFT JOIN projects p ON m.project_id = p.id
  LEFT JOIN qsheet_programs pr ON m.program_id = pr.id
`;

export interface ListFilter {
  project_id?: string;
  program_id?: string;
  status?: string;
  search?: string;
}

export const MANUAL_STATUSES = ['draft', 'fixed', 'archived'] as const;
const VALID_STATUSES: readonly string[] = MANUAL_STATUSES;

/**
 * 一覧。可視性は `canAccessManual` と同じ理屈（作成者 / 案件メンバー / 管理者）を
 * 1本の SQL に展開したもの（schedule 版 `listSchedules` と同じ形。明示共有が無い分シンプル）。
 */
export async function listManuals(user: AccessUser, filter: ListFilter): Promise<Row[]> {
  let sql = `${SELECT_BASE} WHERE m.deleted_at IS NULL`;
  const params: unknown[] = [];
  let i = 1;

  if (!isQsheetAdmin(user)) {
    sql += ` AND (m.created_by = $${i} OR (m.project_id IS NOT NULL AND (
               EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = m.project_id AND pm.user_id = $${i} AND pm.deleted_at IS NULL)
               OR EXISTS (SELECT 1 FROM projects pj WHERE pj.id = m.project_id AND pj.assigned_to = $${i})
             )))`;
    params.push(user.id);
    i++;
  }
  if (filter.project_id) { sql += ` AND m.project_id = $${i++}`; params.push(filter.project_id); }
  if (filter.program_id) { sql += ` AND m.program_id = $${i++}`; params.push(filter.program_id); }
  if (filter.status && VALID_STATUSES.includes(filter.status)) { sql += ` AND m.status = $${i++}`; params.push(filter.status); }
  if (filter.search) {
    const safe = filter.search.slice(0, 100).replace(/[%_\\]/g, '\\$&');
    sql += ` AND m.title ILIKE $${i++} ESCAPE '\\'`;
    params.push(`%${safe}%`);
  }
  sql += ' ORDER BY m.updated_at DESC LIMIT 200';

  return queryAll(sql, params);
}

/** 行そのもの（access 判定・存在確認に使う最小情報） */
export async function getManualRaw(id: string): Promise<Row | undefined> {
  return queryOne(
    'SELECT id, created_by, project_id, program_id, updated_at, updated_by FROM qsheet_manuals WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
}

export async function getManualWithMeta(id: string): Promise<Row | undefined> {
  return queryOne(`${SELECT_BASE} WHERE m.id = $1 AND m.deleted_at IS NULL`, [id]);
}

export async function getManualPages(manualId: string): Promise<Row[]> {
  return queryAll(
    `SELECT id, manual_id, sort_order, chapter, title, blocks, created_at, updated_at
     FROM qsheet_manual_pages WHERE manual_id = $1 ORDER BY sort_order`,
    [manualId],
  );
}

export interface CreateManualInput {
  title: string;
  projectId?: string | null;
  programId?: string | null;
  createdBy: string;
}

const MAX_TITLE = 500;

/**
 * 冊子を1件・ページ1枚（空）と一緒に作る。project_id / program_id はどちらか片方だけ
 * （migration の `qsheet_manuals_owner_ck` と同じ検証をアプリ側でも行う）。
 * 冊子は**必ず**発番する（§5-1・レンタル予約と違い条件分岐なし）。
 */
export async function createManual(input: CreateManualInput): Promise<Row> {
  const hasProject = !!input.projectId;
  const hasProgram = !!input.programId;
  if (hasProject === hasProgram) {
    throw new ValidationError('project_id と program_id はどちらか一方だけ指定してください');
  }

  const id = uuid();
  const docNo = await issueDocNo('manual');
  const title = (input.title || '').slice(0, MAX_TITLE);

  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO qsheet_manuals (id, doc_no, title, project_id, program_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, docNo, title, input.projectId || null, input.programId || null, input.createdBy, input.createdBy],
    );
    await tx.execute(
      `INSERT INTO qsheet_manual_pages (id, manual_id, sort_order, chapter, title, blocks)
       VALUES (?, ?, 0, NULL, '', '[]'::jsonb)`,
      [uuid(), id],
    );
  });

  const row = await getManualWithMeta(id);
  if (!row) throw new Error('createManual: INSERT 直後の SELECT が空でした');
  return row;
}

export interface UpdateManualInput {
  title?: string;
  expectedUpdatedAt?: unknown;
}

export async function updateManual(id: string, userId: string, input: UpdateManualInput): Promise<Row> {
  const existing = await queryOne(
    `SELECT m.id, m.created_by, m.updated_at, m.updated_by, u.name AS updater_name
     FROM qsheet_manuals m LEFT JOIN users u ON m.updated_by = u.id
     WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [id],
  );
  if (!existing) throw new NotFoundError('冊子が見つかりません');
  checkOptimisticLock(
    input.expectedUpdatedAt,
    { updated_at: existing.updated_at, updated_by: existing.updated_by, updater_name: existing.updater_name },
    userId,
    'この冊子',
  );

  const sets: string[] = ['updated_by = ?', 'updated_at = NOW()'];
  const params: unknown[] = [userId];
  if (typeof input.title === 'string') { sets.push('title = ?'); params.push(input.title.slice(0, MAX_TITLE)); }

  await execute(`UPDATE qsheet_manuals SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  const row = await getManualWithMeta(id);
  if (!row) throw new Error('updateManual: UPDATE 直後の SELECT が空でした');
  return row;
}

export async function deleteManual(id: string): Promise<void> {
  const existing = await queryOne('SELECT id FROM qsheet_manuals WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing) throw new NotFoundError('冊子が見つかりません');
  await execute('UPDATE qsheet_manuals SET deleted_at = NOW() WHERE id = $1', [id]);
}

export interface PageInput {
  title?: string;
  chapter?: string | null;
  /** 紙面の中身（ManualBlock[]）。段B。配列でなければ更新しない（型はここでは検証しない — クライアントの契約を信じる） */
  blocks?: unknown[];
  expectedUpdatedAt?: unknown;
}

const MAX_PAGE_TITLE = 200;
const MAX_CHAPTER = 200;
/** 紙面の中身（JSON化した文字列長）の上限。段B（1ページに詰め込みすぎた自由ブロックを弾く） */
const MAX_BLOCKS_JSON_LENGTH = 300_000;

export async function addPage(manualId: string, input: PageInput): Promise<Row> {
  const max = await queryOne(
    'SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM qsheet_manual_pages WHERE manual_id = $1',
    [manualId],
  );
  const sortOrder = ((max?.m as number) ?? -1) + 1;
  const id = uuid();

  await execute(
    `INSERT INTO qsheet_manual_pages (id, manual_id, sort_order, chapter, title, blocks)
     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb)`,
    [id, manualId, sortOrder, input.chapter?.slice(0, MAX_CHAPTER) || null, (input.title || '').slice(0, MAX_PAGE_TITLE)],
  );
  const row = await queryOne('SELECT id, manual_id, sort_order, chapter, title, blocks, created_at, updated_at FROM qsheet_manual_pages WHERE id = $1', [id]);
  if (!row) throw new Error('addPage: INSERT 直後の SELECT が空でした');
  return row;
}

/**
 * ページを更新する。段Bで楽観ロック（`updateManual()` と同じ形）と紙面（`blocks`）の
 * 保存を足した。`blocks` はページ単位（冊子まるごとではない）— 紙面は1ページずつ独立して
 * 自動保存するため（ManualDetailPage.tsx）。
 */
export async function updatePage(manualId: string, pageId: string, userId: string, input: PageInput): Promise<Row> {
  const existing = await queryOne(
    `SELECT p.id, p.updated_at, p.updated_by, u.name AS updater_name
     FROM qsheet_manual_pages p LEFT JOIN users u ON p.updated_by = u.id
     WHERE p.id = $1 AND p.manual_id = $2`,
    [pageId, manualId],
  );
  if (!existing) throw new NotFoundError('ページが見つかりません');
  checkOptimisticLock(
    input.expectedUpdatedAt,
    { updated_at: existing.updated_at, updated_by: existing.updated_by, updater_name: existing.updater_name },
    userId,
    'このページ',
  );

  const sets: string[] = ['updated_at = NOW()', 'updated_by = ?'];
  const params: unknown[] = [userId];
  if (typeof input.title === 'string') { sets.push('title = ?'); params.push(input.title.slice(0, MAX_PAGE_TITLE)); }
  if ('chapter' in input) { sets.push('chapter = ?'); params.push(input.chapter?.slice(0, MAX_CHAPTER) || null); }
  if (Array.isArray(input.blocks)) {
    const serialized = JSON.stringify(input.blocks);
    if (serialized.length > MAX_BLOCKS_JSON_LENGTH) {
      throw new ValidationError('紙面の中身が大きすぎます');
    }
    sets.push('blocks = ?');
    params.push(serialized);
  }

  await execute(`UPDATE qsheet_manual_pages SET ${sets.join(', ')} WHERE id = ?`, [...params, pageId]);
  const row = await queryOne('SELECT id, manual_id, sort_order, chapter, title, blocks, created_at, updated_at FROM qsheet_manual_pages WHERE id = $1', [pageId]);
  if (!row) throw new Error('updatePage: UPDATE 直後の SELECT が空でした');
  return row;
}

/** ページを消す。冊子最後の1ページは消せない（空の冊子を作れると編集画面が壊れるため） */
export async function deletePage(manualId: string, pageId: string): Promise<void> {
  const existing = await queryOne(
    'SELECT id FROM qsheet_manual_pages WHERE id = $1 AND manual_id = $2',
    [pageId, manualId],
  );
  if (!existing) throw new NotFoundError('ページが見つかりません');

  const count = await queryOne('SELECT COUNT(*)::int AS c FROM qsheet_manual_pages WHERE manual_id = $1', [manualId]);
  if (((count?.c as number) ?? 0) <= 1) {
    throw new ValidationError('最後の1ページは削除できません');
  }

  await execute('DELETE FROM qsheet_manual_pages WHERE id = $1', [pageId]);
}

interface ReorderEntry { id: string; sort_order: number }

/** 並べ替え。schedule-column.service.ts の reorderColumns() と同じ形 */
export async function reorderPages(manualId: string, order: ReorderEntry[]): Promise<Row[]> {
  if (!Array.isArray(order) || order.length === 0) throw new ValidationError('order を指定してください');
  for (const e of order) {
    if (typeof e.id !== 'string' || typeof e.sort_order !== 'number') {
      throw new ValidationError('order の形式が不正です');
    }
  }
  const ids = order.map((e) => e.id);
  const placeholders = ids.map((_, idx) => `$${idx + 2}`).join(', ');
  const existing = await queryAll(
    `SELECT id FROM qsheet_manual_pages WHERE manual_id = $1 AND id IN (${placeholders})`,
    [manualId, ...ids],
  );
  const existingIds = new Set(existing.map((r) => r.id as string));

  await withTransaction(async (tx) => {
    for (const e of order) {
      if (!existingIds.has(e.id)) continue; // 他人が消したページは静かに無視
      await tx.execute('UPDATE qsheet_manual_pages SET sort_order = ?, updated_at = NOW() WHERE id = ?', [e.sort_order, e.id]);
    }
  });

  return getManualPages(manualId);
}
