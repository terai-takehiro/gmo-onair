import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  fetchProject, fetchRequests, mapRequest,
  PART_KEYS, REQUEST_STATUSES, RequestStatus, SLOTS, Slot,
} from '../store';

// 発注（テロ原）の CRUD。graphics.md §3「発注 → 作画」の入口 —
// ディレクターがスマホから軽い文言だけを投げ、デザイナーがハブの「未作画」列から拾う。
//
// 権限は projects/pages と同じ qsheet 区画だが、**発注の作成だけは reader のまま
// （requirePermission の既定 minLevel）で通す**。ディレクターが編集権限を持たない
// ケースを想定しているため、ここだけ意図的に緩い（他の書き込み系ルートは
// 既存の運用に合わせて reader のまま — qsheet の書き込みは全体的に reader 可）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// ── 作成 ─────────────────────────────────────────────────────────
router.post('/projects/:id/requests', wrap(async (req, res) => {
  const projectId = parseInt(req.params.id as string);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const body = (req.body ?? {}) as {
    title?: string; detail?: string; desiredSlot?: string; desiredPartKey?: string; desiredTiming?: string;
  };
  const title = String(body.title ?? '').trim();
  if (!title) throw new AppError(400, 'VALIDATION_ERROR', 'title は必須です');

  if (body.desiredSlot !== undefined && body.desiredSlot !== null && body.desiredSlot !== '') {
    if (!SLOTS.includes(body.desiredSlot as Slot)) {
      throw new AppError(400, 'VALIDATION_ERROR', `desiredSlot は ${SLOTS.join(' / ')} のいずれかです`);
    }
  }
  if (body.desiredPartKey !== undefined && body.desiredPartKey !== null && body.desiredPartKey !== '') {
    if (!PART_KEYS.includes(body.desiredPartKey as (typeof PART_KEYS)[number])) {
      throw new AppError(400, 'VALIDATION_ERROR', `desiredPartKey は ${PART_KEYS.join(' / ')} のいずれかです`);
    }
  }

  const requestedBy = req.user?.name ?? null;

  const row = await queryOne(
    `INSERT INTO graphics_requests
       (project_id, title, detail, desired_slot, desired_part_key, desired_timing, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [
      projectId,
      title,
      (body.detail ?? '').trim() || null,
      body.desiredSlot || null,
      body.desiredPartKey || null,
      (body.desiredTiming ?? '').trim() || null,
      requestedBy,
    ]
  );
  res.status(201).json({ success: true, data: mapRequest(row!) });
}));

// ── 一覧（既定は未処理＝requested のみ。?status=all で全件） ─────────────
router.get('/projects/:id/requests', wrap(async (req, res) => {
  const projectId = parseInt(req.params.id as string);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const statusParam = req.query.status as string | undefined;
  // 'all' はスマホの発注フォームが「自分が出した発注」（却下・ページ化済みも含む履歴）を
  // 出すための特別値。DB の status 列には存在しない値なので REQUEST_STATUSES には含めない
  if (statusParam === 'all') {
    const requests = await fetchRequests(projectId);
    res.json({ success: true, data: requests });
    return;
  }
  if (statusParam !== undefined && !REQUEST_STATUSES.includes(statusParam as RequestStatus)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status は ${REQUEST_STATUSES.join(' / ')} または all のいずれかです`);
  }
  const requests = await fetchRequests(projectId, statusParam ?? 'requested');
  res.json({ success: true, data: requests });
}));

// ── 部分更新（status の変更・ページ化での紐づけ） ───────────────────
router.put('/requests/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = id && !isNaN(id)
    ? await queryOne(`SELECT * FROM graphics_requests WHERE id = ?`, [id])
    : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '発注が見つかりません');

  const body = (req.body ?? {}) as { status?: string; convertedPageId?: number | null };
  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.status !== undefined) {
    if (!REQUEST_STATUSES.includes(body.status as RequestStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', `status は ${REQUEST_STATUSES.join(' / ')} のいずれかです`);
    }
    sets.push('status = ?'); params.push(body.status);
  }
  if (body.convertedPageId !== undefined) {
    if (body.convertedPageId !== null) {
      const page = await queryOne(
        `SELECT id FROM graphics_pages WHERE id = ? AND project_id = ?`,
        [body.convertedPageId, existing.project_id]
      );
      if (!page) throw new AppError(404, 'NOT_FOUND', 'ページが見つかりません');
    }
    sets.push('converted_page_id = ?'); params.push(body.convertedPageId);
  }
  if (sets.length === 0) {
    res.json({ success: true, data: mapRequest(existing) });
    return;
  }

  sets.push('updated_at = NOW()');
  params.push(id);
  const row = await queryOne(
    `UPDATE graphics_requests SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    params
  );
  res.json({ success: true, data: mapRequest(row!) });
}));

// ── 削除（誤操作の取消用） ────────────────────────────────────────
router.delete('/requests/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = id && !isNaN(id)
    ? await queryOne(`SELECT id FROM graphics_requests WHERE id = ?`, [id])
    : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '発注が見つかりません');

  await execute(`DELETE FROM graphics_requests WHERE id = ?`, [id]);
  res.json({ success: true });
}));

export default router;
