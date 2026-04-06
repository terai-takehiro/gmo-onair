import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
router.use(requireAuth, requirePermission('interactive'));

const VALID_TYPES = ['stamp_counter', 'ticker', 'bar_chart', 'floating'];

// テンプレート一覧
router.get('/', async (_req, res) => {
  const rows = await queryAll('SELECT * FROM interactive_overlay_templates ORDER BY name LIMIT 100');
  res.json({ success: true, data: rows });
});

// テンプレート作成
router.post('/', requirePermission('interactive', 'editor'), async (req, res) => {
  const { name, type, config } = req.body;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前は必須です');

  const safeType = type && VALID_TYPES.includes(type) ? type : 'stamp_counter';
  const id = uuidv4();

  await execute(
    `INSERT INTO interactive_overlay_templates (id, name, type, config, created_by) VALUES (?, ?, ?, ?, ?)`,
    [id, String(name).slice(0, 255), safeType, JSON.stringify(config || {}), req.user!.id]
  );

  const row = await queryOne('SELECT * FROM interactive_overlay_templates WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: row });
});

// テンプレート更新
router.put('/:id', requirePermission('interactive', 'editor'), async (req, res) => {
  const existing = await queryOne('SELECT * FROM interactive_overlay_templates WHERE id = ?', [req.params.id]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つかりません');

  const { name, type, config } = req.body;
  const safeType = type && VALID_TYPES.includes(type) ? type : existing.type;

  await execute(
    `UPDATE interactive_overlay_templates SET name=?, type=?, config=?, updated_at=NOW() WHERE id=?`,
    [name ? String(name).slice(0, 255) : existing.name, safeType, JSON.stringify(config || existing.config), req.params.id]
  );

  const row = await queryOne('SELECT * FROM interactive_overlay_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: row });
});

// テンプレート削除
router.delete('/:id', requirePermission('interactive', 'editor'), async (req, res) => {
  await execute('DELETE FROM interactive_overlay_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: '削除しました' });
});

export default router;
