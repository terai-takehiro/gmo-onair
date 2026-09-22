/**
 * Wiki — お気に入り（`docs/design/v4/wiki.md` §6-①②・段D）。
 *
 * 人ごとの印です（`wiki_favorites` の主キーは `user_id + page_id`）。
 * ホームの「お気に入り」（`wiki-home.service.ts`）とページ詳細の `favorited` が読みます。
 *
 * ⚠️ **読めないページには印を付けられません**（`assertReadablePage` が 404 を投げます）。
 * 付けられてしまうと、ホームの一覧に**読めないはずのページの題**が出ます（§8）。
 *
 * ⚠️ **同じ操作を2回受けても同じ結果になります**（付ける＝`ON CONFLICT DO NOTHING`・
 * 外す＝無い行を消しても成功）。押した直後にもう一度押せてしまう画面や、
 * 電波の悪いところで送り直された要求で 409 を返さないためです。
 */
import { execute, type Row } from '../../../shared/db/connection';
import { assertReadablePage, type WikiUser } from './wiki-access.service';

export interface WikiFavoriteResult extends Row {
  page_id: string;
  favorited: boolean;
}

/** お気に入りに入れる（`POST /wiki/pages/:id/favorite`） */
export async function addFavorite(user: WikiUser, pageId: string): Promise<WikiFavoriteResult> {
  await assertReadablePage(user, pageId);
  await execute(
    `INSERT INTO wiki_favorites (user_id, page_id) VALUES (?, ?)
     ON CONFLICT (user_id, page_id) DO NOTHING`,
    [user.id, pageId],
  );
  return { page_id: pageId, favorited: true };
}

/** お気に入りから外す（`DELETE /wiki/pages/:id/favorite`） */
export async function removeFavorite(user: WikiUser, pageId: string): Promise<WikiFavoriteResult> {
  await assertReadablePage(user, pageId);
  await execute('DELETE FROM wiki_favorites WHERE user_id = ? AND page_id = ?', [user.id, pageId]);
  return { page_id: pageId, favorited: false };
}
