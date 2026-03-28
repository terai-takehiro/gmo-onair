import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { opportunityService } from '../services/opportunity.service';

const router = Router();

router.get('/', (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const stage = req.query.stage as string;
  const assignedTo = req.query.assigned_to as string;
  const result = opportunityService.list({ search, stage, assignedTo }, page, limit, offset);
  res.json(paginatedResponse(result.rows, result.total, result.page, result.limit));
});

router.get('/:id', (req, res) => {
  const row = opportunityService.getById(req.params.id as string);
  res.json({ success: true, data: row });
});

router.post('/', requireAuth, (req, res) => {
  const row = opportunityService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, data: row });
});

router.put('/:id', requireAuth, (req, res) => {
  const row = opportunityService.update(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: row });
});

router.patch('/:id/stage', requireAuth, (req, res) => {
  const { stage, broadcast_type, media_platform, initial_episode_count } = req.body;
  const result = opportunityService.changeStage(req.params.id as string, stage, {
    broadcastType: broadcast_type,
    mediaPlatform: media_platform,
    initialEpisodeCount: parseInt(initial_episode_count) || 0,
  }, req.user!.id);
  res.json({ success: true, data: result.opportunity, project: result.project, episodes: result.episodes, episodeOrder: result.episodeOrder });
});

router.get('/:id/dates', (req, res) => {
  const dates = opportunityService.getDates(req.params.id as string);
  res.json({ success: true, data: dates });
});

router.put('/:id/dates', requireAuth, (req, res) => {
  const saved = opportunityService.saveDates(req.params.id as string, req.body.dates);
  res.json({ success: true, data: saved });
});

router.delete('/:id', requireAuth, (req, res) => {
  opportunityService.delete(req.params.id as string, req.user!.id);
  res.json({ success: true, message: '削除しました' });
});

export default router;
