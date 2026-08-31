import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  fetchProject, fetchTemplates, mapTemplate,
  PART_KEYS, SLOTS, Slot,
} from '../store';

// テンプレート（graphics_templates）の CRUD。段6-2の最初の一段——
// 「1部品ぶんの設定プリセット＋公開フィールドの絞り込み」。docs/design/v4/graphics.md §2。
//
// ページ作成・更新側（POST /projects/:id/pages・PUT /pages/:id）が publicFields に
// 無いキーの上書きを拒否する実装は pages.routes.ts 側にある（このファイルはテンプレート
// そのものの CRUD のみ）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

/**
 * publicFields が baseFields のキーの部分集合であることを検証する（§「公開フィールド以外は
 * オペレーターから触れない」の土台。存在しないキーを公開指定したら400 — サーバー側の穴を
 * 作らないため、ここで弾く）。
 */
function validatePublicFields(publicFields: unknown, baseFields: Record<string, unknown>): string[] {
  if (!Array.isArray(publicFields)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'publicFields は配列です');
  }
  const baseKeys = new Set(Object.keys(baseFields ?? {}));
  return publicFields.map((key, i) => {
    if (typeof key !== 'string' || !key) {
      throw new AppError(400, 'VALIDATION_ERROR', `publicFields[${i}] は空でない文字列です`);
    }
    if (!baseKeys.has(key)) {
      throw new AppError(400, 'VALIDATION_ERROR', `publicFields[${i}]（${key}）は baseFields に存在しないキーです`);
    }
    return key;
  });
}

function validateBaseFields(baseFields: unknown): Record<string, unknown> {
  if (baseFields === undefined || baseFields === null) return {};
  if (typeof baseFields !== 'object' || Array.isArray(baseFields)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'baseFields はオブジェクトです');
  }
  return baseFields as Record<string, unknown>;
}

// ── 作成 ─────────────────────────────────────────────────────────
router.post('/projects/:id/templates', wrap(async (req, res) => {
  const projectId = parseInt(req.params.id as string);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const body = (req.body ?? {}) as {
    partKey?: string; slot?: string; name?: string; description?: string;
    baseFields?: unknown; publicFields?: unknown;
  };
  if (!PART_KEYS.includes(body.partKey as (typeof PART_KEYS)[number])) {
    throw new AppError(400, 'VALIDATION_ERROR', `partKey は ${PART_KEYS.join(' / ')} のいずれかです`);
  }
  if (!SLOTS.includes(body.slot as Slot)) {
    throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
  }
  const name = String(body.name ?? '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'name は必須です');

  const baseFields = validateBaseFields(body.baseFields);
  const publicFields = validatePublicFields(body.publicFields ?? [], baseFields);

  const row = await queryOne(
    `INSERT INTO graphics_templates (project_id, part_key, slot, name, description, base_fields, public_fields)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
     RETURNING *`,
    [
      projectId, body.partKey, body.slot, name,
      (body.description ?? '').trim() || null,
      JSON.stringify(baseFields), JSON.stringify(publicFields),
    ]
  );
  res.status(201).json({ success: true, data: mapTemplate(row!) });
}));

// ── 一覧 ─────────────────────────────────────────────────────────
router.get('/projects/:id/templates', wrap(async (req, res) => {
  const projectId = parseInt(req.params.id as string);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const templates = await fetchTemplates(projectId);
  res.json({ success: true, data: templates });
}));

// ── 部分更新 ─────────────────────────────────────────────────────
router.put('/templates/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = id && !isNaN(id)
    ? await queryOne(`SELECT * FROM graphics_templates WHERE id = ?`, [id])
    : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つかりません');

  const body = (req.body ?? {}) as {
    partKey?: string; slot?: string; name?: string; description?: string | null;
    baseFields?: unknown; publicFields?: unknown;
  };
  const sets: string[] = [];
  const params: unknown[] = [];

  if (body.partKey !== undefined) {
    if (!PART_KEYS.includes(body.partKey as (typeof PART_KEYS)[number])) {
      throw new AppError(400, 'VALIDATION_ERROR', `partKey は ${PART_KEYS.join(' / ')} のいずれかです`);
    }
    sets.push('part_key = ?'); params.push(body.partKey);
  }
  if (body.slot !== undefined) {
    if (!SLOTS.includes(body.slot as Slot)) {
      throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
    }
    sets.push('slot = ?'); params.push(body.slot);
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'name は空にできません');
    sets.push('name = ?'); params.push(name);
  }
  if (body.description !== undefined) {
    sets.push('description = ?'); params.push((body.description ?? '').toString().trim() || null);
  }

  // baseFields / publicFields は互いの整合を見るため、どちらか一方だけが来たときも
  // 既存値と合わせて両方を再検証する（「baseFieldsだけ変えたらpublicFieldsが指す
  // キーが消えていた」を防ぐため）
  if (body.baseFields !== undefined || body.publicFields !== undefined) {
    const baseFields = body.baseFields !== undefined
      ? validateBaseFields(body.baseFields)
      : ((existing.base_fields ?? {}) as Record<string, unknown>);
    const publicFieldsInput = body.publicFields !== undefined
      ? body.publicFields
      : (existing.public_fields ?? []);
    const publicFields = validatePublicFields(publicFieldsInput, baseFields);
    if (body.baseFields !== undefined) {
      sets.push('base_fields = ?::jsonb'); params.push(JSON.stringify(baseFields));
    }
    sets.push('public_fields = ?::jsonb'); params.push(JSON.stringify(publicFields));
  }

  if (sets.length === 0) {
    res.json({ success: true, data: mapTemplate(existing) });
    return;
  }

  sets.push('updated_at = NOW()');
  params.push(id);
  const row = await queryOne(
    `UPDATE graphics_templates SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    params
  );
  res.json({ success: true, data: mapTemplate(row!) });
}));

// ── 削除（graphics_pages.template_id は ON DELETE SET NULL で自動的にNULLへ） ──
router.delete('/templates/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = id && !isNaN(id)
    ? await queryOne(`SELECT id FROM graphics_templates WHERE id = ?`, [id])
    : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つかりません');

  await execute(`DELETE FROM graphics_templates WHERE id = ?`, [id]);
  res.json({ success: true });
}));

export default router;
