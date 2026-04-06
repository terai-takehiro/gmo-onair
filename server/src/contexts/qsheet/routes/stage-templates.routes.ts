import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('qsheet'));

// ============================================================
// テンプレート一覧
// ============================================================
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await queryAll(
      `SELECT st.*, u.name as creator_name
       FROM qsheet_stage_templates st
       LEFT JOIN users u ON st.created_by = u.id
       WHERE st.deleted_at IS NULL
       ORDER BY st.name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// テンプレート取得
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      'SELECT * FROM qsheet_stage_templates WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません' } });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// テンプレート作成
// ============================================================
router.post('/', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const id = uuid();
    const { name, elements } = req.body;

    await execute(
      `INSERT INTO qsheet_stage_templates (id, name, elements, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)`,
      [id, name, JSON.stringify(elements || []), req.user!.id]
    );

    const row = await queryOne('SELECT * FROM qsheet_stage_templates WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// テンプレート更新
// ============================================================
router.put('/:id', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM qsheet_stage_templates WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません' } });
      return;
    }

    const { name, elements } = req.body;

    await execute(
      `UPDATE qsheet_stage_templates
       SET name = $1, elements = $2, updated_by = $3, updated_at = NOW()
       WHERE id = $4`,
      [name, JSON.stringify(elements), req.user!.id, req.params.id]
    );

    const row = await queryOne('SELECT * FROM qsheet_stage_templates WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// テンプレート削除 (ソフトデリート)
// ============================================================
router.delete('/:id', requirePermission('qsheet', 'manager'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM qsheet_stage_templates WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'テンプレートが見つかりません' } });
      return;
    }

    await execute(
      'UPDATE qsheet_stage_templates SET deleted_at = NOW(), updated_by = $1 WHERE id = $2',
      [req.user!.id, req.params.id]
    );

    res.json({ success: true, data: { id: req.params.id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
