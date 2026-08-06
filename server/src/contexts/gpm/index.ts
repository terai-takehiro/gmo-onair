/**
 * プロジェクト管理（GPM）の API (migration 161)
 *
 * マウントは `/api/v1/internal/gpm/*`。権限モジュールは `gpm`。
 *
 * **`gpm` を `UserListPage` の PERM_MODULES と `auth.routes` の MODULES に
 * 足してから**このルーターを守ること。逆順だと system_admin 以外の全員が 403 になり、
 * 画面から権限を付けることもできなくなる（`apps.ts` は前から `gpm` を宣言していたのに、
 * この2つに入っておらず**誰にも付与できない状態**だった）。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../shared/middleware/auth';
import { templateService, projectService, openItemService, phaseService } from './services/gpm.service';

export function createGpmRoutes(): Router {
  const router = Router();
  const canRead = [requireAuth, requirePermission('gpm', 'reader')] as const;
  const canEdit = [requireAuth, requirePermission('gpm', 'editor')] as const;
  const canManage = [requireAuth, requirePermission('gpm', 'manager')] as const;

  // ── 標準工程テンプレート ────────────────────────────────
  router.get('/templates', ...canRead, async (_req, res) => {
    res.json({ success: true, data: await templateService.list() });
  });
  router.post('/templates', ...canEdit, async (req, res) => {
    res.status(201).json({ success: true, data: await templateService.create(req.body ?? {}, req.user!.id) });
  });
  router.put('/templates/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await templateService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  // **消すのは manager。** 適用中のプロジェクトがあっても消せてしまうので、
  // 誤って消したときの影響が大きい（写して使う作りなので既存には影響しないが、
  // 次に作る人が同じ工程を組み直すことになる）
  router.delete('/templates/:id', ...canManage, async (req, res) => {
    await templateService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  // ── プロジェクト ────────────────────────────────────────
  router.get('/projects', ...canRead, async (req, res) => {
    res.json({
      success: true,
      data: await projectService.list({
        status: req.query.status ? String(req.query.status) : undefined,
        kind: req.query.kind ? String(req.query.kind) : undefined,
        q: req.query.q ? String(req.query.q) : undefined,
      }),
    });
  });
  router.get('/projects/:id', ...canRead, async (req, res) => {
    const row = await projectService.getById(String(req.params.id));
    if (!row) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'プロジェクトが見つかりません' } }); return; }
    res.json({ success: true, data: row });
  });
  router.post('/projects', ...canEdit, async (req, res) => {
    res.status(201).json({ success: true, data: await projectService.create(req.body ?? {}, req.user!.id) });
  });
  router.put('/projects/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await projectService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  router.delete('/projects/:id', ...canManage, async (req, res) => {
    await projectService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  // ── 工程 ────────────────────────────────────────────────
  router.put('/phases/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await phaseService.update(String(req.params.id), req.body ?? {}) });
  });

  // ── 未確認事項 ──────────────────────────────────────────
  // **プロジェクトをまたいで引ける**のがこの表を作った理由
  // （議事録の JSONB では「いま何件止まっているか」を数えられない）
  router.get('/open-items', ...canRead, async (req, res) => {
    res.json({
      success: true,
      data: await openItemService.listAll({ status: req.query.status ? String(req.query.status) : undefined }),
    });
  });
  router.post('/projects/:id/open-items', ...canEdit, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await openItemService.create(String(req.params.id), req.body ?? {}, req.user!.id),
    });
  });
  router.put('/open-items/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await openItemService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  router.delete('/open-items/:id', ...canEdit, async (req, res) => {
    await openItemService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  return router;
}
