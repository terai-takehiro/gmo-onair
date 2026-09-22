/**
 * 技術資料（`qsheet_tech_docs`）— 一覧・詳細・CRUD・複製・確定/版・編集ロックと、
 * 中の行（映像パッチ `qsheet_tech_patch_rows`・技術スタッフ `qsheet_tech_staff_rows`）。
 * 設計: docs/design/v4/tech-docs.md §5-1（表）・§5-4（資料番号・権限・同時編集）・§5-5（API）。
 *
 * 実装パターンは `venue-layout.service.ts`（会場図面）をそのまま踏襲する——資料まるごとの
 * 編集ロック（10分で自動解除・60秒で延長）・`expected_updated_at` の楽観ロック・確定/版は
 * ほぼ同じ形。違うのは1点だけ:
 *   図面は品目を1行の JSONB 配列で持つが、技術資料は**正規化した行**を持つ（§5-1）。
 *   1行の編集は1行の UPDATE で済むので、ロックは「同じ資料を2人が同時に組み替える」ことを
 *   防ぐためだけに持つ（`assertHoldsLock` のような items 専用の厳しい検査は要らない）。
 *
 * ⚠️ 返り値は **`pg` の行をそのまま**（snake_case）返す。画面側は
 * `shared/src/tech/types.ts` の型でそのまま読む（camelCase へ写し替えない）。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, type Row } from '../../../shared/db/connection';
import { isQsheetAdmin } from '../access';
import { issueDocNo } from './docNo.service';
import { NotFoundError, ValidationError, ConflictError, LockError, checkOptimisticLock } from './httpErrors';

interface AccessUser { id: string; role: string; permissions?: Record<string, string> }

const MAX_TITLE = 500;
/** ロックの自動解除の目安（§5-4）。10分操作が無ければ空きとみなす */
const LOCK_STALE_MS = 10 * 60 * 1000;

/** 資料1件の列（`shared/src/tech/types.ts` の `TechDoc` と同じ並び） */
const DOC_COLUMNS = `
  t.id, t.doc_no, t.title, t.project_id, t.program_id, t.status, t.rev, t.copied_from,
  t.fixed_at, t.fixed_by, t.locked_by, t.locked_at, t.lock_requested_by, t.lock_requested_at,
  t.created_by, t.updated_by, t.created_at, t.updated_at
`;

const PATCH_ROW_COLUMNS = `
  id, tech_doc_id, group_label, sort_order, from_device_text, from_jack_id, from_jack_text,
  from_is_extra, to_device_text, to_jack_id, to_jack_text, to_is_extra, label, signal, note,
  created_at, updated_at
`;

const STAFF_ROW_COLUMNS = `
  id, tech_doc_id, to_char(work_date, 'YYYY-MM-DD') AS work_date, role, person_id, person_name,
  company_id, company_name, note, sort_order, created_at, updated_at
`;

// ============================================================
// 読む
// ============================================================

/**
 * `?project=` は**案件の id でも管理番号（GLS番号）でも**受ける。
 * `device-settings-owner.ts` の `resolveOwner` と同じ解決（改番前の番号も
 * `project_numbers` で拾う）。解決できなければ null（呼び出し元は空の一覧を返す）。
 */
export async function resolveProjectKey(key: string): Promise<string | null> {
  const k = (key ?? '').trim();
  if (!k) return null;
  const row = await queryOne(
    `SELECT id FROM projects
      WHERE deleted_at IS NULL
        AND (id = $1 OR gls_number = $1
             OR id = (SELECT project_id FROM project_numbers WHERE number = $1))`,
    [k],
  );
  return row ? (row.id as string) : null;
}

export interface ListFilter {
  /** 案件の id または管理番号（GLS番号） */
  project?: string;
  program_id?: string;
}

