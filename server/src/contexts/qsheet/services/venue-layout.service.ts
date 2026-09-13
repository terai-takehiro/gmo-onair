/**
 * 会場図面（`qsheet_venue_layouts`）— 一覧・詳細・CRUD・複製・楽観ロック・編集ロック・確定/版。
 * 設計: docs/design/v4/venue-layout.md §5（データの持ち方）・§6②③（編集・仕上がり）・
 * §7（一気に並べる。品目の保存形は素通しでよい——並べ方の計算は shared/src/venue/arrange.ts
 * の純粋関数がクライアント側で行い、ここは出来上がった items をそのまま受け取るだけ）。
 *
 * 実装パターンは manual.service.ts（`qsheet_manuals`）をそのまま踏襲する——図面まるごとの
 * 編集ロック・確定/版・楽観ロックの CAS はほぼ同じ形。違うのは3点:
 *   ① マニュアルは `blocks` をページ単位（複数行）で持つが、図面は `items` を1行の
 *      JSONB 配列で持つ（§5-1「なぜ図面1件 = 1行・品目はJSONBの配列か」）——ページの
 *      追加/削除/並べ替えに相当する操作が無いぶん、CRUD はシンプルになる。
 *   ② 図面には resolveLinkedBlock を経由する差し込みブロックが無い（図面はマニュアル側から
 *      差し込まれる側）——fixVenueLayout は「確定・版」の骨だけで、フリーズ処理を持たない。
 *   ③ 品目の丸ごと置換（PUT .../items）は「いま自分がロックを持っている」ことを
 *      明示的に要求する（§5-6）——manual の updatePage より一段厳しい。詳しくは
 *      `assertHoldsVenueLayoutLock` のコメント参照。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, type Row } from '../../../shared/db/connection';
import { isQsheetAdmin } from '../access';
import { issueDocNo } from './docNo.service';
import { NotFoundError, ValidationError, ConflictError, LockError, checkOptimisticLock } from './httpErrors';
import type { VenueLayoutStatus } from '../types/venue';

interface AccessUser { id: string; role: string; permissions?: Record<string, string> }

/** 一覧・PATCH 応答が使う列（`items` は含めない——一覧は最大200件、`items` は1行最大
 *  300,000字にもなり得るため、詳細取得（`getVenueLayoutDetail`）でだけ別に読む） */
const SELECT_BASE = `
  SELECT v.id, v.doc_no, v.title, v.project_id, v.program_id, v.floor_id, v.area_id,
         v.plan_label, v.copied_from, v.status, v.rev,
         v.created_by, v.updated_by, v.created_at, v.updated_at,
         u.name AS creator_name, uu.name AS updater_name,
         p.name AS project_name, p.gls_number,
         pr.name AS program_name,
         f.floor_label, a.label AS area_label,
         v.locked_by, lu.name AS locked_by_name, v.locked_at,
         v.lock_requested_by, ru.name AS lock_requested_by_name, v.lock_requested_at
  FROM qsheet_venue_layouts v
  LEFT JOIN users u ON v.created_by = u.id
  LEFT JOIN users uu ON v.updated_by = uu.id
  LEFT JOIN projects p ON v.project_id = p.id
  LEFT JOIN qsheet_programs pr ON v.program_id = pr.id
  LEFT JOIN qsheet_venue_floors f ON v.floor_id = f.id
  LEFT JOIN qsheet_venue_areas a ON v.area_id = a.id
  LEFT JOIN users lu ON v.locked_by = lu.id
  LEFT JOIN users ru ON v.lock_requested_by = ru.id
`;

