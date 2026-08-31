import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  fetchCues, fetchProject, fetchTemplate, mapPage, nextCallNo,
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
    proofState?: string; callNo?: number; sortOrder?: number; templateId?: number | null;
  };

  // テンプレートから作る（段6-2）: templateId が来たら、partKey/slot はテンプレートの値を
  // 使う（bodyの値より優先）。fields は baseFields をベースに、publicFields に含まれる
  // キーだけ body.fields の値で上書きする — publicFields に無いキーの上書きは無視する
  // （サーバー側で強制。オペレーターが公開されていないフィールドを弄れないことの核）
  let templateId: number | null = null;
  let slot: string | undefined = body.slot;
  let partKey: string | undefined = body.partKey;
  let fields: Record<string, unknown> = body.fields ?? {};
  if (body.templateId !== undefined && body.templateId !== null) {
    const template = await fetchTemplate(body.templateId);
    if (!template || template.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つかりません');
    }
    templateId = template.id;
    slot = template.slot;
    partKey = template.partKey;
    const merged: Record<string, unknown> = { ...template.baseFields };
    for (const key of template.publicFields) {
      if (body.fields && Object.prototype.hasOwnProperty.call(body.fields, key)) {
        merged[key] = body.fields[key];
      }
    }
    fields = merged;
  }

  if (!SLOTS.includes(slot as Slot)) {
    throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
  }
  if (!PART_KEYS.includes(partKey as (typeof PART_KEYS)[number])) {
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
    callNo = await nextCallNo(projectId, slot as Slot);
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
    `INSERT INTO graphics_pages (project_id, call_no, slot, part_key, name, fields, proof_state, sort_order, template_id)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
     RETURNING *`,
    [projectId, callNo, slot, partKey, name,
     JSON.stringify(fields), proofState, sortOrder, templateId]
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
    // テンプレートから作られたページ（template_id あり）は、publicFields に無いキーの
    // 更新を拒否する（400）— 無視より明示的なエラーの方が事故に気づきやすい。
    // オペレーターが公開されていないフィールドを弄れないことをAPIレベルで保証するのが核。
    // 通常のページ（template_id なし）は従来どおり body.fields で丸ごと置き換える。
    // テンプレート付きページは body.fields を「publicFields の差分」として扱い、
    // 既存の fields に**マージ**する（クライアントは編集可能な公開フィールドだけを
    // 送る前提 — ロックされたフィールドの値を毎回送り直させない・誤って上書きさせない）
    if (existing.template_id != null) {
      const template = await fetchTemplate(existing.template_id as number);
      const publicKeys = new Set(template?.publicFields ?? []);
      const offending = Object.keys(body.fields ?? {}).filter((k) => !publicKeys.has(k));
      if (offending.length > 0) {
        throw new AppError(
          400, 'VALIDATION_ERROR',
          `このページはテンプレート固定のフィールドを含みます（編集不可: ${offending.join(', ')}）`
        );
      }
      const merged = { ...(existing.fields as Record<string, unknown> ?? {}), ...(body.fields ?? {}) };
      sets.push('fields = ?::jsonb'); params.push(JSON.stringify(merged));
    } else {
      sets.push('fields = ?::jsonb'); params.push(JSON.stringify(body.fields ?? {}));
    }
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
  const page = mapPage(row!);

  // fields（スコアの±など）の更新は出力画面・送出コンソールへ即時反映する必要がある
  // （PUT /projects/:id の theme 同報と同じ二重化。§ 送出コンソールの±ボタンの要件）。
  // page-only の更新でも `cg:sync` の形（cues 必須）は崩さず、page を上乗せするだけにする
  if (body.fields !== undefined) {
    const io = req.app.get('io');
    if (io) {
      const cues = await fetchCues(projectId);
      io.of('/graphics').to(`project:${projectId}`).emit('cg:sync', { cues, page, timestamp: Date.now() });
    }
  }

  res.json({ success: true, data: page });
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
