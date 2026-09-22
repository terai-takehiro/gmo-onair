/**
 * Wiki — ホーム（`/wiki`）の API（段A）。設計: `docs/design/v4/wiki.md` §6-①。
 *
 * - `GET /wiki/home` スペースの一覧 ＋ 最近更新10件 ＋ お気に入り ＋ 自分の要見直し
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { getHome } from '../services/wiki-home.service';
import { wrap } from './wrap';

const router = Router();

router.get('/home', requireAuth, requirePermission('wiki', 'reader'), wrap(async (req, res) => {
  const data = await getHome(req.user!);
  res.json({ success: true, data });
}));

export default router;
