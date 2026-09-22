/**
 * Wiki — 検索とお気に入りの API（段D）。
 * 設計: `docs/design/v4/wiki.md` §5-4・§6-④・§10 の判断6。
 *
 * - `GET    /wiki/search`                 検索（語・スペース・タグ・担当・更新日で絞る）
 * - `POST   /wiki/pages/:id/favorite`     お気に入りに入れる
 * - `DELETE /wiki/pages/:id/favorite`     お気に入りから外す
 *
 * どれも reader（区画 `wiki` は閲覧が全員の既定）。**読めないページは 403 ではなく 404**
 * （存在ごと隠す・§8）。検索は**読めるスペースの公開ページだけ**を返します。
 *
 * ⚠️ **「この質問を AI に聞く」の入口はここには作りません。** AI の画面は段E なので、
 * いま入口を出すと**押せるのに何も出ないボタン**になります（§9）。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { searchPages } from '../services/wiki-search.service';
import { addFavorite, removeFavorite } from '../services/wiki-favorite.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;

/**
 * `?x=1&x=2` を配列にする。
 *
 * ⚠️ **コンマでは切りません。** タグは `p.tags @>` の完全一致で当てるので、
 * `R&D, Japan` のような**コンマを含むタグ**を切ってしまうと、そのタグを持つ
 * ページが1件も当たらなくなります（Codex の指摘・P2）。画面は同じ名前の
 * 引数を並べて送ります（`?tags=a&tags=b`）。
 */
function listParam(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : [raw];
  return parts
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function numParam(raw: unknown): number | undefined {
  const v = Number(p1(raw as string | string[] | undefined));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

router.get('/search', ...canRead, wrap(async (req, res) => {
  const result = await searchPages(req.user!, {
    q: p1(req.query.q as string | string[] | undefined),
    spaceId: p1(req.query.spaceId as string | string[] | undefined) || undefined,
    tags: listParam(req.query.tags),
    ownerId: p1(req.query.ownerId as string | string[] | undefined) || undefined,
    updatedWithinDays: numParam(req.query.updatedWithinDays),
    limit: numParam(req.query.limit),
  });
  // `{ hits, counts }` で返します（件数は上限で切る前の数・`wiki-search.service.ts`）
  res.json({ success: true, data: result });
}));

router.post('/pages/:id/favorite', ...canRead, wrap(async (req, res) => {
  const row = await addFavorite(req.user!, p1(req.params.id));
  res.json({ success: true, data: row });
}));

router.delete('/pages/:id/favorite', ...canRead, wrap(async (req, res) => {
  const row = await removeFavorite(req.user!, p1(req.params.id));
  res.json({ success: true, data: row });
}));

export default router;
