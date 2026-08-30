import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { fetchBundle, fetchProject, SLOTS, Slot, THEMES, Theme, upsertCue } from '../store';

// CGプロジェクト（graphics_projects）の解決・取得と、スロット cue の HTTP 経路。
// 権限は計時・視聴者と同じく qsheet 区画へ統合（graphics.md §1・migration 232 の先例）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// ── owner（案件 or 番組）から CGプロジェクトを get-or-create ──────────
// ownerId は案件なら projects.id / gls_number のどちらでも受け、canonical な id で
// 保存する（device-settings-owner.ts の resolveOwner と同じ作法。GLS 番号と id の
// 2経路から別プロジェクトが生えるのを UNIQUE(owner_type, owner_id) で防ぐため）。
router.post('/projects/resolve', wrap(async (req, res) => {
  const { ownerType, ownerId, name } = (req.body ?? {}) as {
    ownerType?: string; ownerId?: string; name?: string;
  };
  if (ownerType !== 'project' && ownerType !== 'program') {
    throw new AppError(400, 'VALIDATION_ERROR', 'ownerType は project / program のいずれかです');
  }
  const key = String(ownerId ?? '').trim();
  if (!key) throw new AppError(400, 'VALIDATION_ERROR', 'ownerId は必須です');

  // 見つからない・見えないは 404（403 にしない。存在秘匿 — resolveOwner と同じ）
  let canonicalId: string;
  let ownerName: string;
  if (ownerType === 'project') {
    const row = await queryOne(
      `SELECT id, name FROM projects WHERE (id = ? OR gls_number = ?) AND deleted_at IS NULL`,
      [key, key]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    canonicalId = row.id as string;
    ownerName = row.name as string;
  } else {
    const row = await queryOne(
      `SELECT id, name FROM qsheet_programs WHERE id = ? AND deleted_at IS NULL`,
      [key]
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', '番組が見つかりません');
    canonicalId = row.id as string;
    ownerName = row.name as string;
  }

  await execute(
    `INSERT INTO graphics_projects (owner_type, owner_id, name)
     VALUES (?, ?, ?)
     ON CONFLICT (owner_type, owner_id) DO NOTHING`,
    [ownerType, canonicalId, (name ?? '').trim() || ownerName || 'テロップCG']
  );
  const project = await queryOne(
    `SELECT id FROM graphics_projects WHERE owner_type = ? AND owner_id = ?`,
    [ownerType, canonicalId]
  );
  const bundle = await fetchBundle(project!.id as number);
  res.json({ success: true, data: bundle });
}));

// ── プロジェクト一式（project + pages + cues） ─────────────────────
router.get('/projects/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const bundle = id && !isNaN(id) ? await fetchBundle(id) : null;
  if (!bundle) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');
  res.json({ success: true, data: bundle });
}));

// ── プロジェクトの部分更新（いまは theme / name のみ） ─────────────────
router.put('/projects/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const project = id && !isNaN(id) ? await fetchProject(id) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const body = (req.body ?? {}) as { theme?: string; name?: string };
  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.theme !== undefined) {
    if (!THEMES.includes(body.theme as Theme)) {
      throw new AppError(400, 'VALIDATION_ERROR', `theme は ${THEMES.join(' / ')} のいずれかです`);
    }
    sets.push('theme = ?'); params.push(body.theme);
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'name は空にできません');
    sets.push('name = ?'); params.push(name);
  }

  if (sets.length > 0) {
    await execute(
      `UPDATE graphics_projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
      [...params, id]
    );
  }
  const bundle = await fetchBundle(id);

  // テーマ変更は出力画面の見た目が変わるので Socket にも同報する（POST /cue と同じ二重化。
  // 現行の cg:sync 受け手は cues だけを読むが、theme も載せておく — 出力側が拾えるように）
  if (body.theme !== undefined && bundle) {
    const io = req.app.get('io');
    if (io) {
      io.of('/graphics').to(`project:${id}`).emit('cg:sync', {
        cues: bundle.cues, theme: bundle.project.theme, timestamp: Date.now(),
      });
    }
  }

  res.json({ success: true, data: bundle });
}));

// ── スロット cue の upsert（pageId null = クリア）。Socket 不通時の HTTP fallback も兼ねる ──
router.post('/projects/:id/cue', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const project = id && !isNaN(id) ? await fetchProject(id) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const { slot, pageId } = (req.body ?? {}) as { slot?: string; pageId?: number | null };
  if (!SLOTS.includes(slot as Slot)) {
    throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
  }
  const targetPageId = typeof pageId === 'number' ? pageId : null;
  if (targetPageId !== null) {
    const page = await queryOne(
      `SELECT id FROM graphics_pages WHERE id = ? AND project_id = ?`,
      [targetPageId, id]
    );
    if (!page) throw new AppError(404, 'NOT_FOUND', 'ページが見つかりません');
  }

  const cues = await upsertCue(id, slot as Slot, targetPageId);

  // Socket.IO の出力画面へも同報（awards の cues.routes.ts と同じ二重化）
  const io = req.app.get('io');
  if (io) {
    io.of('/graphics').to(`project:${id}`).emit('cg:sync', { cues, timestamp: Date.now() });
  }

  res.json({ success: true, data: { cues } });
}));

export default router;
