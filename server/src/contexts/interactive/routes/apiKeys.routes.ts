/**
 * interactive/routes/apiKeys.routes.ts
 * 管理者専用: 外部 API キーの発行/一覧/取消。
 * 発行直後のレスポンスにのみ平文キーが含まれる。それ以降は prefix のみ。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { apiKeyService } from '../services/apiKey.service';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('interactive', 'manager'));

router.get(
  '/',
  wrap(async (_req, res) => {
    const keys = await apiKeyService.list();
    res.json({ data: keys });
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const { name, scope } = req.body as { name?: string; scope?: string[] };
    const userId = (req as unknown as { user?: { id?: string } }).user?.id ?? null;
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');
    const created = await apiKeyService.create(
      name,
      userId,
      Array.isArray(scope) && scope.length ? scope : ['read'],
    );
    // secret は発行時の 1 回限り
    res.json({ data: created });
  }),
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    await apiKeyService.revoke(req.params.id as string);
    res.json({ ok: true });
  }),
);

export default router;
