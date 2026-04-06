import { Router } from 'express';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// 認証のみ（sales権限不要）の軽量エンドポイント
// Qシート・EventStampなど他アプリからGLS案件・エピソードを参照するため
router.use(requireAuth);

// GLS番号付き案件一覧（セレクター用）
router.get('/gls-options', async (_req, res) => {
  const rows = await queryAll(
    `SELECT p.id, p.gls_number, p.name, c.name as customer_name
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.gls_number IS NOT NULL AND p.deleted_at IS NULL
     ORDER BY p.gls_number DESC`
  );
  res.json({ success: true, data: rows });
});

// エピソード一覧（セレクター用）
router.get('/:projectId/episodes-options', async (req, res) => {
  const projectId = req.params.projectId;

  const project = await queryOne(
    'SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId]
  );
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const rows = await queryAll(
    `SELECT id, episode_code, episode_number, broadcast_date, recording_date
     FROM episodes
     WHERE project_id = ? AND deleted_at IS NULL
     ORDER BY episode_number ASC`,
    [projectId]
  );
  res.json({ success: true, data: rows });
});

export default router;
