import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// Output page can read without auth (browser source)
router.get('/events/:eventId/cue', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const state = await queryOne(
    `SELECT step, category_id, oneshot_style, updated_at FROM awards_cue_state WHERE event_id=?`,
    [eventId]
  );
  res.json({
    success: true,
    data: state ?? { step: 'idle', category_id: null, oneshot_style: 'classic' },
  });
}));

router.post('/events/:eventId/cue', requireAuth, requirePermission('awards'), wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id=?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const { step, categoryId, oneshotStyle } = req.body;
  await execute(
    `INSERT INTO awards_cue_state (event_id, step, category_id, oneshot_style, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON CONFLICT (event_id) DO UPDATE
       SET step=EXCLUDED.step, category_id=EXCLUDED.category_id,
           oneshot_style=EXCLUDED.oneshot_style, updated_at=NOW()`,
    [eventId, step ?? 'idle', categoryId ?? null, oneshotStyle ?? 'classic']
  );

  // Also broadcast via Socket.IO if available
  const io = req.app.get('io');
  if (io) {
    io.of('/awards').to(`event:${eventId}`).emit('cue:sync', {
      step: step ?? 'idle',
      categoryId: categoryId ?? null,
      oneshotStyle: oneshotStyle ?? 'classic',
      timestamp: Date.now(),
    });
  }

  res.json({ success: true });
}));

export default router;