/**
 * 一覧（`TechDocListItem[]`）。可視性は `canAccessTechDoc`（作成者 / 案件メンバー /
 * assigned_to / 管理者）と同じ理屈を1本の SQL に展開したもの（`listVenueLayouts` と同じ形）。
 * 件数（パッチ行・スタッフ行・作業日・増設機材）は列に持たず数えて出す（§5-1）。
 */
export async function listTechDocs(user: AccessUser, filter: ListFilter): Promise<Row[]> {
  let projectId: string | null = null;
  if (filter.project) {
    projectId = await resolveProjectKey(filter.project);
    if (!projectId) return []; // 解決できない案件キー＝該当なし
  }

  const params: unknown[] = [];
  let i = 1;
  let sql = `
    SELECT ${DOC_COLUMNS},
           u.name AS updated_by_name,
           (SELECT COUNT(*) FROM qsheet_tech_patch_rows r WHERE r.tech_doc_id = t.id) AS patch_row_count,
           (SELECT COUNT(*) FROM qsheet_tech_staff_rows s WHERE s.tech_doc_id = t.id) AS staff_row_count,
           (SELECT COUNT(DISTINCT s.work_date) FROM qsheet_tech_staff_rows s WHERE s.tech_doc_id = t.id) AS staff_day_count,
           (SELECT COUNT(DISTINCT d.device) FROM (
              SELECT r.from_device_text AS device FROM qsheet_tech_patch_rows r
               WHERE r.tech_doc_id = t.id AND r.from_is_extra AND r.from_device_text <> ''
              UNION ALL
              SELECT r.to_device_text FROM qsheet_tech_patch_rows r
               WHERE r.tech_doc_id = t.id AND r.to_is_extra AND r.to_device_text <> ''
           ) d) AS extra_device_count
    FROM qsheet_tech_docs t
    LEFT JOIN users u ON t.updated_by = u.id
    WHERE t.deleted_at IS NULL`;

  if (!isQsheetAdmin(user)) {
    sql += ` AND (t.created_by = $${i} OR (t.project_id IS NOT NULL AND (
               EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $${i} AND pm.deleted_at IS NULL)
               OR EXISTS (SELECT 1 FROM projects pj WHERE pj.id = t.project_id AND pj.assigned_to = $${i})
             )))`;
    params.push(user.id);
    i++;
  }
  if (projectId) { sql += ` AND t.project_id = $${i++}`; params.push(projectId); }
  if (filter.program_id) { sql += ` AND t.program_id = $${i++}`; params.push(filter.program_id); }
  sql += ' ORDER BY t.updated_at DESC LIMIT 200';

  return queryAll(sql, params);
}

