import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { extractPagination, paginatedResponse } from '../../../shared/services/pagination';
import { activityLogService } from '../services/activity-log.service';
import {
  formatQueueStats, runFormatPass, resetFailed, redoFormat, DEFAULT_BATCH,
} from '../services/activity-format.service';
import {
  shortQueueStats, runShortPass, resetShortFailed, redoShort,
} from '../services/next-action-short.service';
import { listByProject, parseDueBucket } from '../services/activity-by-project.service';

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
    // 案件の担当者で絞る（by-project の owner_id と同じ意味。user_id＝記録者とは別）
    ownerId: (req.query.owner_id as string) || undefined,
    activityType: req.query.activity_type as string,
    origin: req.query.origin === 'ai' ? 'ai' as const
      : req.query.origin === 'human' ? 'human' as const : undefined,
    sort: req.query.sort === 'next_action' ? 'next_action' as const : undefined,
  };
  const result = await activityLogService.list(filter, page, limit, offset);
  res.json(paginatedResponse(result.rows, result.total, result.page, result.limit));
});

/*
 * 案件別のまとまり（営業活動記録の主画面・利用者からのご指摘②）
 *
 * ⚠️ **`/:id` より前に置くこと。** 後ろに置くと `/by-project` が `/:id` に食われ、
 * 「by-project という id の活動記録」を探して 404 になります
 * （`/upcoming` `/format-status` が前にあるのと同じ理由）。
 *
 * `due` は期限の4区分（`overdue` / `today` / `week` / `none`）＋ `all`（既定）。
 * **本日+8 以降のやることはどの区分にも入りません** — 先の予定まで色で急かすと、
 * 本当に急ぐものが埋もれます。`all` には出ます。
 *
 * `user_id` は**活動を記録した人**（`activity_logs.user_id`）で絞ります。
 * `GET /activity-logs`（1件＝1行の一覧）・MCP の `list_activity_logs` と**同じ意味**です
 * — 画面は案件別と時系列で同じ `?user=` を持ち回るので、口ごとに意味を変えると
 * 並びを切り替えた瞬間に別の集まりが出ます（理由は service の `OWNER_SQL` の頭注）。
 *
 * 返りは `paginatedResponse` の形（`success` / `data` / `pagination`）に、
 * **同じ階層で `summary`** を足します（絞り込みチップの件数・#727 の宿題①）。
 * `owner_id` は**案件の担当者**（`projects.assigned_to`）で絞ります（記録者の `user_id` とは別）。
 * `summary` は `due` を無視し、`search`・`user_id`・`owner_id` だけを効かせます —
 * チップはどの区分を選んでいても全区分の件数を出すためです。
 */
router.get('/by-project', async (req, res, next) => {
  try {
    const { page, limit, offset, search } = extractPagination(req);
    const result = await listByProject(
      {
        due: parseDueBucket(req.query.due),
        search,
        userId: (req.query.user_id as string) || undefined,
        // 案件の担当者（projects.assigned_to）。user_id（記録者）とは別の絞り込み
        ownerId: (req.query.owner_id as string) || undefined,
      },
      page, limit, offset,
    );
    res.json({
      ...paginatedResponse(result.rows, result.total, result.page, result.limit),
      summary: result.summary,
    });
  } catch (e) { next(e); }
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

/*
 * 「次にやること」を帯の1行に収める短い一文（migration 190）
 *
 * ⚠️ **`/:id` より前に置くこと**（`/format-status` と同じ理由）。
 * 形は整形のバックフィルと**わざと同じ**にしてある — 2つの待ち行列を
 * 別々の作りにすると、片方だけ直したときに運用が食い違う。
 */
router.get('/short-status', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await shortQueueStats() });
  } catch (e) { next(e); }
});

/** **返事を待たせない**（1行1コール・全案件に効くので `manager`）。整形と同じ決めごと */
router.post('/short-run', requirePermission('sales', 'manager'), async (req, res, next) => {
  try {
    const stats = await shortQueueStats();
    if (!stats.configured) {
      throw new AppError(400, 'AI_NOT_CONFIGURED', 'この環境は AI につないでいないので短くできません');
    }
    if (stats.pending === 0) {
      res.json({ success: true, data: { started: false, pending: 0 }, message: '短くしていない「次にやること」はありません' });
      return;
    }
    const limit = Number(req.body?.limit) || 40;
    res.status(202).json({
      success: true,
      data: { started: true, taking: Math.min(limit, stats.pending), pending: stats.pending },
      message: '裏で短くしています。件数の減りは画面を読み直すと分かります',
    });
    runShortPass({ limit, actorId: req.user!.id })
      .then((r) => console.log('[na-short] pass done:', JSON.stringify(r)))
      .catch((e) => console.error('[na-short] pass failed:', (e as Error).message));
  } catch (e) { next(e); }
});

/** 失敗した行をもう一度対象に戻す（プロンプト・字数を直したあとに使う） */
router.post('/short-reset-failed', requirePermission('sales', 'manager'), async (_req, res, next) => {
  try {
    const reset = await resetShortFailed();
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
    // 直した人を渡す。**AI が整えた行を人が直した差分**の「誰が」に入る（条件2）。
    // `humanReview` は**この経路だけ**が渡す — MCP の `update_activity_log` は
    // 機械の更新なので、渡すと無修正採用率が嘘になる（service 側の注意書き）
    data: await activityLogService.update(
      req.params.id as string, req.body, req.user!.id, {
        humanReview: true,
        /*
         * 次のアクションを**削除**したときの理由（任意・3択＋自由記入）。
         * **必須にしません** — 人に差分の入力を強いると運用が続かない、というのが
         * この製品の決めごとで、理由が無くても `reject` は必ず1行積まれます。
         * 「もう完了した」「案件が停止した」は正常な業務の終わりなので、
         * プロンプト改善の分母からは外せるようにコードで残します。
         */
        nextActionDeleteReason: (req.body?.next_action_delete_reason as string) ?? null,
      },
    ),
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

/*
 * 「この短い一文は違う」— 1件を待ち行列に戻す（migration 190・条件2）。
 *
 * **`editor` で通す**（`format-redo` と同じ。効くのは1行で、`next_action` の
 * 全文は1バイトも触らない）。押した事実は `ai_corrections` に `reject` で残る。
 */
router.post('/:id/short-redo', requirePermission('sales', 'editor'), async (req, res, next) => {
  try {
    await redoShort(req.params.id as string, req.user!.id);
    res.json({
      success: true,
      data: await activityLogService.getById(req.params.id as string),
      message: '短い一文を作り直す順番に戻しました（毎晩 3:10 に自動で作ります）',
    });
  } catch (e) { next(e); }
});

// 次回アクションを完了 (営業ダッシュボードのワンタップ操作)
router.post('/:id/complete-next-action', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await activityLogService.completeNextAction(req.params.id as string) });
});

// 次回アクションを延期 (body: { date: 'YYYY-MM-DD' })
router.post('/:id/postpone-next-action', requirePermission('sales', 'editor'), async (req, res) => {
  // **誰が延ばしたか**まで残す（`ai_corrections.corrected_by`）。
  // 「AI が置いた期限が近すぎた」という差分は、誰が言ったか込みで初めて材料になる
  res.json({
    success: true,
    data: await activityLogService.postponeNextAction(
      req.params.id as string, req.body?.date, req.user!.id,
    ),
  });
});

router.delete('/:id', requirePermission('sales', 'manager'), async (req, res) => {
  await activityLogService.delete(req.params.id as string);
  res.json({ success: true, message: '削除しました' });
});

export default router;
