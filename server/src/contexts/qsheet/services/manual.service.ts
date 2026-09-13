/**
 * 運営マニュアル（`qsheet_manuals` / `qsheet_manual_pages`）— 段A：一覧・詳細・CRUD・ページ管理
 * ＋段B：紙面（`blocks`）の保存・楽観ロック ＋ 段E：編集ロック（冊子まるごと）・確定/版。
 * 設計: docs/design/v4/production-manual.md §5〜§6（秘密の伏せ字解除・差し込み・ひな形・AI は
 * 段C・段E以降で順次実装。今回は編集ロックと確定/版のみ）。
 * 実装パターンは schedule.service.ts / schedule-column.service.ts をそのまま踏襲する。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type Row } from '../../../shared/db/connection';
import { isQsheetAdmin } from '../access';
import { issueDocNo } from './docNo.service';
import { NotFoundError, ValidationError, ConflictError, LockError, checkOptimisticLock } from './httpErrors';
import { resolveLinkedBlock } from './manual-resolve.service';
import { buildPagesForNewManual } from './manual-template.service';

interface AccessUser { id: string; role: string; permissions?: Record<string, string> }

const SELECT_BASE = `
  SELECT m.id, m.doc_no, m.title, m.project_id, m.program_id,
         to_char(m.service_date, 'YYYY-MM-DD') AS service_date,
         m.status, m.rev, m.created_by, m.updated_by, m.created_at, m.updated_at,
         u.name AS creator_name,
         p.name AS project_name, p.gls_number,
         pr.name AS program_name,
         m.locked_by, lu.name AS locked_by_name, m.locked_at,
         m.lock_requested_by, ru.name AS lock_requested_by_name, m.lock_requested_at,
         (SELECT COUNT(*)::int FROM qsheet_manual_pages mp WHERE mp.manual_id = m.id) AS page_count
  FROM qsheet_manuals m
  LEFT JOIN users u ON m.created_by = u.id
  LEFT JOIN projects p ON m.project_id = p.id
  LEFT JOIN qsheet_programs pr ON m.program_id = pr.id
  LEFT JOIN users lu ON m.locked_by = lu.id
  LEFT JOIN users ru ON m.lock_requested_by = ru.id
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

/** 編集ロック・確定状態の判定に要る列だけを持つ行（名前も一緒に引く） */
async function getManualLockRow(manualId: string): Promise<Row | undefined> {
  return queryOne(
    `SELECT m.id, m.status, m.locked_by, m.locked_at, m.lock_requested_by, m.lock_requested_at,
            lu.name AS locked_by_name, ru.name AS lock_requested_by_name
     FROM qsheet_manuals m
     LEFT JOIN users lu ON m.locked_by = lu.id
     LEFT JOIN users ru ON m.lock_requested_by = ru.id
     WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [manualId],
  );
}

/** ロックの自動解除の目安（§6-2-1）。10分操作が無ければ空きとみなす */
const LOCK_STALE_MS = 10 * 60 * 1000;

function isLockStale(lockedAt: unknown): boolean {
  if (!lockedAt) return true;
  const ms = new Date(lockedAt as string).getTime();
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms > LOCK_STALE_MS;
}

/**
 * 書き込んでよいかの検査（段E・§6-2-1）。ロック（自分が保持者 / 未取得 / stale のいずれか）と
 * 確定していないこと（status !== 'fixed'）の両方を見る純粋な検査関数。
 * `updateManual`・`addPage`・`updatePage`・`deletePage`・`reorderPages` の冒頭で呼ぶ。
 * 既存の `checkOptimisticLock`（updated_at の楽観ロック）は最後の砦として別に残す
 * （ロックがあっても外さない、と設計書に明記されている）。
 */
export function assertEditable(manual: Row, userId: string): void {
  if (manual.status === 'fixed') {
    throw new ValidationError('確定済みです。編集するには確定を解いてください');
  }
  const lockedBy = (manual.locked_by as string | null) ?? null;
  if (lockedBy && lockedBy !== userId && !isLockStale(manual.locked_at)) {
    const name = (manual.locked_by_name as string | null) ?? null;
    throw new LockError(
      `${name || '他のユーザー'} さんが編集中です`,
      lockedBy,
      name,
    );
  }
}

export interface CreateManualInput {
  title: string;
  projectId?: string | null;
  programId?: string | null;
  /** 本番/開催の予定日（YYYY-MM-DD）。省略可——未指定なら null のまま
   *  （表紙の日付表示・スケジュール表resolverの日付一致に使う。§4-3・レビュー指摘: 段Cまで
   *  設定する経路が無く常に null だった） */
  serviceDate?: string | null;
  createdBy: string;
  /** ひな形（`qsheet_manual_templates`。scope="org"）から起こす。段E */
  templateId?: string | null;
  /** 同じ案件/番組の前回の冊子から複製する。段E */
  copyFromManualId?: string | null;
}

const MAX_TITLE = 500;
const SERVICE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeServiceDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  if (!SERVICE_DATE_RE.test(value)) {
    throw new ValidationError('service_date は YYYY-MM-DD 形式で指定してください');
  }
  return value;
}

/**
 * 冊子を1件・ページ（複数もあり得る）と一緒に作る。project_id / program_id はどちらか片方だけ
 * （migration の `qsheet_manuals_owner_ck` と同じ検証をアプリ側でも行う）。
 * 冊子は**必ず**発番する（§5-1・レンタル予約と違い条件分岐なし）。
 *
 * ページの中身は `templateId`／`copyFromManualId` のどちらかがあればそこから複製し
 * （`buildPagesForNewManual`。ブロック id は発番し直し、`link.frozen`/`link.reveal` は
 * null に戻す・段E）、どちらも無ければ今までどおり空ページ1枚。
 * `buildPagesForNewManual` は発番の前に呼ぶ——無効な指定（ひな形が無い等）で
 * `issueDocNo()`（アトミックな採番。副作用あり）を無駄に消費しないため。
 */
export async function createManual(input: CreateManualInput): Promise<Row> {
  const hasProject = !!input.projectId;
  const hasProgram = !!input.programId;
  if (hasProject === hasProgram) {
    throw new ValidationError('project_id と program_id はどちらか一方だけ指定してください');
  }

  const pages = await buildPagesForNewManual({
    templateId: input.templateId ?? null,
    copyFromManualId: input.copyFromManualId ?? null,
    projectId: input.projectId ?? null,
    programId: input.programId ?? null,
  });

  const id = uuid();
  const docNo = await issueDocNo('manual');
  const title = (input.title || '').slice(0, MAX_TITLE);
  const serviceDate = sanitizeServiceDate(input.serviceDate);

  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO qsheet_manuals (id, doc_no, title, project_id, program_id, service_date, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, docNo, title, input.projectId || null, input.programId || null, serviceDate, input.createdBy, input.createdBy],
    );
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      await tx.execute(
        `INSERT INTO qsheet_manual_pages (id, manual_id, sort_order, chapter, title, blocks)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuid(), id, i, page.chapter, page.title, JSON.stringify(page.blocks)],
      );
    }
  });

  const row = await getManualWithMeta(id);
  if (!row) throw new Error('createManual: INSERT 直後の SELECT が空でした');
  return row;
}

