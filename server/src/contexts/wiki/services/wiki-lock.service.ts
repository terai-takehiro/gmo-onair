/**
 * Wiki — 編集ロック（`docs/design/v4/wiki.md` §6-③・§10-4）。
 *
 * 規則は運営マニュアル（§6-2-1・`contexts/qsheet/services/manual.service.ts`）と**同じ**です:
 * ページ単位／開いた人が取る／10分手が止まると解ける／manager は引き継げる／
 * 読むだけの人は「編集を代わってほしい」と申し出られる。
 *
 * ⚠️ **ロックがあっても `updated_at` の突き合わせは外しません**（設計 §6-③）。
 * ロックは「同時に書き始めない」ための案内で、保存の最後の砦は
 * `checkOptimisticLock`（`wiki-page.service.ts`）です。片方だけにすると、
 * 10分の自動解除をまたいだ2人の保存が黙って上書きし合います。
 *
 * ⚠️ **「取る」は60秒ごとのハートビートを兼ねます。** 保持者本人が呼ぶと
 * `locked_at` を今にするだけになり、手が止まれば10分で他の人が取れます。
 * 引き継ぎ・申し出の通知は作りません（運営マニュアルと同じ判断）——
 * 保持者は次のハートビートの応答で気づきます。
 */
import { queryOne, type Row } from '../../../shared/db/connection';
import { NotFoundError, LockError } from '../../qsheet/services/httpErrors';

/**
 * ロックの自動解除の目安（10分）。
 *
 * ⚠️ **下の `STALE_INTERVAL` と必ず同じ長さにしてください。** JS 側（画面に出す
 * 「編集中」の判定）と SQL 側（取れるかどうかの判定）がずれると、画面は
 * 「空いている」と出るのに取れない（またはその逆）が起きます。
 */
export const WIKI_LOCK_STALE_MS = 10 * 60 * 1000;
const STALE_INTERVAL = "INTERVAL '10 minutes'";

/** 4本の口が返す形。画面はこれだけを見てヘッダーの表示を決める */
export interface WikiLockState {
  page_id: string;
  locked_by: string | null;
  locked_by_name: string | null;
  locked_at: string | null;
  lock_requested_by: string | null;
  lock_requested_by_name: string | null;
  lock_requested_at: string | null;
}

const LOCK_SELECT = `
  SELECT p.id, p.locked_by, lu.name AS locked_by_name, p.locked_at,
         p.lock_requested_by, ru.name AS lock_requested_by_name, p.lock_requested_at
    FROM wiki_pages p
    LEFT JOIN users lu ON lu.id = p.locked_by
    LEFT JOIN users ru ON ru.id = p.lock_requested_by
   WHERE p.id = ? AND p.deleted_at IS NULL
`;

function toState(row: Row): WikiLockState {
  return {
    page_id: String(row.id),
    locked_by: (row.locked_by as string | null) ?? null,
    locked_by_name: (row.locked_by_name as string | null) ?? null,
    locked_at: (row.locked_at as string | null) ?? null,
    lock_requested_by: (row.lock_requested_by as string | null) ?? null,
    lock_requested_by_name: (row.lock_requested_by_name as string | null) ?? null,
    lock_requested_at: (row.lock_requested_at as string | null) ?? null,
  };
}

/** いまのロックの状態。削除済み・存在しないページは「無い」 */
export async function lockStateOf(pageId: string): Promise<WikiLockState> {
  const row = await queryOne(LOCK_SELECT, [pageId]);
  if (!row) throw new NotFoundError('ページが見つかりません');
  return toState(row);
}

/** 10分より古いロックは空きとみなす（`WIKI_LOCK_STALE_MS`） */
export function isWikiLockStale(lockedAt: unknown): boolean {
  if (!lockedAt) return true;
  const ms = new Date(lockedAt as string).getTime();
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms > WIKI_LOCK_STALE_MS;
}

/** 判定に要る列だけ（`wiki_pages` の行でも `WikiLockState` でも渡せる形） */
export interface WikiLockFields {
  locked_by?: unknown;
  locked_at?: unknown;
  locked_by_name?: unknown;
}

