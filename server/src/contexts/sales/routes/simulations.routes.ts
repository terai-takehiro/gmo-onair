import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

const SIM_SELECT = `
  SELECT s.id, s.pricing_item_id, s.quantity, s.days, s.unit_price, s.subtotal, s.status,
         pi.name as pricing_item_name, pi.sub_label, pi.calc_type,
         pc.name as category_name, pc.sort_order as category_sort_order
  FROM simulations s
  LEFT JOIN pricing_items pi ON pi.id = s.pricing_item_id
  LEFT JOIN pricing_categories pc ON pc.id = pi.category_id
  WHERE s.project_id = ?
  ORDER BY pc.sort_order, pi.sort_order`;

// GET /projects/:id/simulation
router.get('/:id/simulation', async (req, res) => {
  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const items = await queryAll(SIM_SELECT, [req.params.id]) as any[];

  // v2.9.198+: AI 下書き (draft) がある場合、その由来 (いつ・誰の指示・実行者) を監査ログから同梱。
  // simulations は全置換されるため行に created_at を持てず、mcp_audit_log が唯一の由来ソース。
  let aiDraftOrigin: Record<string, unknown> | null = null;
  if (items.some((it) => it.status === 'draft')) {
    aiDraftOrigin = await queryOne(
      `SELECT m.created_at, m.requested_by, m.actor_id, u.name AS actor_name
       FROM mcp_audit_log m
       LEFT JOIN users u ON u.id = m.actor_id
       WHERE m.tool_name = 'set_project_simulation'
         AND m.result_summary->>'project_id' = ?
         AND m.result_summary->>'status' = 'draft'
       ORDER BY m.created_at DESC LIMIT 1`,
      [req.params.id]
    ) as Record<string, unknown> | null;
  }
  res.json({ success: true, data: items, ai_draft_origin: aiDraftOrigin });
});

// PUT /projects/:id/simulation — UI からの保存は常に確定 (status=final)
router.put('/:id/simulation', requirePermission('sales', 'editor'), async (req, res) => {
  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const { items } = req.body;
  if (!Array.isArray(items)) throw new AppError(400, 'VALIDATION_ERROR', 'itemsは配列で指定してください');

  await execute(`DELETE FROM simulations WHERE project_id = ?`, [req.params.id]);

  for (const item of items) {
    await execute(
      `INSERT INTO simulations (id, project_id, pricing_item_id, quantity, days, unit_price, subtotal, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'final')`,
      [uuidv4(), req.params.id, item.pricing_item_id, item.quantity ?? 0, item.days ?? 0, item.unit_price ?? 0, item.subtotal ?? 0]
    );
  }

  // シミュレーション合計を expected_amount として案件に即時反映（リロードで消えないように）
  const totalAmount = items.reduce((sum: number, it: any) => sum + (Number(it.subtotal) || 0), 0);
  if (totalAmount > 0) {
    await execute(
      `UPDATE projects SET expected_amount = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [totalAmount, req.params.id]
    );
  }

  const saved = await queryAll(SIM_SELECT, [req.params.id]);
  res.json({ success: true, data: saved });
});

// POST /projects/:id/simulation/finalize — AI 下書き (draft) を確定して expected_amount に反映
router.post('/:id/simulation/finalize', requirePermission('sales', 'editor'), async (req, res) => {
  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  await execute(
    `UPDATE simulations SET status = 'final' WHERE project_id = ? AND status = 'draft'`,
    [req.params.id]
  );

  const saved = await queryAll(SIM_SELECT, [req.params.id]) as any[];
  const totalAmount = saved.reduce((sum: number, it: any) => sum + (Number(it.subtotal) || 0), 0);
  if (totalAmount > 0) {
    await execute(
      `UPDATE projects SET expected_amount = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [totalAmount, req.params.id]
    );
  }
  res.json({ success: true, data: saved });
});

export default router;
