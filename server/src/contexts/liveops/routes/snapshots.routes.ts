import { Router } from 'express';
import { queryAll as query, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const canRead = [requireAuth, requirePermission('liveops', 'reader')] as const;

// 公開: 表示画面用（認証不要・ブラウザソース用）
router.get('/:programId/display', async (req, res) => {
  try {
    const rows = await query(
      `SELECT captured_at, youtube_count, jstream_count, total_count
       FROM liveops_snapshots
       WHERE program_id = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [req.params.programId]
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/', ...canRead, async (req, res) => {
  try {
    const { programId, youtubeCount, jstreamCount, details } = req.body;
    if (!programId) return res.status(400).json({ success: false, message: 'programId required' });

    await execute(
      `INSERT INTO liveops_snapshots (id, program_id, youtube_count, jstream_count, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), programId, youtubeCount ?? 0, jstreamCount ?? 0, details ? JSON.stringify(details) : null]
    );
    res.status(201).json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:programId', ...canRead, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 60, 300);
    const rows = await query(
      `SELECT captured_at, youtube_count, jstream_count, total_count, details
       FROM liveops_snapshots
       WHERE program_id = $1
       ORDER BY captured_at DESC
       LIMIT $2`,
      [req.params.programId, limit]
    );
    res.json({ success: true, data: rows.reverse() });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
