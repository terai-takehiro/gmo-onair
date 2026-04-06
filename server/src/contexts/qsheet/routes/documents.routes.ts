import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('qsheet'));

// ============================================================
// ドキュメント一覧
// ============================================================
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const { status, episode_id, search } = req.query;
    let sql = `
      SELECT d.*, u.name as creator_name
      FROM qsheet_documents d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.deleted_at IS NULL
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND d.status = $${paramIndex++}`;
      params.push(status);
    }
    if (episode_id) {
      sql += ` AND d.episode_id = $${paramIndex++}`;
      params.push(episode_id);
    }
    if (search) {
      sql += ` AND d.title ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }

    sql += ' ORDER BY d.updated_at DESC';

    const rows = await queryAll(sql, params);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// ドキュメント取得
// ============================================================
router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      `SELECT d.*, u.name as creator_name
       FROM qsheet_documents d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.id = $1 AND d.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// ドキュメント作成
// ============================================================
router.post('/documents', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const id = uuid();
    const { title, data, episode_id, project_id, broadcast_date, episode_code } = req.body;

    await execute(
      `INSERT INTO qsheet_documents (id, title, data, episode_id, project_id, broadcast_date, episode_code, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $8)`,
      [id, title || '', JSON.stringify(data || {}), episode_id || null, project_id || null, broadcast_date || null, episode_code || null, req.user!.id]
    );

    const row = await queryOne('SELECT * FROM qsheet_documents WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// ドキュメント更新
// ============================================================
router.put('/documents/:id', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }

    const { title, data, episode_id, project_id, broadcast_date, episode_code, status } = req.body;

    await execute(
      `UPDATE qsheet_documents
       SET title = $1, data = $2, episode_id = $3, project_id = $4,
           broadcast_date = $5, episode_code = $6, status = $7,
           updated_by = $8, updated_at = NOW()
       WHERE id = $9`,
      [title, JSON.stringify(data), episode_id || null, project_id || null, broadcast_date || null, episode_code || null, status || 'draft', req.user!.id, req.params.id]
    );

    const row = await queryOne('SELECT * FROM qsheet_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: row });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// ドキュメント削除 (ソフトデリート)
// ============================================================
router.delete('/documents/:id', requirePermission('qsheet', 'manager'), async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ドキュメントが見つかりません' } });
      return;
    }

    await execute(
      'UPDATE qsheet_documents SET deleted_at = NOW(), updated_by = $1 WHERE id = $2',
      [req.user!.id, req.params.id]
    );

    res.json({ success: true, data: { id: req.params.id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

// ============================================================
// エピソード検索 (ドキュメント紐付け用)
// ============================================================
router.get('/episodes', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT e.id, e.episode_code, e.title, e.broadcast_date, p.name as project_name
      FROM episodes e
      LEFT JOIN projects p ON e.project_id = p.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND (e.title ILIKE $${paramIndex} OR e.episode_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ' ORDER BY e.broadcast_date DESC LIMIT 50';

    const rows = await queryAll(sql, params);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
