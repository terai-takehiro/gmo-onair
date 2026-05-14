import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { taskTemplatesService } from '../services/task-templates.service';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const templates = await taskTemplatesService.list();
  res.json({ success: true, data: templates });
});

export default router;
