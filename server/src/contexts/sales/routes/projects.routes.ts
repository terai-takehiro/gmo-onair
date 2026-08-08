import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { projectService, ProjectFilter } from '../services/project.service';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { generateCsv, csvResponse } from '../../../shared/utils/csv-export';
import { AppError } from '../../../shared/middleware/errorHandler';
import { config } from '../../../config';
import multer from 'multer';
import {
  extractFolderId, isBoxConfigured, listFolderItems, uploadToFolder, MAX_UPLOAD_BYTES,
} from '../../../shared/services/box';

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
    issued: req.query.issued === '1' || req.query.issued === 'true',
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
  const { rows, total, stageCounts } = await projectService.list(filter, page, limit, offset);
  // stage_counts は v4 の案件一覧のチップに出す件数 (ステージ以外の絞り込みだけを掛けたもの)。
  // 既存の呼び出し側は data / pagination しか見ないので足しても壊れない
  res.json({ ...paginatedResponse(rows, total, page, limit), stage_counts: stageCounts });
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

// ステージ変更
router.patch('/:id/stage', requirePermission('sales', 'editor'), async (req, res) => {
  const { stage, ...rest } = req.body;
  const result = await projectService.changeStage(req.params.id as string, stage, rest, req.user!.id);
  res.json({ success: true, data: result });
});

/**
 * 次に出る GLS 番号を**採らずに**見る。
 *
 * 受注に上げる前の確認ダイアログが「GLS-A012 を採ります」と出すために使う。
 * **採番はしない**ので、先に別の人が発番すると1つ後ろになる（画面にそう書く）。
 */
router.get('/:id/next-gls', requirePermission('sales', 'reader'), async (req, res) => {
  res.json({ success: true, data: await projectService.peekGls(req.params.id as string) });
});

// GLS発番（受注に上げると `PATCH /:id/stage` から自動で呼ばれる。
// この口は「口頭決定のうちに先に番号が要る」ときのために残してある）
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

/**
 * 案件の BOX フォルダにファイルを置く (v4 ⑥ 書類タブ)。
 *
 * ── 読み取りと違って、失敗は隠さない ────────────────────────
 *
 * 中身を出すほうは BOX が落ちていても 200 で返します（案件を止めないため）。
 * **置くほうは違います** — 上がっていないのに上がったように見えるのが一番困るので、
 * 理由を付けて失敗を返します。
 *
 * ── どこに置くかを画面に選ばせる ────────────────────────────
 *
 * 社内限り（発注・請求・原価）と社外共有（見積・台本・納品物）は
 * **取り違えると原価が外に出ます**。既定を持たず、`scope` を必須にします。
 */
const boxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 },
});

router.post(
  '/:id/box-files',
  requirePermission('sales', 'editor'),
  boxUpload.array('files', 5),
  async (req, res) => {
    const scope = req.query.scope === 'internal' ? 'internal'
      : req.query.scope === 'external' ? 'external' : null;
    if (!scope) throw new AppError(400, 'VALIDATION_ERROR', '置き場所（社内限り／社外共有）を指定してください');

    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw new AppError(400, 'VALIDATION_ERROR', 'ファイルを選んでください');

    const project = await queryOne(
      'SELECT box_url_internal, box_url_external FROM projects WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
    ) as { box_url_internal: string | null; box_url_external: string | null } | undefined;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    const folderId = extractFolderId(
      scope === 'internal' ? project.box_url_internal : project.box_url_external,
    );
    if (!folderId) {
      throw new AppError(400, 'NO_FOLDER',
        'この案件の BOX フォルダがまだ作られていません。GLS を発番するか、フォルダを作ってからお試しください。');
    }
    if (!isBoxConfigured()) {
      throw new AppError(503, 'NOT_CONFIGURED', 'この環境は BOX につないでいないので、置けません。');
    }

    // **1つずつ上げて、上がった分だけ返す。** まとめて失敗にすると
    // 「3つ中2つは入っている」ことに気づけず、同じものをもう一度上げることになる
    const done = [];
    const failed = [];
    for (const f of files) {
      // multer は multipart のファイル名を latin1 で読む。日本語のファイル名が
      // 文字化けしたまま BOX に載ると、探せないうえ直せない
      const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
      try {
        done.push(await uploadToFolder(folderId, name, f.buffer));
      } catch (err) {
        console.error('[box] upload failed:', name, (err as Error).message);
        failed.push(name);
      }
    }
    if (done.length === 0) {
      throw new AppError(502, 'BOX_UNAVAILABLE', 'BOX に置けませんでした。あとでもう一度お試しください。');
    }
    res.status(201).json({ success: true, data: { uploaded: done, failed } });
  },
);

// BOX フォルダ手動作成 (既存案件向けバックフィル / 失敗ケースのリトライ)
router.post('/:id/create-box-folder', requirePermission('sales', 'manager'), async (req, res) => {
  const result = await projectService.createBoxFolder(req.params.id as string);
  res.json({ success: true, data: result });
});

/**
 * 案件の BOX フォルダの中身 (v4 ⑥ 書類タブ)。
 *
 * `scope=internal` 社内限り / `scope=external` 社外と共有。
 *
 * **BOX が落ちていても案件は止めない**というのがこのリポジトリの決めごと
 * (`shared/services/box.ts` の設計方針) なので、**失敗しても 200 で返し**、
 * `reason` に理由を入れます。画面はそれを「BOX につながりません」と出すだけで、
 * 案件詳細の他のタブは普通に使えます。500 にすると画面全体がエラーになります。
 */
router.get('/:id/box-files', async (req, res) => {
  const scope = req.query.scope === 'internal' ? 'internal' : 'external';
  const project = await queryOne(
    'SELECT box_url_internal, box_url_external FROM projects WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  ) as { box_url_internal: string | null; box_url_external: string | null } | undefined;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const folderId = extractFolderId(
    scope === 'internal' ? project.box_url_internal : project.box_url_external
  );
  if (!folderId) {
    res.json({ success: true, data: [], reason: 'NO_FOLDER' });
    return;
  }
  if (!isBoxConfigured()) {
    res.json({ success: true, data: [], reason: 'NOT_CONFIGURED' });
    return;
  }
  try {
    res.json({ success: true, data: await listFolderItems(folderId) });
  } catch (err) {
    console.error('[box] listFolderItems failed:', (err as Error).message);
    res.json({ success: true, data: [], reason: 'UNAVAILABLE' });
  }
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
