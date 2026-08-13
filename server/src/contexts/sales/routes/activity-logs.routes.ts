import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { activityLogService } from '../services/activity-log.service';
import {
  formatQueueStats, runFormatPass, resetFailed, redoFormat, DEFAULT_BATCH,
} from '../services/activity-format.service';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('sales'));

router.get('/', async (req, res) => {
  const { page, limit, offset, search } = extractPagination(req);
  const filter = {
    search,
    projectId: req.query.project_id as string,
    customerId: req.query.customer_id as string,
    userId: req.query.user_id as string,
    activityType: req.query.activity_type as string,
    origin: req.query.origin === 'ai' ? 'ai' as const
      : req.query.origin === 'human' ? 'human' as const : undefined,
    sort: req.query.sort === 'next_action' ? 'next_action' as const : undefined,
  };
  const result = await activityLogService.list(filter, page, limit, offset);
  res.json(paginatedResponse(result.rows, result.total, result.page, result.limit));
});

router.get('/upcoming', async (req, res) => {
  const days = parseInt(req.query.days as string) || 7;
  res.json({ success: true, data: await activityLogService.getUpcomingActions(req.user!.id, days) });
});

/*
 * 本文をあとから整える（バックフィル・migration 187）
 *
 * ⚠️ **`/:id` より前に置くこと。** 後ろに置くと `/format-status` が
 * `/:id` に食われ、「format-status という id の活動記録」を探して 404 になる
 * （`/upcoming` が前にあるのと同じ理由）。
 */
router.get('/format-status', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await formatQueueStats() });
  } catch (e) { next(e); }
});

/*
 * **走らせるのは manager 以上。** 1行1コールで課金され、しかも
 * **全案件の記録に一度に効く**（標準工程テンプレートを直せるのが manager なのと同じ重さ）。
 *
 * **返事を待たせない。** 20 件で 2 分ほどかかるので nginx の 60 秒に当たる
 * （`proxy_read_timeout` は書かれていない）。**先に 202 を返して裏で流し**、
 * 画面は `/format-status` を読み直して件数の減りを見る。
 */
router.post('/format-run', requirePermission('sales', 'manager'), async (req, res, next) => {
  try {
    const stats = await formatQueueStats();
    if (!stats.configured) {
      throw new AppError(400, 'AI_NOT_CONFIGURED', 'この環境は AI につないでいないので整えられません');
    }
    if (stats.pending === 0) {
      res.json({ success: true, data: { started: false, pending: 0 }, message: '整えていない記録はありません' });
      return;
    }
    const limit = Number(req.body?.limit) || DEFAULT_BATCH;
    res.status(202).json({
      success: true,
      data: { started: true, taking: Math.min(limit, stats.pending), pending: stats.pending },
      message: '裏で整えています。件数の減りは画面を読み直すと分かります',
    });
    // **応答を返したあとに流す。** ここで await しない（返事が返らなくなる）
    runFormatPass({ limit, actorId: req.user!.id })
      .then((r) => console.log('[activity-format] pass done:', JSON.stringify(r)))
      .catch((e) => console.error('[activity-format] pass failed:', (e as Error).message));
  } catch (e) { next(e); }
});

/** 失敗した行をもう一度対象に戻す（プロンプトを直したあとに使う） */
router.post('/format-reset-failed', requirePermission('sales', 'manager'), async (_req, res, next) => {
  try {
    const reset = await resetFailed();
    res.json({ success: true, data: { reset }, message: `${reset} 件を対象に戻しました` });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await activityLogService.getById(req.params.id as string) });
});

router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  res.status(201).json({ success: true, data: await activityLogService.create(req.body, req.user!.id) });
});

router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    // 直した人を渡す。**AI が整えた行を人が直した差分**の「誰が」に入る（条件2）
    data: await activityLogService.update(req.params.id as string, req.body, req.user!.id),
  });
});

/*
 * 「この整形は違う」— 1件を待ち行列に戻す（migration 188）。
 *
 * **`editor` で通す。** その記録を直せる人なら押せてよい（バッチの `manager` と違い、
 * 効くのは1行だけで、しかも原文は残る）。押した事実は `ai_corrections` に
 * `reject` として残り、プロンプト改善の材料になる（条件2）。
 */
router.post('/:id/format-redo', requirePermission('sales', 'editor'), async (req, res, next) => {
  try {
    await redoFormat(req.params.id as string, req.user!.id);
    res.json({
      success: true,
      data: await activityLogService.getById(req.params.id as string),
      message: '整え直しの順番に戻しました（毎晩 3:00 に自動で整えます）',
    });
  } catch (e) { next(e); }
});

// 次回アクションを完了 (営業ダッシュボードのワンタップ操作)
router.post('/:id/complete-next-action', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await activityLogService.completeNextAction(req.params.id as string) });
});

// 次回アクションを延期 (body: { date: 'YYYY-MM-DD' })
router.post('/:id/postpone-next-action', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await activityLogService.postponeNextAction(req.params.id as string, req.body?.date) });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await activityLogService.delete(req.params.id as string);
  res.json({ success: true, message: '削除しました' });
});

export default router;