/** `SELECT_BASE` に `items` を足しただけの詳細用 SELECT（§5-2「品目1個の形」） */
const DETAIL_SELECT = `
  SELECT v.id, v.doc_no, v.title, v.project_id, v.program_id, v.floor_id, v.area_id,
         v.plan_label, v.copied_from, v.status, v.rev, v.items,
         v.created_by, v.updated_by, v.created_at, v.updated_at,
         u.name AS creator_name, uu.name AS updater_name,
         p.name AS project_name, p.gls_number,
         pr.name AS program_name,
         f.floor_label, a.label AS area_label,
         v.locked_by, lu.name AS locked_by_name, v.locked_at,
         v.lock_requested_by, ru.name AS lock_requested_by_name, v.lock_requested_at
  FROM qsheet_venue_layouts v
  LEFT JOIN users u ON v.created_by = u.id
  LEFT JOIN users uu ON v.updated_by = uu.id
  LEFT JOIN projects p ON v.project_id = p.id
  LEFT JOIN qsheet_programs pr ON v.program_id = pr.id
  LEFT JOIN qsheet_venue_floors f ON v.floor_id = f.id
  LEFT JOIN qsheet_venue_areas a ON v.area_id = a.id
  LEFT JOIN users lu ON v.locked_by = lu.id
  LEFT JOIN users ru ON v.lock_requested_by = ru.id
`;

export interface ListFilter {
  project_id?: string;
  program_id?: string;
}

export const VENUE_LAYOUT_STATUSES = ['draft', 'fixed', 'archived'] as const;

/**
 * 一覧。可視性は `canAccessVenueLayout`（作成者 / 案件メンバー / assigned_to / 管理者）と
 * 同じ理屈を1本の SQL に展開したもの（`manual.service.ts` の `listManuals` と同じ形。§5-5）。
 */
export async function listVenueLayouts(user: AccessUser, filter: ListFilter): Promise<Row[]> {
  let sql = `${SELECT_BASE} WHERE v.deleted_at IS NULL`;
  const params: unknown[] = [];
  let i = 1;

  if (!isQsheetAdmin(user)) {
    sql += ` AND (v.created_by = $${i} OR (v.project_id IS NOT NULL AND (
               EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = v.project_id AND pm.user_id = $${i} AND pm.deleted_at IS NULL)
               OR EXISTS (SELECT 1 FROM projects pj WHERE pj.id = v.project_id AND pj.assigned_to = $${i})
             )))`;
    params.push(user.id);
    i++;
  }
  if (filter.project_id) { sql += ` AND v.project_id = $${i++}`; params.push(filter.project_id); }
  if (filter.program_id) { sql += ` AND v.program_id = $${i++}`; params.push(filter.program_id); }
  sql += ' ORDER BY v.updated_at DESC LIMIT 200';

  return queryAll(sql, params);
}

