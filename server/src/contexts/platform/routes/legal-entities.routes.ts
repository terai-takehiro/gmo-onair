/**
 * 計上会社マスターの API — 2026年10月の事業再編（社名変更・計上会社の2社化）
 *
 * 読むのは `sales` の reader があれば通す（案件管理を見られる人は取引先・
 * 発行者の情報を知る必要がある — `money-rules.routes.ts` と同じ考え方）。
 * 発行者情報（住所・登録番号・振込先・ロゴ）の変更は `system_admin` だけ
 * （振込先などの機微情報のため）。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission, requireRole } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { listLegalEntities, getLegalEntity, updateLegalEntityIssuer } from '../services/legal-entity.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('sales', 'reader'), wrap(async (_req, res) => {
  res.json({ success: true, data: await listLegalEntities() });
}));

router.get('/:code', requirePermission('sales', 'reader'), wrap(async (req, res) => {
  const code = req.params.code as string;
  const entity = await getLegalEntity(code);
  if (!entity) throw new AppError(404, 'NOT_FOUND', '計上会社が見つかりません');
  res.json({ success: true, data: entity });
}));

router.put('/:code', requireRole('system_admin'), wrap(async (req, res) => {
  const code = req.params.code as string;
  const updated = await updateLegalEntityIssuer(code, req.body ?? {}, req.user!.id);
  res.json({ success: true, data: updated });
}));

export default router;
