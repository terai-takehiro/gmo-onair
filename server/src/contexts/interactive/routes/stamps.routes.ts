import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

router.use(requireAuth, requirePermission('interactive'));

// スタンプ作成
router.post('/', wrap(async (req, res) => {
  const { event_id, label, emoji, color, animation, sort_order, image_url } = req.body;
  if (!event_id || !label) throw new AppError(400, 'VALIDATION_ERROR', 'event_idとlabelは必須です');

  const count = (await queryOne('SELECT COUNT(*)::int as c FROM interactive_stamps WHERE event_id = ?', [event_id]) as any)?.c || 0;
  if (count >= 20) throw new AppError(400, 'LIMIT_EXCEEDED', 'スタンプは最大20個です');

  const id = uuidv4();
  await execute(
    `INSERT INTO interactive_stamps (id, event_id, label, emoji, color, animation, sort_order, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, event_id, String(label).slice(0, 100), emoji || '', color || '#e11d48',
     animation || 'bounce', sort_order || 0, image_url || null]
  );

  const row = await queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
}));

// スタンプ更新
router.put('/:id', wrap(async (req, res) => {
  const existing = await queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'スタンプが見つかりません');

  const b = req.body;
  await execute(
    `UPDATE interactive_stamps SET
       label = COALESCE(?, label), emoji = COALESCE(?, emoji), color = COALESCE(?, color),
       animation = COALESCE(?, animation), sort_order = COALESCE(?, sort_order),
       is_active = COALESCE(?, is_active), image_url = COALESCE(?, image_url)
     WHERE id = ?`,
    [b.label || null, b.emoji !== undefined ? b.emoji : null, b.color || null,
     b.animation || null, b.sort_order !== undefined ? b.sort_order : null,
     b.is_active !== undefined ? b.is_active : null,
     b.image_url !== undefined ? (b.image_url || null) : null,
     req.params.id]
  );

  const row = await queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
}));

// スタンプ削除
router.delete('/:id', wrap(async (req, res) => {
  await execute('DELETE FROM interactive_stamps WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));

// 並び替え
router.put('/event/:eventId/reorder', wrap(async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) throw new AppError(400, 'VALIDATION_ERROR', 'orderは配列で指定してください');

  for (const item of order.slice(0, 20)) {
    if (item.id && typeof item.sort_order === 'number') {
      await execute('UPDATE interactive_stamps SET sort_order = ? WHERE id = ? AND event_id = ?',
        [item.sort_order, item.id, req.params.eventId]);
    }
  }

  const rows = await queryAll('SELECT * FROM interactive_stamps WHERE event_id = ? ORDER BY sort_order', [req.params.eventId]);
  res.json({ success: true, data: rows });
}));

export default router;
