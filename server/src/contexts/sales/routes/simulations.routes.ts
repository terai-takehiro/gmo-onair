import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// GET /opportunities/:id/simulation - Get simulation items for an opportunity
router.get('/:id/simulation', (req, res) => {
  const opp = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');

  const items = queryAll(
    `SELECT si.id, si.pricing_item_id, si.quantity, si.days, si.unit_price, si.subtotal,
            pi.name as pricing_item_name, pi.sub_label, pi.calc_type,
            pc.name as category_name, pc.sort_order as category_sort_order
     FROM simulation_items si
     LEFT JOIN pricing_items pi ON pi.id = si.pricing_item_id
     LEFT JOIN pricing_categories pc ON pc.id = pi.category_id
     WHERE si.opportunity_id = ? AND si.deleted_at IS NULL
     ORDER BY pc.sort_order, pi.sort_order`,
    [req.params.id]
  );

  res.json({ success: true, data: items });
});

// PUT /opportunities/:id/simulation - Save simulation (full replace)
router.put('/:id/simulation', requireAuth, (req, res) => {
  const opp = queryOne('SELECT id FROM opportunities WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!opp) throw new AppError(404, 'NOT_FOUND', 'ヨミが見つかりません');

  const { items } = req.body;
  if (!Array.isArray(items)) throw new AppError(400, 'VALIDATION_ERROR', 'itemsは配列で指定してください');

  // Delete existing simulation items
  execute(
    `DELETE FROM simulation_items WHERE opportunity_id = ?`,
    [req.params.id]
  );

  // Insert new items
  for (const item of items) {
    const id = uuidv4();
    execute(
      `INSERT INTO simulation_items (id, opportunity_id, pricing_item_id, quantity, days, unit_price, subtotal, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, item.pricing_item_id, item.quantity ?? 0, item.days ?? 0, item.unit_price ?? 0, item.subtotal ?? 0, req.user!.id]
    );
  }

  // Return saved items
  const saved = queryAll(
    `SELECT si.id, si.pricing_item_id, si.quantity, si.days, si.unit_price, si.subtotal,
            pi.name as pricing_item_name, pi.sub_label, pi.calc_type,
            pc.name as category_name, pc.sort_order as category_sort_order
     FROM simulation_items si
     LEFT JOIN pricing_items pi ON pi.id = si.pricing_item_id
     LEFT JOIN pricing_categories pc ON pc.id = pi.category_id
     WHERE si.opportunity_id = ? AND si.deleted_at IS NULL
     ORDER BY pc.sort_order, pi.sort_order`,
    [req.params.id]
  );

  res.json({ success: true, data: saved });
});

export default router;
