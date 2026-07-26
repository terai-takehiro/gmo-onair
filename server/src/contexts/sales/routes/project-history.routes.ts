/**
 * 案件のコメント (B3) と 変更の記録 (B4) の HTTP 入口
 *
 * 権限は案件と同じ `sales` (読みは reader / 書きは editor)。
 * 「対応した」の記録だけは**自分あてのメンションを片づける操作**なので
 * editor を要求しない — 閲覧のみの人にコメントで知らせることはあり、
 * そのときベルから消せないと詰まる。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { listProjectChanges, projectCommentService } from '../services/project-history.service';

const router = Router();

/** 変更の記録 (主要な項目だけ・新しい順) */
router.get(
  '/:id/changes',
  requireAuth,
  requirePermission('sales', 'reader'),
  async (req, res) => {
    const rows = await listProjectChanges(String(req.params.id));
    res.json({ success: true, data: rows });
  }
);

router.get(
  '/:id/comments',
  requireAuth,
  requirePermission('sales', 'reader'),
  async (req, res) => {
    const rows = await projectCommentService.list(String(req.params.id));
    res.json({ success: true, data: rows });
  }
);

router.post(
  '/:id/comments',
  requireAuth,
  requirePermission('sales', 'editor'),
  async (req, res) => {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'ログインが必要です');
    const body = (req.body ?? {}) as { body?: unknown; mention_user_ids?: unknown };
    if (typeof body.body !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'body は文字列で指定してください');
    }
    const mentions = Array.isArray(body.mention_user_ids)
      ? body.mention_user_ids.filter((v): v is string => typeof v === 'string')
      : [];
    const rows = await projectCommentService.create(String(req.params.id), body.body, mentions, { userId });
    res.status(201).json({ success: true, data: rows });
  }
);

router.delete(
  '/comments/:commentId',
  requireAuth,
  requirePermission('sales', 'editor'),
  async (req, res) => {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'ログインが必要です');
    await projectCommentService.remove(String(req.params.commentId), {
      userId,
      isAdmin: req.user?.role === 'system_admin',
    });
    res.json({ success: true, data: { removed: true } });
  }
);

/** 自分あてのメンションを「対応した」にする (ベルから消える) */
router.post(
  '/comments/:commentId/resolve',
  requireAuth,
  requirePermission('sales', 'reader'),
  async (req, res) => {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'ログインが必要です');
    await projectCommentService.resolveMention(String(req.params.commentId), { userId });
    res.json({ success: true, data: { resolved: true } });
  }
);

export default router;