/**
 * 本文を書き換えてよいか。他人が新しく（10分以内に）持っていれば `LockError`（409）。
 *
 * ⚠️ **呼ぶ側は、判定に使う行を同じトランザクションの `FOR UPDATE` で読むこと。**
 * ロックを取る・引き継ぐ側も同じ行の行ロックを取るので、両者が直列になり
 * 「引き継いだ直後に前の保持者の保存が通る」を塞げます
 * （`manual.service.ts` の `EDITABLE_GUARD_SQL` と同じ目的を、Wiki は
 * 保存そのものが `FOR UPDATE` を取っているので行ロックだけで満たします）。
 */
export function assertPageEditable(page: WikiLockFields, userId: string): void {
  const lockedBy = (page.locked_by as string | null) ?? null;
  if (!lockedBy || lockedBy === userId) return;
  if (isWikiLockStale(page.locked_at)) return;
  const name = (page.locked_by_name as string | null) ?? null;
  throw new LockError(`${name || '他のユーザー'} さんが編集中です`, lockedBy, name);
}

export interface WikiLockAcquireResult {
  /** 取れた（＝これで自分が保持者になった）か。取れなくても例外にはしない —
   *  画面はこれを見て読み取り専用に切り替える */
  acquired: boolean;
  lock: WikiLockState;
}

/**
 * 取る（**60秒ごとのハートビート兼用**）。取れる条件は「誰も持っていない」
 * 「自分がすでに持っている」「10分より古い」のいずれか。
 *
 * ⚠️ 「読む→JS で判定→書く」の2段にしないこと。空いた瞬間に2人が呼ぶと
 * 両方が「取れる」と判定して両方に `acquired: true` を返します。条件を
 * UPDATE の WHERE 句に畳み込み、行ロックそのものに排他させます。
 */
export async function acquireWikiLock(pageId: string, userId: string): Promise<WikiLockAcquireResult> {
  const won = await queryOne(
    `UPDATE wiki_pages
        SET locked_by = ?, locked_at = NOW(), lock_requested_by = NULL, lock_requested_at = NULL
      WHERE id = ? AND deleted_at IS NULL
        AND (locked_by IS NULL OR locked_by = ? OR locked_at < NOW() - ${STALE_INTERVAL})
      RETURNING id`,
    [userId, pageId, userId],
  );
  // 取れても取れなくても、いまの状態（誰が持っているか・申し出があるか）を返す
  const lock = await lockStateOf(pageId);
  return { acquired: !!won, lock };
}

/**
 * 放す。**自分が保持者のときだけ**書き換えます — 条件を WHERE 句に入れないと、
 * 直前に manager が引き継いだロックまで消してしまいます。
 */
export async function releaseWikiLock(pageId: string, userId: string): Promise<WikiLockState> {
  await queryOne(
    `UPDATE wiki_pages SET locked_by = NULL, locked_at = NULL
      WHERE id = ? AND deleted_at IS NULL AND locked_by = ?
      RETURNING id`,
    [pageId, userId],
  );
  return lockStateOf(pageId);
}

/**
 * 強制的に引き継ぐ（**manager。権限は route で確かめ済みという前提**）。
 * 前の保持者は次のハートビートの応答（`acquired: false`）で気づきます。
 */
export async function takeoverWikiLock(pageId: string, userId: string): Promise<WikiLockState> {
  await queryOne(
    `UPDATE wiki_pages
        SET locked_by = ?, locked_at = NOW(), lock_requested_by = NULL, lock_requested_at = NULL
      WHERE id = ? AND deleted_at IS NULL
      RETURNING id`,
    [userId, pageId],
  );
  return lockStateOf(pageId);
}

/** 交代を申し出る。**自分が保持者でないときだけ**書きます */
export async function requestWikiLockHandoff(pageId: string, userId: string): Promise<WikiLockState> {
  await queryOne(
    `UPDATE wiki_pages
        SET lock_requested_by = ?, lock_requested_at = NOW()
      WHERE id = ? AND deleted_at IS NULL AND locked_by IS DISTINCT FROM ?
      RETURNING id`,
    [userId, pageId, userId],
  );
  return lockStateOf(pageId);
}
