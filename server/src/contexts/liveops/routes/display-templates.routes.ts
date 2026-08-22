import { Router } from 'express';
import { queryAll as query, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const canRead = [requireAuth, requirePermission('qsheet', 'reader')] as const;
const canWrite = [requireAuth, requirePermission('qsheet', 'manager')] as const;

// 一覧（検索・使用件数つき）。使用件数 = このテンプレートを source_template_id に持つ、
// 削除されていないタイマーの件数（独立コピー後の同期は無いので、あくまで「現在この
// テンプレート由来と表示ラベルされているタイマーの数」であり、その後タイマー側を
// 手直しされていても数える）。
router.get('/', ...canRead, async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const params: string[] = [];
    let where = 'WHERE tpl.deleted_at IS NULL';
    if (q) { params.push(`%${q}%`); where += ` AND tpl.name ILIKE $${params.length}`; }
    const rows = await query(
      `SELECT tpl.*,
              (SELECT COUNT(*) FROM liveops_timer_display_layouts l
                 JOIN liveops_timers t ON t.id = l.timer_id AND t.deleted_at IS NULL
                WHERE l.source_template_id = tpl.id) AS usage_count
         FROM liveops_display_templates tpl
         ${where}
         ORDER BY tpl.updated_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:id', ...canRead, async (req, res) => {
  try {
    const row = await queryOne(
      'SELECT * FROM liveops_display_templates WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 作成（「名前を付けて保存」）
router.post('/', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { name, layout } = req.body;
    if (!name || !layout) return res.status(400).json({ success: false, message: 'name and layout required' });
    const id = uuidv4();
    await execute(
      `INSERT INTO liveops_display_templates (id, name, layout, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$4)`,
      [id, name, JSON.stringify(layout), userId]
    );
    const row = await queryOne('SELECT * FROM liveops_display_templates WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 更新。独立コピー方式なので、これは「テンプレート自身の以後の適用結果」を変えるだけ
// ── 既に適用済みのタイマーには一切影響しない。
router.put('/:id', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { name, layout } = req.body;
    await execute(
      `UPDATE liveops_display_templates SET
         name = COALESCE($2, name), layout = COALESCE($3, layout),
         updated_by = $4, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id, name ?? null, layout ? JSON.stringify(layout) : null, userId]
    );
    const row = await queryOne('SELECT * FROM liveops_display_templates WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/:id', ...canWrite, async (req, res) => {
  try {
    await execute(
      'UPDATE liveops_display_templates SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// テンプレートを特定タイマーへ「適用」＝ layout をコピーして
// liveops_timer_display_layouts へ upsert する（独立コピー。以後テンプレートと非同期）。
router.post('/:id/apply', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { timerId } = req.body;
    if (!timerId) return res.status(400).json({ success: false, message: 'timerId required' });
    const tpl = await queryOne(
      'SELECT layout FROM liveops_display_templates WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });
    await execute(
      `INSERT INTO liveops_timer_display_layouts (timer_id, layout, source_template_id, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (timer_id) DO UPDATE SET
         layout = EXCLUDED.layout,
         source_template_id = EXCLUDED.source_template_id,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [timerId, JSON.stringify((tpl as any).layout), req.params.id, userId]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
