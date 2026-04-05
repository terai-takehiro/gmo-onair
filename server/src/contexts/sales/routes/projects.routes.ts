import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { projectService, ProjectFilter } from '../services/project.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('projects'));

// 統合一覧（タブ: all/yomi/active/completed/lost）
router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const filter: ProjectFilter = {
    search,
    stage: req.query.stage as string,
    assignedTo: req.query.assigned_to as string,
    tab: (req.query.tab as ProjectFilter['tab']) || 'all',
    tag: req.query.tag as string,
    glsCategory: req.query.gls_category as ProjectFilter['glsCategory'],
  };
  const { rows, total } = await projectService.list(filter, page, limit, offset);
  res.json(paginatedResponse(rows, total, page, limit));
});

// タグ一覧
router.get('/tags', async (_req, res) => {
  res.json({ success: true, data: await projectService.getTags() });
});

// GLS番号付き案件一覧（リンク先選択用）
router.get('/gls-projects', (_req, res) => {
  res.json({ success: true, data: projectService.getGlsProjects() });
});

// 詳細
router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await projectService.getById(req.params.id as string) });
});

// サマリー（売上/仕入/粗利）
router.get('/:id/summary', async (req, res) => {
  res.json({ success: true, data: await projectService.getSummary(req.params.id as string) });
});

// 新規作成（ヨミ段階）
router.post('/', requirePermission('projects', 'edit'), async (req, res) => {
  const result = await projectService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, data: result });
});

// 更新
router.put('/:id', requirePermission('projects', 'edit'), async (req, res) => {
  const result = await projectService.update(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: result });
});

// ステージ変更
router.patch('/:id/stage', requirePermission('projects', 'edit'), async (req, res) => {
  const { stage, ...rest } = req.body;
  const result = await projectService.changeStage(req.params.id as string, stage, rest, req.user!.id);
  res.json({ success: true, data: result });
});

// GLS発番
router.post('/:id/issue-gls', requirePermission('projects', 'edit'), async (req, res) => {
  const result = await projectService.issueGls(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: result });
});

// 既存GLS案件へのリンク（エピソード追加）
router.post('/:id/link-gls', requirePermission('projects', 'edit'), (req, res) => {
  const { target_project_id } = req.body;
  const result = projectService.linkToExistingGls(req.params.id as string, target_project_id, req.user!.id);
  res.json({ success: true, data: result });
});

// 削除
router.delete('/:id', requirePermission('projects', 'edit'), async (req, res) => {
  await projectService.delete(req.params.id as string, req.user!.id);
  res.json({ success: true, message: '削除しました' });
});

export default router;
