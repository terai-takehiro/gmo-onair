import { Router } from 'express';
import { queryAll } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('studio'));

router.get('/events', async (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  let where = 'WHERE p.deleted_at IS NULL AND p.gls_number IS NOT NULL';
  const params: unknown[] = [];
  if (from) { where += ` AND p.event_end >= ?`; params.push(from); }
  if (to) { where += ` AND p.event_start <= ?`; params.push(to); }
  const projects = await queryAll(`SELECT p.id, p.gls_number, p.name, p.event_start, p.event_end, p.stage, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id ${where}`, params);
  const events: any[] = [];
  for (const p of projects) {
    if (p.event_start) {
      events.push({ id: `${p.id}-event`, title: `${p.gls_number} ${p.name}`, start: p.event_start, end: p.event_end || p.event_start, type: 'event', stage: p.stage, gls_number: p.gls_number, project_id: p.id, customer_name: p.customer_name });
    }
  }
  // Episode events
  const episodeEvents = await queryAll(
    `SELECT e.id, e.episode_code as title, e.recording_date, e.broadcast_date,
     p.gls_number, p.id as project_id, p.status
     FROM episodes e
     JOIN projects p ON p.id = e.project_id
     WHERE e.deleted_at IS NULL AND p.deleted_at IS NULL
     AND ((e.recording_date BETWEEN ? AND ?) OR (e.broadcast_date BETWEEN ? AND ?))`,
    [from, to, from, to]
  );

  for (const ep of episodeEvents) {
    if (ep.recording_date) {
      events.push({
        id: `${ep.id}-rec`,
        title: `📹 ${ep.title}`,
        start: ep.recording_date,
        end: ep.recording_date,
        type: 'recording',
        stage: ep.stage,
        gls_number: ep.gls_number,
        project_id: ep.project_id,
      });
    }
    if (ep.broadcast_date && ep.broadcast_date !== ep.recording_date) {
      events.push({
        id: `${ep.id}-bc`,
        title: `📡 ${ep.title}`,
        start: ep.broadcast_date,
        end: ep.broadcast_date,
        type: 'broadcast',
        stage: ep.stage,
        gls_number: ep.gls_number,
        project_id: ep.project_id,
      });
    }
  }

  res.json({ success: true, data: events });
});

export default router;
