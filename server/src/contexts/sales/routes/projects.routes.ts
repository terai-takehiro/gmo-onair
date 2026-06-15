import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { projectService, ProjectFilter } from '../services/project.service';
import { queryAll } from '../../../shared/db/connection';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

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
    source: req.query.source === 'kessan' ? 'kessan' : undefined,
    kessanMarker: req.query.kessan_marker as string,
    eventMonth: req.query.event_month as string,
    sortBy: req.query.sort_by as string,
    sortDir: (req.query.sort_dir as 'asc' | 'desc') || 'desc',
  };
  const { rows, total } = await projectService.list(filter, page, limit, offset);
  res.json(paginatedResponse(rows, total, page, limit));
});

// CSV Export
router.get('/export', requirePermission('sales', 'exporter'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT p.gls_number, p.name, c.name as client_name, p.stage, p.expected_amount
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.deleted_at IS NULL
     ORDER BY p.created_at DESC`
  ) as Record<string, unknown>[];
  const columns = ['gls_number', 'name', 'client_name', 'stage', 'expected_amount'];
  csvResponse(res, 'projects.csv', generateCsv(rows, columns));
});

// タグ一覧
router.get('/tags', async (_req, res) => {
  res.json({ success: true, data: await projectService.getTags() });
});

// GLS番号付き案件一覧（リンク先選択用）
router.get('/gls-projects', async (_req, res) => {
  res.json({ success: true, data: await projectService.getGlsProjects() });
});

// 決算インポートのマーカー (取込バッチ) 一覧
router.get('/kessan-markers', async (_req, res) => {
  res.json({ success: true, data: await projectService.getKessanMarkers() });
});

// 一括更新 (申し込み情報等のパラメータをまとめて変更)
router.patch('/bulk', requirePermission('sales', 'manager'), async (req, res) => {
  const { ids, set } = req.body || {};
  const result = await projectService.bulkUpdate(ids, set || {}, req.user!.id);
  res.json({ success: true, data: result });
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
router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const result = await projectService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, data: result });
});

// 更新
router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const result = await projectService.update(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: result });
});

// ステージ変更
router.patch('/:id/stage', requirePermission('sales', 'editor'), async (req, res) => {
  const { stage, ...rest } = req.body;
  const result = await projectService.changeStage(req.params.id as string, stage, rest, req.user!.id);
  res.json({ success: true, data: result });
});

// GLS発番
router.post('/:id/issue-gls', requirePermission('sales', 'editor'), async (req, res) => {
  const result = await projectService.issueGls(req.params.id as string, req.body, req.user!.id);
  res.json({ success: true, data: result });
});

// 案件分類の A↔B 切替 (発番済の場合は GLS 採番し直し + episode_code / BOX フォルダ自動更新)
router.patch('/:id/gls-category', requirePermission('sales', 'manager'), async (req, res) => {
  const { gls_category } = req.body || {};
  const result = await projectService.changeGlsCategory(req.params.id as string, gls_category, req.user!.id);
  res.json({ success: true, data: result });
});

// BOX フォルダ手動作成 (既存案件向けバックフィル / 失敗ケースのリトライ)
router.post('/:id/create-box-folder', requirePermission('sales', 'manager'), async (req, res) => {
  const result = await projectService.createBoxFolder(req.params.id as string);
  res.json({ success: true, data: result });
});

// 既存GLS案件へのリンク（エピソード追加）
router.post('/:id/link-gls', requirePermission('sales', 'editor'), (req, res) => {
  const { target_project_id } = req.body;
  const result = projectService.linkToExistingGls(req.params.id as string, target_project_id, req.user!.id);
  res.json({ success: true, data: result });
});

// 削除
router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await projectService.delete(req.params.id as string, req.user!.id);
  res.json({ success: true, message: '削除しました' });
});

export default router;