/** 行そのもの（access 判定・存在確認に使う最小情報。`manuals.routes.ts` の `requireAccessible` と同じ形） */
export async function getVenueLayoutRaw(id: string): Promise<Row | undefined> {
  return queryOne(
    'SELECT id, created_by, project_id, program_id, updated_at, updated_by FROM qsheet_venue_layouts WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
}

export async function getVenueLayoutWithMeta(id: string): Promise<Row | undefined> {
  return queryOne(`${SELECT_BASE} WHERE v.id = $1 AND v.deleted_at IS NULL`, [id]);
}

/** 図面＋`items`（§5-2 の `VenueItem[]`。JSONB→配列。pg が自動で変換するので JSON.parse は不要） */
export async function getVenueLayoutDetail(id: string): Promise<Row | undefined> {
  const row = await queryOne(`${DETAIL_SELECT} WHERE v.id = $1 AND v.deleted_at IS NULL`, [id]);
  if (!row) return undefined;
  return { ...row, items: Array.isArray(row.items) ? row.items : [] };
}

// ============================================================
// 編集ロック・確定状態の判定（§5-6。manual.service.ts の assertEditable と同じ形）
// ============================================================

async function getVenueLayoutLockRow(id: string): Promise<Row | undefined> {
  return queryOne(
    `SELECT v.id, v.status, v.locked_by, v.locked_at, v.lock_requested_by, v.lock_requested_at,
            lu.name AS locked_by_name, ru.name AS lock_requested_by_name
     FROM qsheet_venue_layouts v
     LEFT JOIN users lu ON v.locked_by = lu.id
     LEFT JOIN users ru ON v.lock_requested_by = ru.id
     WHERE v.id = $1 AND v.deleted_at IS NULL`,
    [id],
  );
}

/** ロックの自動解除の目安（§5-6）。10分操作が無ければ空きとみなす */
const LOCK_STALE_MS = 10 * 60 * 1000;

function isLockStale(lockedAt: unknown): boolean {
  if (!lockedAt) return true;
  const ms = new Date(lockedAt as string).getTime();
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms > LOCK_STALE_MS;
}

/**
 * 書き込んでよいかの検査（§5-6）。ロック（自分が保持者 / 未取得 / stale のいずれか）と
 * 確定していないこと（status !== 'fixed'）の両方を見る——`updateVenueLayout`・
 * `deleteVenueLayout` の冒頭で呼ぶ。`items` の丸ごと置換（`updateVenueItems`）だけは
 * これより厳しい `assertHoldsVenueLayoutLock` を使う。
 */
export function assertVenueLayoutEditable(layout: Row, userId: string): void {
  if (layout.status === 'fixed') {
    throw new ValidationError('確定済みです。編集するには確定を解いてください');
  }
  const lockedBy = (layout.locked_by as string | null) ?? null;
  if (lockedBy && lockedBy !== userId && !isLockStale(layout.locked_at)) {
    const name = (layout.locked_by_name as string | null) ?? null;
    throw new LockError(`${name || '他のユーザー'} さんが編集中です`, lockedBy, name);
  }
}

/**
 * `items` の丸ごと置換だけが使う、より厳しい検査。**いま自分がロックを持っていること**を
 * 要求する（`locked_by IS NULL` は「まだ誰も取っていない」ではなく「取ってから保存して
 * ください」として弾く）——編集画面は開いた瞬間に自動でロックを取る設計（§5-6「取り方」）
 * なので、ロックが無いまま items を送ってくるのは想定外の経路（API を直接叩く等）であり、
 * 黙って通すと「図面まるごとの編集ロック」という同時編集の砦（§5-6）が items だけ迂回できて
 * しまう。
 */
function assertHoldsVenueLayoutLock(layout: Row, userId: string): void {
  if (layout.status === 'fixed') {
    throw new ValidationError('確定済みです。編集するには確定を解いてください');
  }
  const lockedBy = (layout.locked_by as string | null) ?? null;
  if (!lockedBy || isLockStale(layout.locked_at)) {
    throw new LockError('編集ロックを取得してから保存してください', null, null);
  }
  if (lockedBy !== userId) {
    const name = (layout.locked_by_name as string | null) ?? null;
    throw new LockError(`${name || '他のユーザー'} さんが編集中です`, lockedBy, name);
  }
}

/** `assertVenueLayoutEditable` と同じ条件を SQL で再検査する WHERE 句の断片（TOCTOU 対策。
 *  `?` を2つ要求する: 図面id・呼び出し本人のuserId、この順）。`manual.service.ts` の
 *  `EDITABLE_GUARD_SQL` と同じ考え方——事前チェックと書き込みの間に他人が引き継ぐ／確定する
 *  競合を、書き込み自体の WHERE 句に畳み込んで閉じる。 */
const EDITABLE_GUARD_SQL = `EXISTS (
    SELECT 1 FROM qsheet_venue_layouts v
    WHERE v.id = ? AND v.deleted_at IS NULL AND v.status != 'fixed'
      AND (v.locked_by IS NULL OR v.locked_by = ? OR v.locked_at < NOW() - INTERVAL '10 minutes')
  )`;

/** `assertHoldsVenueLayoutLock` と同じ条件の WHERE 句断片（`items` の UPDATE 専用。
 *  `?` を2つ要求する: 図面id・呼び出し本人のuserId、この順）。 */
const HOLDS_LOCK_GUARD_SQL = `EXISTS (
    SELECT 1 FROM qsheet_venue_layouts v
    WHERE v.id = ? AND v.deleted_at IS NULL AND v.status != 'fixed'
      AND v.locked_by = ? AND v.locked_at >= NOW() - INTERVAL '10 minutes'
  )`;

// ============================================================
// CRUD
// ============================================================

export interface CreateVenueLayoutInput {
  title: string;
  projectId?: string | null;
  programId?: string | null;
  floorId: string;
  areaId?: string | null;
  planLabel?: string | null;
  createdBy: string;
  /** 前の図面から複製する（§6①「ひな形／前の図面を複製」。ひな形＝指定しない＝空の items） */
  copyFromLayoutId?: string | null;
}

const MAX_TITLE = 500;
/** `items`（JSONB。中身は untyped）の JSON化した文字列長の上限。`manual.service.ts` の
 *  `MAX_BLOCKS_JSON_LENGTH` と同じ値（§5-1「品目は劇場形式80脚でも1個200バイト程度で、
 *  300,000字の上限に収まる」） */
const MAX_ITEMS_JSON_LENGTH = 300_000;

/**
 * 図面を1件作る。project_id / program_id はどちらか片方だけ（migration の
 * `qsheet_venue_layouts_owner_ck` と同じ検証をアプリ側でも行う）。**必ず**発番する
 * （§5-3「図面は冊子と同じ『必ず発番』」——運営マニュアルから `sourceId` で指すため）。
 * `copyFromLayoutId` があれば、その図面の `items` を丸ごと複製する（§6①）。
 */
export async function createVenueLayout(input: CreateVenueLayoutInput): Promise<Row> {
  const hasProject = !!input.projectId;
  const hasProgram = !!input.programId;
  if (hasProject === hasProgram) {
    throw new ValidationError('project_id と program_id はどちらか一方だけ指定してください');
  }
  if (!input.floorId) {
    throw new ValidationError('floor_id を指定してください');
  }

  let items: unknown[] = [];
  if (input.copyFromLayoutId) {
    const source = await queryOne(
      'SELECT items FROM qsheet_venue_layouts WHERE id = $1 AND deleted_at IS NULL',
      [input.copyFromLayoutId],
    );
    if (!source) throw new NotFoundError('複製元の図面が見つかりません');
    items = Array.isArray(source.items) ? (source.items as unknown[]) : [];
  }

  const id = uuid();
  const docNo = await issueDocNo('venue');
  const title = (input.title || '').slice(0, MAX_TITLE);

  await execute(
    `INSERT INTO qsheet_venue_layouts
       (id, doc_no, title, project_id, program_id, floor_id, area_id, plan_label, copied_from, items, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, docNo, title, input.projectId || null, input.programId || null, input.floorId, input.areaId || null,
      input.planLabel || null, input.copyFromLayoutId || null, JSON.stringify(items), input.createdBy, input.createdBy,
    ],
  );

  const row = await getVenueLayoutDetail(id);
  if (!row) throw new Error('createVenueLayout: INSERT 直後の SELECT が空でした');
  return row;
}

export interface CopyVenueLayoutInput {
  /** 省略時は「元の名前＋のコピー」 */
  title?: string;
  /** `undefined` = 元と同じ案を引き継ぐ／`null` = 明示的にクリア／文字列 = 新しい案名 */
  planLabel?: string | null;
}

/** `POST /venue-layouts/:id/copy`。既存の1件を丸ごと複製する——`createVenueLayout` の
 *  `copyFromLayoutId` 経路を、既存図面を起点にした呼び出しに畳んだだけ（§5-4・§6①「複製」）。 */
export async function copyVenueLayout(sourceId: string, userId: string, input: CopyVenueLayoutInput): Promise<Row> {
  const source = await queryOne(
    'SELECT project_id, program_id, floor_id, area_id, title, plan_label FROM qsheet_venue_layouts WHERE id = $1 AND deleted_at IS NULL',
    [sourceId],
  );
  if (!source) throw new NotFoundError('複製元の図面が見つかりません');

  return createVenueLayout({
    title: input.title ?? `${(source.title as string) || '（無題）'}のコピー`,
    projectId: (source.project_id as string | null) ?? null,
    programId: (source.program_id as string | null) ?? null,
    floorId: source.floor_id as string,
    areaId: (source.area_id as string | null) ?? null,
    planLabel: 'planLabel' in input ? (input.planLabel ?? null) : ((source.plan_label as string | null) ?? null),
    createdBy: userId,
    copyFromLayoutId: sourceId,
  });
}

export interface UpdateVenueLayoutInput {
  title?: string;
  /** `undefined` = 変更しない／`null` または文字列 = 差し替え */
  planLabel?: string | null;
  areaId?: string | null;
  /** `'fixed'` はここでは受け付けない——確定は `fixVenueLayout`（rev を進める・manager 限定）を使う */
  status?: VenueLayoutStatus;
  expectedUpdatedAt?: unknown;
}

/** 名前・案・エリア・状態（`archived` への出し入れ）を直す。§5-4 PATCH */
export async function updateVenueLayout(id: string, userId: string, input: UpdateVenueLayoutInput): Promise<Row> {
  const existing = await queryOne(
    `SELECT v.id, v.created_by, v.updated_at, v.updated_by, v.status, v.locked_by, v.locked_at,
            u.name AS updater_name, lu.name AS locked_by_name
     FROM qsheet_venue_layouts v
     LEFT JOIN users u ON v.updated_by = u.id
     LEFT JOIN users lu ON v.locked_by = lu.id
     WHERE v.id = $1 AND v.deleted_at IS NULL`,
    [id],
  );
  if (!existing) throw new NotFoundError('図面が見つかりません');
  assertVenueLayoutEditable(existing, userId);
  // 事前の検査（速い失敗）。⚠️ これだけでは TOCTOU を防げない——下の UPDATE 自体にも
  // 同じ比較を畳み込む（`manual.service.ts` の `updateManual` と同じ考え方）。
  checkOptimisticLock(
    input.expectedUpdatedAt,
    { updated_at: existing.updated_at, updated_by: existing.updated_by, updater_name: existing.updater_name },
    userId,
    'この図面',
  );

  const sets: string[] = ['updated_by = ?', 'updated_at = NOW()'];
  const params: unknown[] = [userId];
  if (typeof input.title === 'string') { sets.push('title = ?'); params.push(input.title.slice(0, MAX_TITLE)); }
  if ('planLabel' in input) { sets.push('plan_label = ?'); params.push(input.planLabel || null); }
  if ('areaId' in input) { sets.push('area_id = ?'); params.push(input.areaId || null); }
  if (typeof input.status === 'string') {
    if (!(VENUE_LAYOUT_STATUSES as readonly string[]).includes(input.status)) {
      throw new ValidationError('status が不正です');
    }
    if (input.status === 'fixed') {
      throw new ValidationError('確定するには「確定する」を使ってください');
    }
    sets.push('status = ?');
    params.push(input.status);
  }

  const hasExpected = typeof input.expectedUpdatedAt === 'string' && !!input.expectedUpdatedAt;
  let updateSql = `UPDATE qsheet_venue_layouts SET ${sets.join(', ')} WHERE id = ? AND ${EDITABLE_GUARD_SQL}`;
  const updateParams: unknown[] = [...params, id, id, userId];
  if (hasExpected) {
    updateSql += ` AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ?::timestamptz)`;
    updateParams.push(input.expectedUpdatedAt);
  }
  const updated = await queryOne(`${updateSql} RETURNING id`, updateParams);
  if (!updated) {
    const freshLayout = await getVenueLayoutLockRow(id);
    if (!freshLayout) throw new NotFoundError('図面が見つかりません');
    assertVenueLayoutEditable(freshLayout, userId);
    const fresh = await queryOne(
      `SELECT v.updated_at, v.updated_by, u.name AS updater_name
       FROM qsheet_venue_layouts v LEFT JOIN users u ON v.updated_by = u.id
       WHERE v.id = $1 AND v.deleted_at IS NULL`,
      [id],
    );
    if (!fresh) throw new NotFoundError('図面が見つかりません');
    checkOptimisticLock(
      input.expectedUpdatedAt,
      { updated_at: fresh.updated_at, updated_by: fresh.updated_by, updater_name: fresh.updater_name },
      userId,
      'この図面',
    );
    throw new ConflictError('この図面はほかの人が先に更新しました。', fresh.updated_at as string, (fresh.updater_name as string) ?? null);
  }
  const row = await getVenueLayoutWithMeta(id);
  if (!row) throw new Error('updateVenueLayout: UPDATE 直後の SELECT が空でした');
  return row;
}

export interface UpdateVenueItemsInput {
  items: unknown[];
  expectedUpdatedAt: unknown;
}

/**
 * `items` を丸ごと置換する（`PUT .../items`。§5-4「`expected_updated_at` **必須**」）。
 * 編集ロックを**いま自分が持っている**ことを確認してから置換する（`assertHoldsVenueLayoutLock`。
 * §5-6）。CAS（`updated_at` の突き合わせ）も外さない——ロックは利用者単位で、同じ人の
 * 2つのタブ／自動保存の取りこぼしからは守らないため（`manual.service.ts` の `updatePage` と
 * 同じ理由）。
 */
export async function updateVenueItems(id: string, userId: string, input: UpdateVenueItemsInput): Promise<Row> {
  if (!Array.isArray(input.items)) throw new ValidationError('items を指定してください');
  if (typeof input.expectedUpdatedAt !== 'string' || !input.expectedUpdatedAt) {
    throw new ValidationError('expected_updated_at を指定してください');
  }
  const serialized = JSON.stringify(input.items);
  if (serialized.length > MAX_ITEMS_JSON_LENGTH) {
    throw new ValidationError('図面の中身が大きすぎます');
  }

  const existing = await getVenueLayoutLockRow(id);
  if (!existing) throw new NotFoundError('図面が見つかりません');
  assertHoldsVenueLayoutLock(existing, userId); // 速い失敗

  const meta = await queryOne(
    `SELECT v.updated_at, v.updated_by, u.name AS updater_name
     FROM qsheet_venue_layouts v LEFT JOIN users u ON v.updated_by = u.id
     WHERE v.id = $1 AND v.deleted_at IS NULL`,
    [id],
  );
  if (!meta) throw new NotFoundError('図面が見つかりません');
  checkOptimisticLock(
    input.expectedUpdatedAt,
    { updated_at: meta.updated_at, updated_by: meta.updated_by, updater_name: meta.updater_name },
    userId,
    'この図面',
  );

  const updated = await queryOne(
    `UPDATE qsheet_venue_layouts SET items = ?, updated_by = ?, updated_at = NOW()
     WHERE id = ? AND ${HOLDS_LOCK_GUARD_SQL}
       AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ?::timestamptz)
     RETURNING id`,
    [serialized, userId, id, id, userId, input.expectedUpdatedAt],
  );
  if (!updated) {
    const freshLayout = await getVenueLayoutLockRow(id);
    if (!freshLayout) throw new NotFoundError('図面が見つかりません');
    assertHoldsVenueLayoutLock(freshLayout, userId);
    const fresh = await queryOne(
      `SELECT v.updated_at, v.updated_by, u.name AS updater_name
       FROM qsheet_venue_layouts v LEFT JOIN users u ON v.updated_by = u.id
       WHERE v.id = $1 AND v.deleted_at IS NULL`,
      [id],
    );
    if (!fresh) throw new NotFoundError('図面が見つかりません');
    checkOptimisticLock(
      input.expectedUpdatedAt,
      { updated_at: fresh.updated_at, updated_by: fresh.updated_by, updater_name: fresh.updater_name },
      userId,
      'この図面',
    );
    throw new ConflictError('この図面はほかの人が先に更新しました。', fresh.updated_at as string, (fresh.updater_name as string) ?? null);
  }
  const row = await getVenueLayoutDetail(id);
  if (!row) throw new Error('updateVenueItems: UPDATE 直後の SELECT が空でした');
  return row;
}

/** 図面まるごとの削除（論理削除）。`manual.service.ts` の `deleteManual` と同じ形——
 *  事前チェック（速い失敗）に加え、UPDATE 自身の WHERE 句にも editable の条件を畳み込む。 */
export async function deleteVenueLayout(id: string, userId: string): Promise<void> {
  const existing = await getVenueLayoutLockRow(id);
  if (!existing) throw new NotFoundError('図面が見つかりません');
  assertVenueLayoutEditable(existing, userId);
  const deleted = await queryOne(
    `UPDATE qsheet_venue_layouts
     SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL AND status != 'fixed'
       AND (locked_by IS NULL OR locked_by = $2 OR locked_at < NOW() - INTERVAL '10 minutes')
     RETURNING id`,
    [id, userId],
  );
  if (!deleted) {
    const fresh = await getVenueLayoutLockRow(id);
    if (!fresh) throw new NotFoundError('図面が見つかりません');
    assertVenueLayoutEditable(fresh, userId);
    throw new Error('deleteVenueLayout: assertVenueLayoutEditable を通ったのに UPDATE が0件でした（想定外）');
  }
}

// ============================================================
// 確定・版（§5-6・§14 #8「図面にも確定と版を持たせる」）
// ============================================================

/**
 * 確定する（manager・status==='draft' のときだけ）。運営マニュアルと違い、図面は他の資料を
 * 差し込む側ではない（`resolveLinkedBlock` を経由する中身が無い）ため、確定処理は
 * `status='fixed'`・`rev=rev+1`・`fixed_at`・`fixed_by` を書くだけでよい——冊子側の
 * `fixManual` にある「全ページの linked ブロックを解決して凍らせる」手順は不要。
 */
export async function fixVenueLayout(id: string, userId: string): Promise<Row> {
  const layout = await queryOne(
    'SELECT id, status, updated_at FROM qsheet_venue_layouts WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!layout) throw new NotFoundError('図面が見つかりません');
  if (layout.status !== 'draft') {
    throw new ValidationError('先に確定を解いてください');
  }

  const fixedAtIso = new Date().toISOString();
  const updated = await queryOne(
    `UPDATE qsheet_venue_layouts
     SET status = 'fixed', rev = rev + 1, fixed_at = ?, fixed_by = ?, updated_by = ?, updated_at = NOW()
     WHERE id = ? AND status = 'draft'
       AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ?::timestamptz)
     RETURNING id`,
    [fixedAtIso, userId, userId, id, layout.updated_at],
  );
  if (!updated) {
    const fresh = await queryOne('SELECT status, updated_at FROM qsheet_venue_layouts WHERE id = $1', [id]);
    if (!fresh) throw new NotFoundError('図面が見つかりません');
    if (fresh.status !== 'draft') throw new ValidationError('先に確定を解いてください');
    throw new ConflictError(
      'この図面は確定の処理中に更新されました。もう一度確定をやり直してください。',
      fresh.updated_at as string,
      null,
    );
  }
  const row = await getVenueLayoutWithMeta(id);
  if (!row) throw new Error('fixVenueLayout: UPDATE 直後の SELECT が空でした');
  return row;
}

/** 確定を解く（manager・status==='fixed' のときだけ）。`rev`・`fixed_at`・`fixed_by` は変えない。 */
export async function unfixVenueLayout(id: string, userId: string): Promise<Row> {
  const layout = await queryOne('SELECT id, status FROM qsheet_venue_layouts WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!layout) throw new NotFoundError('図面が見つかりません');
  if (layout.status !== 'fixed') {
    throw new ValidationError('まだ確定していません');
  }
  await execute(
    `UPDATE qsheet_venue_layouts SET status = 'draft', updated_by = ?, updated_at = NOW() WHERE id = ?`,
    [userId, id],
  );
  const row = await getVenueLayoutWithMeta(id);
  if (!row) throw new Error('unfixVenueLayout: UPDATE 直後の SELECT が空でした');
  return row;
}

// ============================================================
// 編集ロック（図面まるごと・§5-6）。manual.service.ts の同名の関数群と同じ形
// ============================================================

export interface LockAcquireResult {
  /** 取れた（＝これで自分が保持者になった）か。取れなくても例外にはしない —
   *  呼び出し元（クライアント）がこれを見て読み取り専用に切り替える */
  acquired: boolean;
  layout: Row;
}

/**
 * ロックを取る。取れる条件は「未取得」「自分がすでに持っている」「10分より古い（stale）」の
 * いずれか。**このエンドポイントは60秒ごとのハートビートも兼ねる**——保持者本人が呼べば
 * `locked_at` を今に更新するだけになる。条件を1文の UPDATE の WHERE 句に畳み込み、行ロック
 * そのものに排他を保証させる（read→判定→write の2段だと並行呼び出しで両方 acquired:true を
 * 返してしまう）。
 */
export async function acquireVenueLayoutLock(id: string, userId: string): Promise<LockAcquireResult> {
  const acquired = await queryOne(
    `UPDATE qsheet_venue_layouts
     SET locked_by = ?, locked_at = NOW(), lock_requested_by = NULL, lock_requested_at = NULL
     WHERE id = ? AND deleted_at IS NULL AND status != 'fixed'
       AND (locked_by IS NULL OR locked_by = ? OR locked_at < NOW() - INTERVAL '10 minutes')
     RETURNING id`,
    [userId, id, userId],
  );

  if (acquired) {
    const layout = await getVenueLayoutLockRow(id);
    if (!layout) throw new Error('acquireVenueLayoutLock: UPDATE 直後の SELECT が空でした');
    return { acquired: true, layout };
  }

  const existing = await getVenueLayoutLockRow(id);
  if (!existing) throw new NotFoundError('図面が見つかりません');
  return { acquired: false, layout: existing };
}

/** ロックを放す。**自分が保持者のときだけ**——他人の呼び出しは何もしない */
export async function releaseVenueLayoutLock(id: string, userId: string): Promise<Row> {
  const existing = await getVenueLayoutLockRow(id);
  if (!existing) throw new NotFoundError('図面が見つかりません');
  await execute('UPDATE qsheet_venue_layouts SET locked_by = NULL, locked_at = NULL WHERE id = ? AND locked_by = ?', [id, userId]);
  const layout = await getVenueLayoutLockRow(id);
  if (!layout) throw new Error('releaseVenueLayoutLock: UPDATE 直後の SELECT が空でした');
  return layout;
}

/** 強制的に引き継ぐ。**呼び出し元で manager 権限を確認済みという前提**——ここでは検査しない。
 *  元の保持者は次の 60 秒ハートビート（`acquireVenueLayoutLock` の応答）で気づく。 */
export async function takeoverVenueLayoutLock(id: string, userId: string): Promise<Row> {
  const existing = await getVenueLayoutLockRow(id);
  if (!existing) throw new NotFoundError('図面が見つかりません');
  await execute(
    `UPDATE qsheet_venue_layouts
     SET locked_by = ?, locked_at = NOW(), lock_requested_by = NULL, lock_requested_at = NULL
     WHERE id = ?`,
    [userId, id],
  );
  const layout = await getVenueLayoutLockRow(id);
  if (!layout) throw new Error('takeoverVenueLayoutLock: UPDATE 直後の SELECT が空でした');
  return layout;
}

/** 交代を申し出る。**自分が保持者でないときだけ**書き込む */
export async function requestVenueLayoutLockHandoff(id: string, userId: string): Promise<Row> {
  const existing = await getVenueLayoutLockRow(id);
  if (!existing) throw new NotFoundError('図面が見つかりません');
  if (existing.locked_by !== userId) {
    await execute('UPDATE qsheet_venue_layouts SET lock_requested_by = ?, lock_requested_at = NOW() WHERE id = ?', [userId, id]);
  }
  const layout = await getVenueLayoutLockRow(id);
  if (!layout) throw new Error('requestVenueLayoutLockHandoff: UPDATE 直後の SELECT が空でした');
  return layout;
}
