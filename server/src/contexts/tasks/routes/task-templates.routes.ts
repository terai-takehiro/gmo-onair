import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { taskTemplatesService } from '../services/task-templates.service';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth);

router.get('/', wrap(async (_req, res) => {
  const templates = await taskTemplatesService.list();
  res.json({ success: true, data: templates });
}));

export default router;
