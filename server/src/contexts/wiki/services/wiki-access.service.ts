/**
 * Wiki — 閲覧範囲（`docs/design/v4/wiki.md` §8）。
 *
 * ⚠️ **すべての読み取りがここを通ること。** 閲覧範囲はスペース単位で、
 * `visibility='members'` のスペースは `wiki_space_members` に居る人と
 * system_admin だけが見られます。読めないスペースのページは
 * **検索にも AI の出典にも出しません**（§8「存在ごと見えない」）。
 *
 * ⚠️ **読めないページは 403 ではなく 404 で返します。**
 * 403 だと「そこに何かがある」ことが伝わってしまい、存在を隠す約束が破れます。
 * 権限区画 `wiki` そのものを持たない人は route の `requirePermission` が 403 を返すので、
 * ここで見るのは「区画は持っているが、このスペースは見られない」場合だけです。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { meetsPermissionLevel } from '../../../shared/middleware/auth';
import { NotFoundError } from '../../qsheet/services/httpErrors';

/** 判定に要る分だけ。`req.user`（AuthUser）をそのまま渡せる形 */
export interface WikiUser {
  id: string;
  role?: string;
  permissions?: Record<string, string>;
}

/**
 * Wiki を使える在籍中の利用者だけを通す SQL の条件（`u` は users）。
 *
 * ⚠️ **区画 `wiki` の権限（reader 以上）か system_admin の人だけ**です。在籍中かだけを
 * 見ていたころは、Wiki の権限が無い人も担当・メンバーに選べてしまい、通知から
 * リンクを開くと全部 403 になっていました（#740 の Codex 指摘・P2）。
 * **担当・メンバー・人の項目で「新しく選べる人」はすべてこの条件です**（スペースの担当と
 * メンバー＝`wiki-space-admin.service.ts`、ページの担当＝`wiki-write.service.ts` の
 * `assertUserExists`、候補の一覧＝`GET /wiki/users` の `active`）。
 */
export const WIKI_ELIGIBLE = `u.deleted_at IS NULL AND u.status = 'active'
  AND (u.role = 'system_admin'
       OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = u.id AND up.module = 'wiki'))`;

/** 区画 `wiki` の manager（スペースの設定・編集の引き継ぎ。段B 以降で使う） */
export function isWikiManager(user: WikiUser): boolean {
  return meetsPermissionLevel(user.role, user.permissions?.wiki, 'manager');
}

/** 区画 `wiki` の editor（ページの作成・編集。段B 以降で使う） */
export function isWikiEditor(user: WikiUser): boolean {
  return meetsPermissionLevel(user.role, user.permissions?.wiki, 'editor');
}

/**
 * その人が読めるスペースの id。
 *
 * ページの一覧・ツリー・バックリンク・検索・AI の出典は、必ずこの配列で絞ります。
 * 空配列のときは `= ANY('{}')` が1件も返さないので、呼ぶ側で分岐しなくて済みます。
 */
export async function readableSpaceIds(user: WikiUser): Promise<string[]> {
  if (user.role === 'system_admin') {
    const rows = await queryAll('SELECT id FROM wiki_spaces WHERE deleted_at IS NULL');
    return rows.map((r) => String(r.id));
  }
  const rows = await queryAll(
    `SELECT s.id
       FROM wiki_spaces s
      WHERE s.deleted_at IS NULL
        AND (s.visibility = 'all'
             OR EXISTS (SELECT 1 FROM wiki_space_members m
                         WHERE m.space_id = s.id AND m.user_id = ?))`,
    [user.id],
  );
  return rows.map((r) => String(r.id));
}

/** 1つのスペースが読めるか（`readableSpaceIds` を1件分だけ引く形） */
export async function canReadSpace(user: WikiUser, spaceId: string): Promise<boolean> {
  if (user.role === 'system_admin') return true;
  const row = await queryOne(
    `SELECT 1 AS ok
       FROM wiki_spaces s
      WHERE s.id = ? AND s.deleted_at IS NULL
        AND (s.visibility = 'all'
             OR EXISTS (SELECT 1 FROM wiki_space_members m
                         WHERE m.space_id = s.id AND m.user_id = ?))`,
    [spaceId, user.id],
  );
  return !!row;
}

/**
 * ページ1本が読めるか。スペースの閲覧範囲に加えて**状態**も見ます:
 *
 * | 状態 | 誰が読めるか | なぜ |
 * | --- | --- | --- |
 * | `published` | スペースが読める人 | 公開しているもの |
 * | `draft` | 書いた人・担当・区画の manager | 下書きは検索にも AI の出典にも出さない（§7-5） |
 * | `archived` | スペースが読める人 | 「一覧から隠す」だけ。リンクをたどれば読める（§4-1） |
 *
 * ⚠️ ツリー（`wiki-space.service`）は同じ規則のうち「公開＋自分の下書き」だけを出します。
 * 担当・manager の下書きまでツリーに出すと、他人の書きかけが一覧に並ぶためです。
 */
export async function canReadPage(user: WikiUser, pageId: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT p.status, p.created_by, p.owner_user_id, p.space_id
       FROM wiki_pages p
      WHERE p.id = ? AND p.deleted_at IS NULL`,
    [pageId],
  );
  if (!row) return false;
  if (!(await canReadSpace(user, String(row.space_id)))) return false;
  if (row.status !== 'draft') return true;
  return (
    row.created_by === user.id ||
    row.owner_user_id === user.id ||
    isWikiManager(user)
  );
}

/** 読めないページは「無い」として止める（存在を隠す・上のコメント参照） */
export async function assertReadablePage(user: WikiUser, pageId: string): Promise<void> {
  if (!(await canReadPage(user, pageId))) {
    throw new NotFoundError('ページが見つかりません');
  }
}

/**
 * **通知を出す相手が、いまそのページを読めるか**を見るための `WikiUser` を作る
 * （Codex レビュー指摘・#735）。
 *
 * ⚠️ **知らせる先は「送る時点で読める人」だけ**です。担当やコメントを書いた人は
 * `wiki_pages` / `wiki_comments` に id が残り続けるので、**棚から外れたあと**や
 * **入っていない棚の担当に据えられた**ときに、そのまま送ると題と本文の一部が
 * 届いてしまいます（押しても 404 になるページの中身が、ベルの中だけで読める）。
 *
 * 退職・停止した人（`deleted_at` / `status`）と、**区画 `wiki` の権限が無い人**もここで落ちます
 * （権限が無いと、通知のリンクを開いても全部 403 になるため。#735 の再レビューで、
 * 全員が読めるスペースでは `canReadSpace` だけでは落ちないことが分かった）。
 * 返り値が `null` なら**送らない**でください。
 */
export async function wikiUserById(userId: string): Promise<WikiUser | null> {
  const row = await queryOne(
    "SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL AND status = 'active'",
    [userId],
  );
  if (!row) return null;
  const user: WikiUser = { id: String(row.id), role: row.role ? String(row.role) : undefined };
  if (user.role !== 'system_admin') {
    const perms = await queryAll(
      "SELECT module, access_level FROM user_permissions WHERE user_id = ? AND module = 'wiki'",
      [userId],
    );
    user.permissions = {};
    for (const p of perms) user.permissions[String(p.module)] = String(p.access_level);
    if (!meetsPermissionLevel(user.role, user.permissions.wiki, 'reader')) return null;
  }
  return user;
}
