import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  fetchCues, fetchProject, mapPage, nextCallNo,
  PART_KEYS, PROOF_STATES, SLOTS, Slot,
} from '../store';

// ページ（graphics_pages）の CRUD。呼出番号は未指定ならスロット別ブロックの
// 最小空き番号を自動採番する（store.ts の SLOT_CALL_BASE）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

async function assertCallNoFree(projectId: number, callNo: number, excludePageId?: number) {
  const dup = await queryOne(
    `SELECT id FROM graphics_pages WHERE project_id = ? AND call_no = ?${excludePageId ? ' AND id <> ?' : ''}`,
    excludePageId ? [projectId, callNo, excludePageId] : [projectId, callNo]
  );
  if (dup) throw new AppError(409, 'CONFLICT', `呼出番号 ${callNo} は既に使われています`);
}

// ── 作成 ─────────────────────────────────────────────────────────
router.post('/projects/:id/pages', wrap(async (req, res) => {
  const projectId = parseInt(req.params.id as string);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const body = (req.body ?? {}) as {
    slot?: string; partKey?: string; name?: string; fields?: Record<string, unknown>;
    proofState?: string; callNo?: number; sortOrder?: number;
  };
  if (!SLOTS.includes(body.slot as Slot)) {
    throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
  }
  if (!PART_KEYS.includes(body.partKey as (typeof PART_KEYS)[number])) {
    throw new AppError(400, 'VALIDATION_ERROR', `partKey は ${PART_KEYS.join(' / ')} のいずれかです`);
  }
  const name = String(body.name ?? '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'name は必須です');
  const proofState = body.proofState ?? 'draft';
  if (!PROOF_STATES.includes(proofState as (typeof PROOF_STATES)[number])) {
    throw new AppError(400, 'VALIDATION_ERROR', `proofState は ${PROOF_STATES.join(' / ')} のいずれかです`);
  }

  let callNo: number;
  if (typeof body.callNo === 'number' && Number.isInteger(body.callNo) && body.callNo > 0) {
    await assertCallNoFree(projectId, body.callNo);
    callNo = body.callNo;
  } else {
    callNo = await nextCallNo(projectId, body.slot as Slot);
  }

  let sortOrder = body.sortOrder;
  if (typeof sortOrder !== 'number') {
    const max = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM graphics_pages WHERE project_id = ?`,
      [projectId]
    );
    sortOrder = ((max?.m as number) ?? 0) + 1;
  }

  const row = await queryOne(
    `INSERT INTO graphics_pages (project_id, call_no, slot, part_key, name, fields, proof_state, sort_order)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?)
     RETURNING *`,
    [projectId, callNo, body.slot, body.partKey, name,
     JSON.stringify(body.fields ?? {}), proofState, sortOrder]
  );
  res.status(201).json({ success: true, data: mapPage(row!) });
}));

// ── 部分更新 ─────────────────────────────────────────────────────
router.put('/pages/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = id && !isNaN(id)
    ? await queryOne(`SELECT * FROM graphics_pages WHERE id = ?`, [id])
    : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ページが見つかりません');
  const projectId = existing.project_id as number;

  const body = (req.body ?? {}) as {
    slot?: string; partKey?: string; name?: string; fields?: Record<string, unknown>;
    proofState?: string; callNo?: number; sortOrder?: number;
  };
  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.slot !== undefined) {
    if (!SLOTS.includes(body.slot as Slot)) {
      throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
    }
    sets.push('slot = ?'); params.push(body.slot);
  }
  if (body.partKey !== undefined) {
    if (!PART_KEYS.includes(body.partKey as (typeof PART_KEYS)[number])) {
      throw new AppError(400, 'VALIDATION_ERROR', `partKey は ${PART_KEYS.join(' / ')} のいずれかです`);
    }
    sets.push('part_key = ?'); params.push(body.partKey);
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'name は空にできません');
    sets.push('name = ?'); params.push(name);
  }
  if (body.fields !== undefined) {
    sets.push('fields = ?::jsonb'); params.push(JSON.stringify(body.fields ?? {}));
  }
  if (body.proofState !== undefined) {
    if (!PROOF_STATES.includes(body.proofState as (typeof PROOF_STATES)[number])) {
      throw new AppError(400, 'VALIDATION_ERROR', `proofState は ${PROOF_STATES.join(' / ')} のいずれかです`);
    }
    sets.push('proof_state = ?'); params.push(body.proofState);
  }
  if (body.callNo !== undefined) {
    if (!Number.isInteger(body.callNo) || (body.callNo as number) <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'callNo は正の整数です');
    }
    await assertCallNoFree(projectId, body.callNo as number, id);
    sets.push('call_no = ?'); params.push(body.callNo);
  }
  if (body.sortOrder !== undefined) {
    sets.push('sort_order = ?'); params.push(body.sortOrder);
  }
  if (sets.length === 0) {
    res.json({ success: true, data: mapPage(existing) });
    return;
  }

  sets.push('updated_at = NOW()');
  params.push(id);
  const row = await queryOne(
    `UPDATE graphics_pages SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    params
  );
  res.json({ success: true, data: mapPage(row!) });
}));

// ── 削除 ─────────────────────────────────────────────────────────
router.delete('/pages/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = id && !isNaN(id)
    ? await queryOne(`SELECT id, project_id FROM graphics_pages WHERE id = ?`, [id])
    : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'ページが見つかりません');
  const projectId = existing.project_id as number;

  // FK の ON DELETE SET NULL に任せると「live のまま絵だけ消える」cue が残るため、
  // 先に cue を明示的に下ろしてから消し、出力画面へ同報する
  await execute(
    `UPDATE graphics_cue_state SET page_id = NULL, is_live = FALSE, updated_at = NOW()
     WHERE page_id = ?`,
    [id]
  );
  await execute(`DELETE FROM graphics_pages WHERE id = ?`, [id]);

  const io = req.app.get('io');
  if (io) {
    const cues = await fetchCues(projectId);
    io.of('/graphics').to(`project:${projectId}`).emit('cg:sync', { cues, timestamp: Date.now() });
  }
  res.json({ success: true });
}));

export default router;
