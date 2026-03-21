import { Router } from 'express';
import { queryAll } from '../db/connection';

const router = Router();

router.get('/events', (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  let where = 'WHERE p.deleted_at IS NULL';
  const params: unknown[] = [];
  if (from) { where += ` AND (p.event_end >= ? OR p.rehearsal_end >= ?)`; params.push(from, from); }
  if (to) { where += ` AND (p.event_start <= ? OR p.rehearsal_start <= ?)`; params.push(to, to); }
  const projects = queryAll(`SELECT p.id, p.gls_number, p.name, p.rehearsal_start, p.rehearsal_end, p.event_start, p.event_end, p.status, c.name as customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id ${where}`, params);
  const events: any[] = [];
  for (const p of projects) {
    if (p.rehearsal_start) {
      events.push({ id: `${p.id}-rehearsal`, title: `[リハ] ${p.gls_number} ${p.name}`, start: p.rehearsal_start, end: p.rehearsal_end || p.rehearsal_start, type: 'rehearsal', status: p.status, gls_number: p.gls_number, project_id: p.id, customer_name: p.customer_name });
    }
    if (p.event_start) {
      events.push({ id: `${p.id}-event`, title: `${p.gls_number} ${p.name}`, start: p.event_start, end: p.event_end || p.event_start, type: 'event', status: p.status, gls_number: p.gls_number, project_id: p.id, customer_name: p.customer_name });
    }
  }
  res.json({ success: true, data: events });
});

export default router;
