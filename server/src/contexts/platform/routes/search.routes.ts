import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { search, searchForPalette, RESULTS_LIMIT } from '../services/search.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const actorOf = (req: Request) => ({
  role: req.user?.role,
  permissions: req.user?.permissions,
});

// ── 検索結果の画面 (36章) ────────────────────────────────
//
// `/search` より前に置く (`/search/results` が `/search` に食われないように)。
// 種類ごとの件数つきで返す。**権限が無い種類は件数にも出さない**。
router.get('/results', requireAuth, wrap(async (req, res) => {
  res.json({
    success: true,
    data: await search({
      q: typeof req.query.q === 'string' ? req.query.q : '',
      actor: actorOf(req),
      limit: RESULTS_LIMIT,
      kind: typeof req.query.kind === 'string' && req.query.kind ? req.query.kind : null,
    }),
  });
}));

// GET /search?q=keyword — ⌘K の候補
//
// v2.9.286: **権限を見るようにした**。それまではログインしているだけで
// 案件名・GLS番号・お客様の名前・仕入先の名前が誰にでも出ていた
// (開くと403で止まるが、名前はもう見えている)。
router.get('/', requireAuth, wrap(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json({ success: true, data: await searchForPalette(q, actorOf(req)) });
}));

export default router;
