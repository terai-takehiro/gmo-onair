import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { projectService, ProjectFilter } from '../services/project.service';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';
import { AppError } from '../../../shared/middleware/errorHandler';
import { config } from '../../../config';
import {
  getStageAsk, assertStageRequirements, applyStageAnswers, attachHoldRooms,
  STAGE_ASKS, INTAKE_FIELDS,
} from '../services/stage-ask.service';

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
    aiCreated: req.query.ai_created === '1' || req.query.ai_created === 'true',
    aiReviewed: req.query.ai_reviewed === 'reviewed' ? 'reviewed'
      : req.query.ai_reviewed === 'unreviewed' ? 'unreviewed' : undefined,
    eventMonth: req.query.event_month as string,
    eventFrom: req.query.event_from as string,
    eventTo: req.query.event_to as string,
    sortBy: req.query.sort_by as string,
    sortDir: (req.query.sort_dir as 'asc' | 'desc') || 'desc',
  };
  const { rows, total, summary } = await projectService.list(filter, page, limit, offset);
  // summary (区分ごとの件数・金額 / タブごとの件数) は既存レスポンスへの追加なので後方互換
  res.json({ ...paginatedResponse(rows, total, page, limit), summary });
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
  const project = await projectService.getById(req.params.id as string) as Record<string, unknown>;
  // AI 起票判定: 監査ログ照合 (OAuth 経由の本人名義でも検出) OR created_by=mcpActor (静的キー)
  if (project) {
    const audit = await queryOne(
      `SELECT requested_by FROM mcp_audit_log
       WHERE tool_name = 'create_project' AND result_summary->>'created_id' = ?
       ORDER BY created_at ASC LIMIT 1`,
      [project.id]
    ) as Record<string, unknown> | null;
    project.is_ai_created = !!audit || project.created_by === config.mcpActorId;
    project.ai_requested_by = audit?.requested_by ?? null;
  }
  res.json({ success: true, data: project });
});

// AI 起票案件の内容確認を記録 (ホームの AI 起票インボックス / 案件編集のバナーから)
router.post('/:id/ai-review', requirePermission('sales', 'editor'), async (req, res) => {
  await execute(
    `UPDATE projects SET ai_reviewed_at = NOW(), ai_reviewed_by = ?, updated_at = NOW()
     WHERE id = ? AND deleted_at IS NULL`,
    [req.user!.id, req.params.id]
  );
  res.json({ success: true, data: { reviewed: true } });
});

// AI 起票案件の内容確認を一括記録 (案件一覧の複数選択→まとめて確認済みに)
router.post('/ai-review-bulk', requirePermission('sales', 'editor'), async (req, res) => {
  const ids: unknown = (req.body || {}).ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ids は 1 件以上の配列で指定してください');
  }
  const idList = ids.filter((x): x is string => typeof x === 'string').slice(0, 500);
  if (idList.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '有効な ID がありません');
  const placeholders = idList.map(() => '?').join(', ');
  await execute(
    `UPDATE projects SET ai_reviewed_at = NOW(), ai_reviewed_by = ?, updated_at = NOW()
     WHERE id IN (${placeholders}) AND deleted_at IS NULL AND ai_reviewed_at IS NULL`,
    [req.user!.id, ...idList]
  );
  res.json({ success: true, data: { reviewed: idList.length } });
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

// 進んだ段で聞くこと (14章 27c)。画面はこれを読んで「その瞬間に聞く1〜2問」を出す。
// 定義はサーバー1か所 (stage-ask.service) にあるので、画面とずれない。
router.get('/:id/stage-ask', async (req, res) => {
  const to = String(req.query.to ?? '');
  res.json({ success: true, data: await getStageAsk(String(req.params.id), to) });
});

// 聞く項目そのもの (案件に依らない一覧)。27a の仕分けを画面に出すのに使う。
router.get('/stage-asks/all', async (_req, res) => {
  res.json({ success: true, data: { asks: STAGE_ASKS, intake: INTAKE_FIELDS } });
});

// ステージ変更
router.patch('/:id/stage', requirePermission('sales', 'editor'), async (req, res) => {
  const { stage, ...rest } = req.body;
  const id = String(req.params.id);

  // 必須が揃っていなければ止める。**画面だけの制限は必ず抜ける**ので
  // ここでも同じ定義で確かめる (何が足りないかは日本語の名前で返る)。
  await assertStageRequirements(id, stage, rest);

  // 聞いた答えを先に書く。書いてから動かせば changeStage の自動処理
  // (仮押さえ予約の作成など) が入った値を見られる。
  await applyStageAnswers(id, stage, rest, req.user!.id);

  const result = await projectService.changeStage(id, stage, rest, req.user!.id);

  // 仮押さえの部屋を予約に紐づける (予約が出来てから)。
  // 失敗してもステージ変更は成立させる — 部屋の紐づけのために操作を止めない。
  if (Array.isArray(rest.room_ids) && rest.room_ids.length > 0) {
    try {
      await attachHoldRooms(id, rest.room_ids.map(String), req.user!.id);
    } catch (e) {
      console.warn('[stage] 部屋の紐づけに失敗 (ステージ変更は成立):', (e as Error).message);
    }
  }

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
router.post('/:id/link-gls', requirePermission('sales', 'editor'), async (req, res) => {
  const { target_project_id } = req.body;
  const result = await projectService.linkToExistingGls(req.params.id as string, target_project_id, req.user!.id);
  res.json({ success: true, data: result });
});

// 発番済みの案件を別の既存GLSのエピソードへ紐づけ直す (旧GLSは履歴に保存)
router.post('/:id/relink-gls', requirePermission('sales', 'manager'), async (req, res) => {
  const { target_project_id } = req.body;
  const result = await projectService.relinkExistingGls(req.params.id as string, target_project_id, req.user!.id);
  res.json({ success: true, data: result });
});

// 削除
router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await projectService.delete(req.params.id as string, req.user!.id);
  res.json({ success: true, message: '削除しました' });
});

export default router;
