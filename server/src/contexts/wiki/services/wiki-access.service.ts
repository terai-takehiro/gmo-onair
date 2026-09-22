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