/** 行そのもの（access 判定・存在確認に使う最小情報） */
export async function getTechDocRaw(id: string): Promise<Row | undefined> {
  return queryOne(
    'SELECT id, created_by, project_id, program_id, updated_at, updated_by FROM qsheet_tech_docs WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
}

/** 資料1件（`TechDoc`） */
export async function getTechDoc(id: string): Promise<Row | undefined> {
  return queryOne(`SELECT ${DOC_COLUMNS} FROM qsheet_tech_docs t WHERE t.id = $1 AND t.deleted_at IS NULL`, [id]);
}

export async function listPatchRows(techDocId: string): Promise<Row[]> {
  return queryAll(
    `SELECT ${PATCH_ROW_COLUMNS} FROM qsheet_tech_patch_rows WHERE tech_doc_id = $1 ORDER BY sort_order, created_at`,
    [techDocId],
  );
}

export async function listStaffRows(techDocId: string): Promise<Row[]> {
  return queryAll(
    `SELECT ${STAFF_ROW_COLUMNS} FROM qsheet_tech_staff_rows WHERE tech_doc_id = $1 ORDER BY work_date, sort_order, created_at`,
    [techDocId],
  );
}

/** `GET /tech-docs/:id`（`TechDocDetail`） */
export async function getTechDocDetail(id: string): Promise<{
  doc: Row; patch_rows: Row[]; staff_rows: Row[]; locked_by_name: string | null; lock_requested_by_name: string | null;
} | undefined> {
  const doc = await getTechDoc(id);
  if (!doc) return undefined;
  const names = await getLockRow(id);
  // ⚠️ 直列に読む。`pg` のプールは1本のクライアントに2本のクエリを重ねると
  //    DeprecationWarning を出す（Promise.all で束ねない）
  const patchRows = await listPatchRows(id);
  const staffRows = await listStaffRows(id);
  return {
    doc,
    patch_rows: patchRows,
    staff_rows: staffRows,
    locked_by_name: (names?.locked_by_name as string | null) ?? null,
    lock_requested_by_name: (names?.lock_requested_by_name as string | null) ?? null,
  };
}

// ============================================================
// 編集してよいかの検査（§5-4。venue-layout.service.ts の同名の関数と同じ形）
// ============================================================

async function getLockRow(id: string): Promise<Row | undefined> {
  return queryOne(
    `SELECT t.id, t.status, t.locked_by, t.locked_at, t.lock_requested_by, t.lock_requested_at,
            lu.name AS locked_by_name, ru.name AS lock_requested_by_name
     FROM qsheet_tech_docs t
     LEFT JOIN users lu ON t.locked_by = lu.id
     LEFT JOIN users ru ON t.lock_requested_by = ru.id
     WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [id],
  );
}

function isLockStale(lockedAt: unknown): boolean {
  if (!lockedAt) return true;
  const ms = new Date(lockedAt as string).getTime();
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms > LOCK_STALE_MS;
}

/** 確定していないこと＋ロックを他人が新しく持っていないことの両方を見る */
export function assertTechDocEditable(doc: Row, userId: string): void {
  if (doc.status === 'fixed') {
    throw new ValidationError('確定済みです。編集するには確定を解いてください');
  }
  const lockedBy = (doc.locked_by as string | null) ?? null;
  if (lockedBy && lockedBy !== userId && !isLockStale(doc.locked_at)) {
    const name = (doc.locked_by_name as string | null) ?? null;
    throw new LockError(`${name || '他のユーザー'} さんが編集中です`, lockedBy, name);
  }
}

/** 書き込みの直前に必ず通す。速い失敗＋最新のロック状態の取得を兼ねる */
async function assertEditableById(id: string, userId: string): Promise<Row> {
  const doc = await getLockRow(id);
  if (!doc) throw new NotFoundError('技術資料が見つかりません');
  assertTechDocEditable(doc, userId);
  return doc;
}

/** `assertTechDocEditable` と同じ条件を SQL にも畳み込む（TOCTOU 対策）。
 *  `$` を2つ要求する: 資料id・呼び出し本人のuserId、この順 */
const EDITABLE_GUARD_SQL = `EXISTS (
    SELECT 1 FROM qsheet_tech_docs g
    WHERE g.id = $ID AND g.deleted_at IS NULL AND g.status != 'fixed'
      AND (g.locked_by IS NULL OR g.locked_by = $USER OR g.locked_at < NOW() - INTERVAL '10 minutes')
  )`;

function editableGuard(idIdx: number, userIdx: number): string {
  return EDITABLE_GUARD_SQL.replace('$ID', `$${idIdx}`).replace('$USER', `$${userIdx}`);
}

/** 資料の `updated_at` / `updated_by` を今にする（行を足す・直す・消すたびに呼ぶ） */
async function touchDoc(id: string, userId: string): Promise<void> {
  await execute('UPDATE qsheet_tech_docs SET updated_at = NOW(), updated_by = $1 WHERE id = $2', [userId, id]);
}

// ============================================================
// 資料の CRUD
// ============================================================

export interface CreateTechDocInput {
  title: string;
  projectId?: string | null;
  programId?: string | null;
  createdBy: string;
  /** 複製元（行を全部複製する。status は draft・rev は 0 に戻す） */
  copyFrom?: string | null;
}

export async function createTechDoc(input: CreateTechDocInput): Promise<Row> {
  const hasProject = !!input.projectId;
  const hasProgram = !!input.programId;
  if (hasProject === hasProgram) {
    throw new ValidationError('project_id と program_id はどちらか一方だけ指定してください');
  }

  // 存在しない番組 id をそのまま INSERT すると FK 違反で 500 になるので、先に見る
  // （案件 id は `canAssignTechDocProject`（ルート側）が見ている）
  if (input.programId) {
    const program = await queryOne('SELECT id FROM qsheet_programs WHERE id = $1 AND deleted_at IS NULL', [input.programId]);
    if (!program) throw new NotFoundError('番組が見つかりません');
  }

  const id = uuid();
  const docNo = await issueDocNo('tech');
  await execute(
    `INSERT INTO qsheet_tech_docs (id, doc_no, title, project_id, program_id, copied_from, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [id, docNo, (input.title || '').slice(0, MAX_TITLE), input.projectId || null, input.programId || null,
      input.copyFrom || null, input.createdBy],
  );

  if (input.copyFrom) {
    await copyRowsInto(id, input.copyFrom);
  }

  const row = await getTechDoc(id);
  if (!row) throw new Error('createTechDoc: INSERT 直後の SELECT が空でした');
  return row;
}

/** 複製元の映像パッチ行・技術スタッフ行を丸ごと写す（id だけ採り直す） */
async function copyRowsInto(newId: string, sourceId: string): Promise<void> {
  const patchRows = await listPatchRows(sourceId);
  const staffRows = await listStaffRows(sourceId);
  for (const r of patchRows) {
    await execute(
      `INSERT INTO qsheet_tech_patch_rows
         (id, tech_doc_id, group_label, sort_order, from_device_text, from_jack_id, from_jack_text, from_is_extra,
          to_device_text, to_jack_id, to_jack_text, to_is_extra, label, signal, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [uuid(), newId, r.group_label, r.sort_order, r.from_device_text, r.from_jack_id, r.from_jack_text,
        r.from_is_extra, r.to_device_text, r.to_jack_id, r.to_jack_text, r.to_is_extra, r.label, r.signal, r.note],
    );
  }
  for (const r of staffRows) {
    await execute(
      `INSERT INTO qsheet_tech_staff_rows
         (id, tech_doc_id, work_date, role, person_id, person_name, company_id, company_name, note, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [uuid(), newId, r.work_date, r.role, r.person_id, r.person_name, r.company_id, r.company_name, r.note, r.sort_order],
    );
  }
}

export interface UpdateTechDocInput {
  title?: string;
  expectedUpdatedAt?: unknown;
}

/** 名前を直す（楽観ロック）。確定は `fixTechDoc` を使う */
export async function updateTechDoc(id: string, userId: string, input: UpdateTechDocInput): Promise<Row> {
  await assertEditableById(id, userId);
  const meta = await getMeta(id);
  checkOptimisticLock(input.expectedUpdatedAt, meta, userId, 'この技術資料');

  const params: unknown[] = [];
  const sets: string[] = [`updated_by = $${params.push(userId)}`, 'updated_at = NOW()'];
  if (typeof input.title === 'string') sets.push(`title = $${params.push(input.title.slice(0, MAX_TITLE))}`);

  // `params.push()` は追加後の長さ＝1始まりの位置を返すので、そのまま `$n` に使える
  const idIdx = params.push(id);
  const userIdx = params.push(userId);
  let sql = `UPDATE qsheet_tech_docs SET ${sets.join(', ')} WHERE id = $${idIdx} AND ${editableGuard(idIdx, userIdx)}`;

  if (typeof input.expectedUpdatedAt === 'string' && !!input.expectedUpdatedAt) {
    sql += ` AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $${params.push(input.expectedUpdatedAt)}::timestamptz)`;
  }
  const updated = await queryOne(`${sql} RETURNING id`, params);
  if (!updated) {
    await assertEditableById(id, userId);
    const fresh = await getMeta(id);
    checkOptimisticLock(input.expectedUpdatedAt, fresh, userId, 'この技術資料');
    throw new ConflictError('この技術資料はほかの人が先に更新しました。', fresh.updated_at as string, (fresh.updater_name as string) ?? null);
  }
  const row = await getTechDoc(id);
  if (!row) throw new Error('updateTechDoc: UPDATE 直後の SELECT が空でした');
  return row;
}

async function getMeta(id: string): Promise<{ updated_at: unknown; updated_by: unknown; updater_name?: unknown }> {
  const row = await queryOne(
    `SELECT t.updated_at, t.updated_by, u.name AS updater_name
     FROM qsheet_tech_docs t LEFT JOIN users u ON t.updated_by = u.id
     WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [id],
  );
  if (!row) throw new NotFoundError('技術資料が見つかりません');
  return row as { updated_at: unknown; updated_by: unknown; updater_name?: unknown };
}

/** 論理削除 */
export async function deleteTechDoc(id: string, userId: string): Promise<void> {
  await assertEditableById(id, userId);
  const deleted = await queryOne(
    `UPDATE qsheet_tech_docs SET deleted_at = NOW(), updated_by = $2, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL AND status != 'fixed'
       AND (locked_by IS NULL OR locked_by = $2 OR locked_at < NOW() - INTERVAL '10 minutes')
     RETURNING id`,
    [id, userId],
  );
  if (!deleted) {
    await assertEditableById(id, userId);
    throw new Error('deleteTechDoc: 検査を通ったのに UPDATE が0件でした（想定外）');
  }
}

// ============================================================
// 確定・版（§5-4）
// ============================================================

export async function fixTechDoc(id: string, userId: string): Promise<Row> {
  const doc = await queryOne('SELECT id, status, updated_at FROM qsheet_tech_docs WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!doc) throw new NotFoundError('技術資料が見つかりません');
  if (doc.status !== 'draft') throw new ValidationError('先に確定を解いてください');

  const updated = await queryOne(
    `UPDATE qsheet_tech_docs
     SET status = 'fixed', rev = rev + 1, fixed_at = NOW(), fixed_by = $2, updated_by = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'draft'
       AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz)
     RETURNING id`,
    [id, userId, doc.updated_at],
  );
  if (!updated) {
    const fresh = await queryOne('SELECT status, updated_at FROM qsheet_tech_docs WHERE id = $1', [id]);
    if (!fresh) throw new NotFoundError('技術資料が見つかりません');
    if (fresh.status !== 'draft') throw new ValidationError('先に確定を解いてください');
    throw new ConflictError('この技術資料は確定の処理中に更新されました。もう一度確定をやり直してください。', fresh.updated_at as string, null);
  }
  const row = await getTechDoc(id);
  if (!row) throw new Error('fixTechDoc: UPDATE 直後の SELECT が空でした');
  return row;
}

/** 確定を解く。`rev`・`fixed_at`・`fixed_by` は変えない */
export async function unfixTechDoc(id: string, userId: string): Promise<Row> {
  const doc = await queryOne('SELECT id, status FROM qsheet_tech_docs WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!doc) throw new NotFoundError('技術資料が見つかりません');
  if (doc.status !== 'fixed') throw new ValidationError('まだ確定していません');
  await execute(
    `UPDATE qsheet_tech_docs SET status = 'draft', updated_by = $2, updated_at = NOW() WHERE id = $1`,
    [id, userId],
  );
  const row = await getTechDoc(id);
  if (!row) throw new Error('unfixTechDoc: UPDATE 直後の SELECT が空でした');
  return row;
}

// ============================================================
// 編集ロック（資料まるごと・§5-4）
// ============================================================

/** 取る／延長する（60秒ハートビート）。取れなければ 409（`LockError`） */
export async function acquireTechDocLock(id: string, userId: string): Promise<Row> {
  // ⚠️ 引き継ぎの申し出（lock_requested_by）は**持ち主が変わったときだけ**消す。
  //    この UPDATE は 60 秒ごとの延長でも走るので、無条件に NULL にすると
  //    「編集を要求」を押しても次の延長（最大60秒後・保持者が開き直せば即座）に
  //    消えてしまい、保持者には一度も伝わらなかった（実ブラウザで踏んだ）。
  //    `locked_by` は SET の右辺では**更新前の値**なので、これで持ち主の交代だけを見分けられる。
  const acquired = await queryOne(
    `UPDATE qsheet_tech_docs
     SET locked_by = $2, locked_at = NOW(),
         lock_requested_by = CASE WHEN locked_by IS DISTINCT FROM $2 THEN NULL ELSE lock_requested_by END,
         lock_requested_at = CASE WHEN locked_by IS DISTINCT FROM $2 THEN NULL ELSE lock_requested_at END
     WHERE id = $1 AND deleted_at IS NULL AND status != 'fixed'
       AND (locked_by IS NULL OR locked_by = $2 OR locked_at < NOW() - INTERVAL '10 minutes')
     RETURNING id`,
    [id, userId],
  );
  const doc = await getLockRow(id);
  if (!doc) throw new NotFoundError('技術資料が見つかりません');
  if (!acquired) {
    if (doc.status === 'fixed') throw new ValidationError('確定済みです。編集するには確定を解いてください');
    const name = (doc.locked_by_name as string | null) ?? null;
    throw new LockError(`${name || '他のユーザー'} さんが編集中です`, (doc.locked_by as string | null) ?? null, name);
  }
  return doc;
}

/** 放す。自分が保持者のときだけ */
export async function releaseTechDocLock(id: string, userId: string): Promise<Row> {
  const existing = await getLockRow(id);
  if (!existing) throw new NotFoundError('技術資料が見つかりません');
  await execute('UPDATE qsheet_tech_docs SET locked_by = NULL, locked_at = NULL WHERE id = $1 AND locked_by = $2', [id, userId]);
  const doc = await getLockRow(id);
  if (!doc) throw new Error('releaseTechDocLock: UPDATE 直後の SELECT が空でした');
  return doc;
}

/** 交代を申し出る。自分が保持者でないときだけ書き込む */
export async function requestTechDocLockHandoff(id: string, userId: string): Promise<Row> {
  const existing = await getLockRow(id);
  if (!existing) throw new NotFoundError('技術資料が見つかりません');
  if (existing.locked_by !== userId) {
    await execute('UPDATE qsheet_tech_docs SET lock_requested_by = $2, lock_requested_at = NOW() WHERE id = $1', [id, userId]);
  }
  const doc = await getLockRow(id);
  if (!doc) throw new Error('requestTechDocLockHandoff: UPDATE 直後の SELECT が空でした');
  return doc;
}

/** 強制的に引き継ぐ（manager。呼び出し元で権限を確認済みという前提） */
export async function takeoverTechDocLock(id: string, userId: string): Promise<Row> {
  const existing = await getLockRow(id);
  if (!existing) throw new NotFoundError('技術資料が見つかりません');
  await execute(
    `UPDATE qsheet_tech_docs SET locked_by = $2, locked_at = NOW(), lock_requested_by = NULL, lock_requested_at = NULL WHERE id = $1`,
    [id, userId],
  );
  const doc = await getLockRow(id);
  if (!doc) throw new Error('takeoverTechDocLock: UPDATE 直後の SELECT が空でした');
  return doc;
}

// ============================================================
// 映像パッチの行・技術スタッフの行
// ============================================================

/** 文字列の列は NOT NULL DEFAULT '' なので、null は空文字に寄せる */
function text(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function nullableId(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}
function bool(v: unknown): boolean {
  return v === true || v === 'true';
}

const PATCH_TEXT_FIELDS = ['group_label', 'from_device_text', 'from_jack_text', 'to_device_text', 'to_jack_text', 'label', 'signal', 'note'] as const;
const STAFF_TEXT_FIELDS = ['role', 'person_name', 'company_name', 'note'] as const;

async function nextSortOrder(table: string, techDocId: string, extraWhere = '', extraParams: unknown[] = []): Promise<number> {
  const row = await queryOne(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${table} WHERE tech_doc_id = $1${extraWhere}`,
    [techDocId, ...extraParams],
  );
  return Number(row?.n ?? 0);
}

export async function createPatchRow(techDocId: string, userId: string, body: Record<string, unknown>): Promise<Row> {
  await assertEditableById(techDocId, userId);
  const id = uuid();
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : await nextSortOrder('qsheet_tech_patch_rows', techDocId);
  await execute(
    `INSERT INTO qsheet_tech_patch_rows
       (id, tech_doc_id, group_label, sort_order, from_device_text, from_jack_id, from_jack_text, from_is_extra,
        to_device_text, to_jack_id, to_jack_text, to_is_extra, label, signal, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [id, techDocId, text(body.group_label), sortOrder, text(body.from_device_text), nullableId(body.from_jack_id),
      text(body.from_jack_text), bool(body.from_is_extra), text(body.to_device_text), nullableId(body.to_jack_id),
      text(body.to_jack_text), bool(body.to_is_extra), text(body.label), text(body.signal), text(body.note, 2000)],
  );
  await touchDoc(techDocId, userId);
  const row = await queryOne(`SELECT ${PATCH_ROW_COLUMNS} FROM qsheet_tech_patch_rows WHERE id = $1`, [id]);
  if (!row) throw new Error('createPatchRow: INSERT 直後の SELECT が空でした');
  return row;
}

export async function updatePatchRow(techDocId: string, rowId: string, userId: string, body: Record<string, unknown>): Promise<Row> {
  await assertEditableById(techDocId, userId);
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let i = 1;
  for (const f of PATCH_TEXT_FIELDS) {
    if (f in body) { sets.push(`${f} = $${i++}`); params.push(text(body[f], f === 'note' ? 2000 : 500)); }
  }
  if ('sort_order' in body) { sets.push(`sort_order = $${i++}`); params.push(Number(body.sort_order) || 0); }
  for (const f of ['from_jack_id', 'to_jack_id'] as const) {
    if (f in body) { sets.push(`${f} = $${i++}`); params.push(nullableId(body[f])); }
  }
  for (const f of ['from_is_extra', 'to_is_extra'] as const) {
    if (f in body) { sets.push(`${f} = $${i++}`); params.push(bool(body[f])); }
  }
  const updated = await queryOne(
    `UPDATE qsheet_tech_patch_rows SET ${sets.join(', ')} WHERE id = $${i++} AND tech_doc_id = $${i++} RETURNING id`,
    [...params, rowId, techDocId],
  );
  if (!updated) throw new NotFoundError('行が見つかりません');
  await touchDoc(techDocId, userId);
  const row = await queryOne(`SELECT ${PATCH_ROW_COLUMNS} FROM qsheet_tech_patch_rows WHERE id = $1`, [rowId]);
  if (!row) throw new Error('updatePatchRow: UPDATE 直後の SELECT が空でした');
  return row;
}

export async function deletePatchRow(techDocId: string, rowId: string, userId: string): Promise<void> {
  await assertEditableById(techDocId, userId);
  const deleted = await queryOne('DELETE FROM qsheet_tech_patch_rows WHERE id = $1 AND tech_doc_id = $2 RETURNING id', [rowId, techDocId]);
  if (!deleted) throw new NotFoundError('行が見つかりません');
  await touchDoc(techDocId, userId);
}

/** 並べ替え（`{ order: string[] }` の順に sort_order を振り直す） */
export async function reorderPatchRows(techDocId: string, userId: string, order: string[]): Promise<Row[]> {
  await assertEditableById(techDocId, userId);
  for (let n = 0; n < order.length; n++) {
    await execute('UPDATE qsheet_tech_patch_rows SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND tech_doc_id = $3', [n, order[n], techDocId]);
  }
  await touchDoc(techDocId, userId);
  return listPatchRows(techDocId);
}

export async function createStaffRow(techDocId: string, userId: string, body: Record<string, unknown>): Promise<Row> {
  await assertEditableById(techDocId, userId);
  const workDate = typeof body.work_date === 'string' ? body.work_date.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new ValidationError('作業日を指定してください');
  const id = uuid();
  const sortOrder = typeof body.sort_order === 'number'
    ? body.sort_order
    : await nextSortOrder('qsheet_tech_staff_rows', techDocId, ' AND work_date = $2', [workDate]);
  await execute(
    `INSERT INTO qsheet_tech_staff_rows
       (id, tech_doc_id, work_date, role, person_id, person_name, company_id, company_name, note, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, techDocId, workDate, text(body.role, 100), nullableId(body.person_id), text(body.person_name, 200),
      nullableId(body.company_id), text(body.company_name, 200), text(body.note, 2000), sortOrder],
  );
  await touchDoc(techDocId, userId);
  const row = await queryOne(`SELECT ${STAFF_ROW_COLUMNS} FROM qsheet_tech_staff_rows WHERE id = $1`, [id]);
  if (!row) throw new Error('createStaffRow: INSERT 直後の SELECT が空でした');
  return row;
}

export async function updateStaffRow(techDocId: string, rowId: string, userId: string, body: Record<string, unknown>): Promise<Row> {
  await assertEditableById(techDocId, userId);
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let i = 1;
  if ('work_date' in body) {
    const workDate = typeof body.work_date === 'string' ? body.work_date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new ValidationError('作業日を指定してください');
    sets.push(`work_date = $${i++}`);
    params.push(workDate);
  }
  for (const f of STAFF_TEXT_FIELDS) {
    if (f in body) { sets.push(`${f} = $${i++}`); params.push(text(body[f], f === 'note' ? 2000 : 200)); }
  }
  for (const f of ['person_id', 'company_id'] as const) {
    if (f in body) { sets.push(`${f} = $${i++}`); params.push(nullableId(body[f])); }
  }
  if ('sort_order' in body) { sets.push(`sort_order = $${i++}`); params.push(Number(body.sort_order) || 0); }
  const updated = await queryOne(
    `UPDATE qsheet_tech_staff_rows SET ${sets.join(', ')} WHERE id = $${i++} AND tech_doc_id = $${i++} RETURNING id`,
    [...params, rowId, techDocId],
  );
  if (!updated) throw new NotFoundError('行が見つかりません');
  await touchDoc(techDocId, userId);
  const row = await queryOne(`SELECT ${STAFF_ROW_COLUMNS} FROM qsheet_tech_staff_rows WHERE id = $1`, [rowId]);
  if (!row) throw new Error('updateStaffRow: UPDATE 直後の SELECT が空でした');
  return row;
}

export async function deleteStaffRow(techDocId: string, rowId: string, userId: string): Promise<void> {
  await assertEditableById(techDocId, userId);
  const deleted = await queryOne('DELETE FROM qsheet_tech_staff_rows WHERE id = $1 AND tech_doc_id = $2 RETURNING id', [rowId, techDocId]);
  if (!deleted) throw new NotFoundError('行が見つかりません');
  await touchDoc(techDocId, userId);
}

/** 並べ替え（作業日の中での並び。`{ order: string[] }` の順に sort_order を振り直す） */
export async function reorderStaffRows(techDocId: string, userId: string, order: string[]): Promise<Row[]> {
  await assertEditableById(techDocId, userId);
  for (let n = 0; n < order.length; n++) {
    await execute('UPDATE qsheet_tech_staff_rows SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND tech_doc_id = $3', [n, order[n], techDocId]);
  }
  await touchDoc(techDocId, userId);
  return listStaffRows(techDocId);
}
