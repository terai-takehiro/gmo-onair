import { Router } from 'express';
import { queryAll as query, queryOne, execute } from '../../../shared/db/connection';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const rows = await query(
      `SELECT t.*, p.name AS project_name, p.gls_number
       FROM liveops_timers t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.deleted_at IS NULL
       ORDER BY t.updated_at DESC`,
      []
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT t.*, p.name AS project_name, p.gls_number
       FROM liveops_timers t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: computeClientState(row) });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { name, projectId, warningThresholdSec = 60, viewerOverlayProgramId } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    const id = uuidv4();
    await execute(
      `INSERT INTO liveops_timers (id, name, project_id, warning_threshold_sec, viewer_overlay_program_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, name, projectId || null, warningThresholdSec, viewerOverlayProgramId || null, userId]
    );
    const row = await queryOne('SELECT * FROM liveops_timers WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, projectId, warningThresholdSec, viewerOverlayProgramId } = req.body;
    await execute(
      `UPDATE liveops_timers SET
         name = COALESCE($2, name),
         project_id = $3,
         warning_threshold_sec = COALESCE($4, warning_threshold_sec),
         viewer_overlay_program_id = $5,
         updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id, name ?? null, projectId ?? null, warningThresholdSec ?? null, viewerOverlayProgramId ?? null]
    );
    const row = await queryOne('SELECT * FROM liveops_timers WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await execute(
      'UPDATE liveops_timers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

function computeClientState(row: any) {
  if (!row.running) {
    return {
      ...row,
      remainingMs: Number(row.paused_remaining_ms ?? row.remaining_ms),
    };
  }
  const elapsed = row.started_at ? Date.now() - new Date(row.started_at).getTime() : 0;
  const remainingMs = Number(row.paused_remaining_ms) - elapsed;
  return { ...row, remaining_ms: remainingMs };
}

export default router;