export interface UpdateManualInput {
  title?: string;
  /** `null` で明示的にクリア。省略（undefined）なら変更しない */
  serviceDate?: string | null;
  expectedUpdatedAt?: unknown;
}

export async function updateManual(id: string, userId: string, input: UpdateManualInput): Promise<Row> {
  const existing = await queryOne(
    `SELECT m.id, m.created_by, m.updated_at, m.updated_by, m.status, m.locked_by, m.locked_at,
            u.name AS updater_name, lu.name AS locked_by_name
     FROM qsheet_manuals m
     LEFT JOIN users u ON m.updated_by = u.id
     LEFT JOIN users lu ON m.locked_by = lu.id
     WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [id],
  );
  if (!existing) throw new NotFoundError('冊子が見つかりません');
  assertEditable(existing, userId);
  checkOptimisticLock(
    input.expectedUpdatedAt,
    { updated_at: existing.updated_at, updated_by: existing.updated_by, updater_name: existing.updater_name },
    userId,
    'この冊子',
  );

  const sets: string[] = ['updated_by = ?', 'updated_at = NOW()'];
  const params: unknown[] = [userId];
  if (typeof input.title === 'string') { sets.push('title = ?'); params.push(input.title.slice(0, MAX_TITLE)); }
  if ('serviceDate' in input) { sets.push('service_date = ?'); params.push(sanitizeServiceDate(input.serviceDate)); }

  await execute(`UPDATE qsheet_manuals SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  const row = await getManualWithMeta(id);
  if (!row) throw new Error('updateManual: UPDATE 直後の SELECT が空でした');
  return row;
}

/**
 * 冊子まるごとの削除。**最も破壊的な操作**なので、他の更新系5関数と同じ
 * `assertEditable`（他人が新しく持っているロック／確定済みなら拒否）を必ず通す
 * （レビュー指摘: ここだけ検査が抜けていた）。
 */
export async function deleteManual(id: string, userId: string): Promise<void> {
  const existing = await getManualLockRow(id);
  if (!existing) throw new NotFoundError('冊子が見つかりません');
  assertEditable(existing, userId);
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

export async function addPage(manualId: string, userId: string, input: PageInput): Promise<Row> {
  const manual = await getManualLockRow(manualId);
  if (!manual) throw new NotFoundError('冊子が見つかりません');
  assertEditable(manual, userId);

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
  const manual = await getManualLockRow(manualId);
  if (!manual) throw new NotFoundError('冊子が見つかりません');
  assertEditable(manual, userId);

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
export async function deletePage(manualId: string, pageId: string, userId: string): Promise<void> {
  const manual = await getManualLockRow(manualId);
  if (!manual) throw new NotFoundError('冊子が見つかりません');
  assertEditable(manual, userId);

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
export async function reorderPages(manualId: string, userId: string, order: ReorderEntry[]): Promise<Row[]> {
  const manual = await getManualLockRow(manualId);
  if (!manual) throw new NotFoundError('冊子が見つかりません');
  assertEditable(manual, userId);

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

// ============================================================
// 段E — 編集ロック（冊子まるごと・§6-2-1）
// ============================================================

export interface LockAcquireResult {
  /** 取れた（＝これで自分が保持者になった）か。取れなくても例外にはしない —
   *  呼び出し元（クライアント）がこれを見て読み取り専用に切り替える */
  acquired: boolean;
  manual: Row;
}

/**
 * ロックを取る。取れる条件は「未取得」「自分がすでに持っている」「10分より古い（stale）」の
 * いずれか。取れたら保持者を自分にし、交代の申し出（`lock_requested_*`）もクリアする。
 * **このエンドポイントは60秒ごとのハートビートも兼ねる**——保持者本人が呼べば `locked_at` を
 * 今に更新するだけになる。
 */
export async function acquireManualLock(manualId: string, userId: string): Promise<LockAcquireResult> {
  // ⚠️ 「SELECT で読む→JSで判定→UPDATE」の2段構えだと、ロックが未取得/stale の
  // タイミングで2人がほぼ同時に呼んだとき、両方の SELECT が「取れる」と判定し
  // 両方が UPDATE してしまう（後勝ちの1人だけが残るのに両方へ acquired:true を
  // 返す事故になる・レビュー指摘）。条件を WHERE 句に入れた1文の UPDATE にし、
  // 行ロックそのものに排他を保証させる（`security-card.service.ts` の
  // `returnCard()` と同じ形）。'10 minutes' は `LOCK_STALE_MS` と必ず一致させる。
  const acquired = await queryOne(
    `UPDATE qsheet_manuals
     SET locked_by = ?, locked_at = NOW(), lock_requested_by = NULL, lock_requested_at = NULL
     WHERE id = ? AND deleted_at IS NULL
       AND (locked_by IS NULL OR locked_by = ? OR locked_at < NOW() - INTERVAL '10 minutes')
     RETURNING id`,
    [userId, manualId, userId],
  );

  if (acquired) {
    const manual = await getManualLockRow(manualId);
    if (!manual) throw new Error('acquireManualLock: UPDATE 直後の SELECT が空でした');
    return { acquired: true, manual };
  }

  // 取れなかった: 冊子が無い（削除済み含む）か、他人が新しく（stale でなく）持っている
  const existing = await getManualLockRow(manualId);
  if (!existing) throw new NotFoundError('冊子が見つかりません');
  return { acquired: false, manual: existing };
}

/** ロックを放す。**自分が保持者のときだけ**——他人の呼び出しは何もしない */
export async function releaseManualLock(manualId: string, userId: string): Promise<Row> {
  const existing = await getManualLockRow(manualId);
  if (!existing) throw new NotFoundError('冊子が見つかりません');

  if (existing.locked_by === userId) {
    await execute('UPDATE qsheet_manuals SET locked_by = NULL, locked_at = NULL WHERE id = ?', [manualId]);
  }
  const manual = await getManualLockRow(manualId);
  if (!manual) throw new Error('releaseManualLock: UPDATE 直後の SELECT が空でした');
  return manual;
}

/**
 * 強制的に引き継ぐ。**呼び出し元で manager 権限を確認済みという前提**——ここでは検査しない。
 * 元の保持者は次の 60 秒ハートビート（`acquireManualLock` の応答）で気づく。
 */
export async function takeoverManualLock(manualId: string, userId: string): Promise<Row> {
  const existing = await getManualLockRow(manualId);
  if (!existing) throw new NotFoundError('冊子が見つかりません');

  await execute(
    `UPDATE qsheet_manuals
     SET locked_by = ?, locked_at = NOW(), lock_requested_by = NULL, lock_requested_at = NULL
     WHERE id = ?`,
    [userId, manualId],
  );
  const manual = await getManualLockRow(manualId);
  if (!manual) throw new Error('takeoverManualLock: UPDATE 直後の SELECT が空でした');
  return manual;
}

/** 交代を申し出る。**自分が保持者でないときだけ**書き込む */
export async function requestManualLockHandoff(manualId: string, userId: string): Promise<Row> {
  const existing = await getManualLockRow(manualId);
  if (!existing) throw new NotFoundError('冊子が見つかりません');

  if (existing.locked_by !== userId) {
    await execute(
      'UPDATE qsheet_manuals SET lock_requested_by = ?, lock_requested_at = NOW() WHERE id = ?',
      [userId, manualId],
    );
  }
  const manual = await getManualLockRow(manualId);
  if (!manual) throw new Error('requestManualLockHandoff: UPDATE 直後の SELECT が空でした');
  return manual;
}

// ============================================================
// 段E — 確定・版（§6⑤・§10-3）
// ============================================================

/** ページの `blocks`（JSONB。中身は untyped）から kind:'linked' のブロックだけを緩く読む形。
 *  `manual-resolve.routes.ts` の `LinkedBlockLike` と同じ形（§5-4 の resolve と同じ入り口を使う） */
interface LinkedBlockLike {
  kind?: unknown;
  link?: {
    block?: unknown;
    sourceId?: unknown;
    reveal?: { fields?: unknown };
  };
}

/**
 * 確定する（manager・status==='draft' のときだけ）。冊子の全ページの全 kind:'linked' ブロックを
 * `resolveLinkedBlock` でいま解決し、その結果を `link.frozen = { at, data }` として書き込む
 * （`free`・`options`・`reveal` など他の項目は変えない）。全ページ保存後、
 * `status='fixed'`・`rev=rev+1`・`fixed_at`・`fixed_by` を1トランザクションで書く。
 */
export async function fixManual(manualId: string, userId: string): Promise<Row> {
  const manual = await queryOne(
    'SELECT id, status, project_id, program_id, service_date FROM qsheet_manuals WHERE id = $1 AND deleted_at IS NULL',
    [manualId],
  );
  if (!manual) throw new NotFoundError('冊子が見つかりません');
  if (manual.status !== 'draft') {
    throw new ValidationError('先に確定を解いてください');
  }

  const projectId = (manual.project_id as string | null) ?? null;
  const programId = (manual.program_id as string | null) ?? null;
  const manualServiceDate = (manual.service_date as string | null) ?? null;
  const fixedAtIso = new Date().toISOString();

  const pages = await getManualPages(manualId);
  const frozenBlocksByPage = new Map<string, unknown[]>();

  for (const page of pages) {
    const blocks = Array.isArray(page.blocks) ? (page.blocks as Record<string, unknown>[]) : [];
    const newBlocks = await Promise.all(blocks.map(async (block) => {
      const b = block as LinkedBlockLike & Record<string, unknown>;
      if (b.kind !== 'linked' || !b.link || typeof b.link !== 'object' || typeof b.link.block !== 'string') {
        return block; // free ブロック・壊れた linked ブロックはそのまま
      }
      const link = b.link as Record<string, unknown>;
      const revealFields = Array.isArray((link.reveal as Record<string, unknown> | undefined)?.fields)
        ? ((link.reveal as { fields: unknown[] }).fields).filter((f): f is string => typeof f === 'string')
        : [];

      let result;
      try {
        result = await resolveLinkedBlock(link.block as string, {
          projectId,
          programId,
          sourceId: typeof link.sourceId === 'string' ? link.sourceId : null,
          revealFields,
          manualServiceDate,
        });
      } catch {
        // 個々の差し込みの解決失敗で確定全体を止めない（resolve API と同じ割り切り・§5-4）
        result = { data: null, updatedAt: null, error: 'resolve_failed' };
      }
      return { ...b, link: { ...link, frozen: { at: fixedAtIso, data: result.data } } };
    }));
    frozenBlocksByPage.set(page.id as string, newBlocks);
  }

  // ⚠️ 手順①（上の for ループ）は resolveLinkedBlock() を await しながらページ数・
  // 差し込み数ぶん DB へ何度も問い合わせるため、数百ms〜数秒かかりうる。その間に
  // ロック保持者の editor が普通に autosave（updatePage）を成功させることがある
  // （確定は manager 権限だけでよく、ロック保持者である必要は無い設計のため）。
  // ここで「①で読んだ古い blocks をそのまま書き戻す」と、その保存を無音で消してしまう
  // （レビュー指摘）。
  //
  // ⚠️⚠️ 外部レビュー再指摘: 最初の修正は「SELECT で読む→JSで比較→UPDATE」の2段構えで、
  // 同じトランザクション内でも SELECT は行ロックを取らない（READ COMMITTED）ため、
  // その2文の間に autosave が割り込んでも検出できない——`acquireManualLock` で直した
  // のと同じ形の TOCTOU が残っていた。比較を UPDATE 自身の WHERE 句に畳み込み、
  // 1文の条件付き UPDATE にする（`acquireManualLock` と同じ考え方）。
  // ⚠️ SQL 側の等号比較は `date_trunc('milliseconds', ...)` を両辺に掛ける —— `pg` は
  // ミリ秒未満を切り捨てて JS の `Date` にするため、素の等号だと往復させた値が DB の
  // 実値（マイクロ秒）と一致せず、何も競合していなくても常に不一致＝常に確定失敗、
  // という壊れ方をしうる（ミリ秒に丸めてから比べれば両辺が揃う）。
  // 0 行（RETURNING が空）なら競合とみなし ConflictError でトランザクション全体を
  // ロールバックする（`withTransaction` は throw で ROLLBACK する）。呼び出し元
  // （manager）は「もう一度確定をやり直してください」を見てやり直すだけでよい。
  await withTransaction(async (tx) => {
    for (const page of pages) {
      const blocks = frozenBlocksByPage.get(page.id as string);
      if (!blocks) continue; // 起こり得ないが念のため
      const updated = await tx.queryOne(
        `UPDATE qsheet_manual_pages
         SET blocks = ?, updated_at = NOW()
         WHERE id = ?
           AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ?::timestamptz)
         RETURNING id`,
        [JSON.stringify(blocks), page.id, page.updated_at],
      );
      if (!updated) {
        const fresh = await tx.queryOne('SELECT updated_at FROM qsheet_manual_pages WHERE id = ?', [page.id]);
        throw new ConflictError(
          'このページは確定の処理中に更新されました。もう一度確定をやり直してください。',
          (fresh?.updated_at as string) ?? fixedAtIso,
          null,
        );
      }
    }
    await tx.execute(
      `UPDATE qsheet_manuals
       SET status = 'fixed', rev = rev + 1, fixed_at = ?, fixed_by = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [fixedAtIso, userId, userId, manualId],
    );
  });

  const row = await getManualWithMeta(manualId);
  if (!row) throw new Error('fixManual: UPDATE 直後の SELECT が空でした');
  return row;
}

/**
 * 確定を解く（manager・status==='fixed' のときだけ）。`status='draft'` に戻すだけ——
 * `rev`・`fixed_at`・`fixed_by`・各ブロックの `frozen` は変えない（「最後に確定した時点の記録」
 * として次の `fixManual` で上書きされるまで保持する）。
 */
export async function unfixManual(manualId: string, userId: string): Promise<Row> {
  const manual = await queryOne('SELECT id, status FROM qsheet_manuals WHERE id = $1 AND deleted_at IS NULL', [manualId]);
  if (!manual) throw new NotFoundError('冊子が見つかりません');
  if (manual.status !== 'fixed') {
    throw new ValidationError('まだ確定していません');
  }

  await execute(
    `UPDATE qsheet_manuals SET status = 'draft', updated_by = ?, updated_at = NOW() WHERE id = ?`,
    [userId, manualId],
  );
  const row = await getManualWithMeta(manualId);
  if (!row) throw new Error('unfixManual: UPDATE 直後の SELECT が空でした');
  return row;
}
