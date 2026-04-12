import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
router.use(requireAuth, requirePermission('interactive'));

// スタンプ一覧 (イベント別)
router.get('/event/:eventId', async (req, res) => {
  const rows = await queryAll(
    'SELECT * FROM interactive_stamps WHERE event_id = ? ORDER BY sort_order',
    [req.params.eventId]
  );
  res.json({ success: true, data: rows });
});

// スタンプ作成
router.post('/', requirePermission('interactive', 'editor'), async (req, res) => {
  const { event_id, label, emoji, color, animation, sort_order, image_url } = req.body;
  if (!event_id || !label) throw new AppError(400, 'VALIDATION_ERROR', 'event_idとlabelは必須です');

  const event = await queryOne('SELECT id FROM interactive_events WHERE id = ? AND deleted_at IS NULL', [event_id]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  // 最大20スタンプ/イベント
  const countRow = await queryOne('SELECT COUNT(*)::int as c FROM interactive_stamps WHERE event_id = ?', [event_id]) as any;
  if (countRow.c >= 20) throw new AppError(400, 'LIMIT_EXCEEDED', 'スタンプは最大20個です');

  const id = uuidv4();
  const safeLabel = String(label).slice(0, 100);
  const safeEmoji = emoji ? String(emoji).slice(0, 20) : '';
  const safeColor = color ? String(color).slice(0, 20) : '#e11d48';
  const safeAnimation = animation && ['bounce', 'fade', 'slide', 'shake', 'pop', 'none'].includes(animation) ? animation : 'bounce';
  // image_url: base64 data URL or https URL (max 2MB base64 ≈ 2.7M chars — capped at 3M)
  const safeImageUrl = image_url ? String(image_url).slice(0, 3_000_000) : null;

  await execute(
    `INSERT INTO interactive_stamps (id, event_id, label, emoji, color, animation, sort_order, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, event_id, safeLabel, safeEmoji, safeColor, safeAnimation, sort_order || 0, safeImageUrl]
  );

  const row = await queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// スタンプ更新
router.put('/:id', requirePermission('interactive', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'スタンプが見つかりません');

  const { label, emoji, color, animation, sort_order, is_active, image_url } = req.body;

  await execute(
    `UPDATE interactive_stamps SET label=?, emoji=?, color=?, animation=?, sort_order=?, is_active=?, image_url=? WHERE id=?`,
    [
      label ? String(label).slice(0, 100) : existing.label,
      emoji !== undefined ? String(emoji).slice(0, 20) : existing.emoji,
      color ? String(color).slice(0, 20) : existing.color,
      animation && ['bounce', 'fade', 'slide', 'shake', 'pop', 'none'].includes(animation) ? animation : existing.animation,
      sort_order !== undefined ? sort_order : existing.sort_order,
      is_active !== undefined ? is_active : existing.is_active,
      image_url !== undefined ? (image_url ? String(image_url).slice(0, 3_000_000) : null) : existing.image_url,
      req.params.id,
    ]
  );

  const row = await queryOne('SELECT * FROM interactive_stamps WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// スタンプ削除
router.delete('/:id', requirePermission('interactive', 'editor'), async (req, res) => {
  await execute('DELETE FROM interactive_stamps WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

// スタンプ並び替え (一括)
router.put('/event/:eventId/reorder', requirePermission('interactive', 'editor'), async (req, res) => {
  const { order } = req.body; // [{ id, sort_order }]
  if (!Array.isArray(order)) throw new AppError(400, 'VALIDATION_ERROR', 'orderは配列で指定してください');

  for (const item of order.slice(0, 20)) {
    if (item.id && typeof item.sort_order === 'number') {
      await execute('UPDATE interactive_stamps SET sort_order = ? WHERE id = ? AND event_id = ?', [item.sort_order, item.id, req.params.eventId]);
    }
  }

  const rows = await queryAll(
    'SELECT * FROM interactive_stamps WHERE event_id = ? ORDER BY sort_order',
    [req.params.eventId]
  );
  res.json({ success: true, data: rows });
});

export default router;
