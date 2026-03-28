import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// GET /projects/:id/simulation
router.get('/:id/simulation', (req, res) => {
  const project = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const items = queryAll(
    `SELECT s.id, s.pricing_item_id, s.quantity, s.days, s.unit_price, s.subtotal,
            pi.name as pricing_item_name, pi.sub_label, pi.calc_type,
            pc.name as category_name, pc.sort_order as category_sort_order
     FROM simulations s
     LEFT JOIN pricing_items pi ON pi.id = s.pricing_item_id
     LEFT JOIN pricing_categories pc ON pc.id = pi.category_id
     WHERE s.project_id = ?
     ORDER BY pc.sort_order, pi.sort_order`,
    [req.params.id]
  );
  res.json({ success: true, data: items });
});

// PUT /projects/:id/simulation
router.put('/:id/simulation', requireAuth, (req, res) => {
  const project = queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const { items } = req.body;
  if (!Array.isArray(items)) throw new AppError(400, 'VALIDATION_ERROR', 'itemsは配列で指定してください');

  execute(`DELETE FROM simulations WHERE project_id = ?`, [req.params.id]);

  for (const item of items) {
    execute(
      `INSERT INTO simulations (id, project_id, pricing_item_id, quantity, days, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), req.params.id, item.pricing_item_id, item.quantity ?? 0, item.days ?? 0, item.unit_price ?? 0, item.subtotal ?? 0]
    );
  }

  const saved = queryAll(
    `SELECT s.id, s.pricing_item_id, s.quantity, s.days, s.unit_price, s.subtotal,
            pi.name as pricing_item_name, pi.sub_label, pi.calc_type,
            pc.name as category_name, pc.sort_order as category_sort_order
     FROM simulations s
     LEFT JOIN pricing_items pi ON pi.id = s.pricing_item_id
     LEFT JOIN pricing_categories pc ON pc.id = pi.category_id
     WHERE s.project_id = ?
     ORDER BY pc.sort_order, pi.sort_order`,
    [req.params.id]
  );
  res.json({ success: true, data: saved });
});

export default router;
