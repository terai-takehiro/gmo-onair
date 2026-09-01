import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  fetchProject, fetchTemplates, mapTemplate,
  MAX_TEMPLATE_LAYERS, PART_KEYS, SLOTS, Slot,
} from '../store';

// テンプレート（graphics_templates）の CRUD。段6-2の最初の一段——
// 「1部品ぶんの設定プリセット＋公開フィールドの絞り込み」。docs/design/v4/graphics.md §2。
// 段6-2 本格拡張（graphics-awards-migration-plan.md §2-2 の6番）で `layers`（複数部品を
// 1画面に重ねる組み合わせ）を追加した——非空配列が来たら各要素に単一部品版と同じ検証
// （partKey・baseFields・publicFields⊆baseFields）を適用する。null/空配列は従来どおり
// 単一部品テンプレートとして扱う（後方互換）。
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

interface LayerInput { partKey?: string; baseFields?: unknown; publicFields?: unknown }

/**
 * `layers`（段6-2 本格拡張・複数部品の組み合わせ）の検証。各要素に単一部品版と同じ
 * partKey/baseFields/publicFields の検証を適用し、要素数を 1〜MAX_TEMPLATE_LAYERS に制限する。
 * 空配列を渡した場合は「layersを使わない」＝nullとして扱う（呼び出し側でnull判定する）。
 */
function validateLayers(raw: unknown): { partKey: string; baseFields: Record<string, unknown>; publicFields: string[] }[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'layers は配列です');
  }
  if (raw.length === 0) return null;
  if (raw.length > MAX_TEMPLATE_LAYERS) {
    throw new AppError(400, 'VALIDATION_ERROR', `layers は最大 ${MAX_TEMPLATE_LAYERS} 個までです`);
  }
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new AppError(400, 'VALIDATION_ERROR', `layers[${i}] はオブジェクトです`);
    }
    const layer = item as LayerInput;
    if (!PART_KEYS.includes(layer.partKey as (typeof PART_KEYS)[number])) {
      throw new AppError(400, 'VALIDATION_ERROR', `layers[${i}].partKey は ${PART_KEYS.join(' / ')} のいずれかです`);
    }
    const baseFields = validateBaseFields(layer.baseFields);
    const publicFields = validatePublicFields(layer.publicFields ?? [], baseFields);
    return { partKey: layer.partKey as string, baseFields, publicFields };
  });
}

// ── 作成 ─────────────────────────────────────────────────────────
router.post('/projects/:id/templates', wrap(async (req, res) => {
  const projectId = parseInt(req.params.id as string);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const body = (req.body ?? {}) as {
    partKey?: string; slot?: string; name?: string; description?: string;
    baseFields?: unknown; publicFields?: unknown; layers?: unknown;
  };
  if (!SLOTS.includes(body.slot as Slot)) {
    throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
  }
  const name = String(body.name ?? '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'name は必須です');

  // 複数部品の組み合わせテンプレート（段6-2 本格拡張）: layers が非空配列で来たら
  // 各要素を検証し、部品全体を代表する part_key（DB列は NOT NULL）には
  // layers[0].partKey を入れる。単一部品版の partKey/baseFields/publicFields は
  // このとき無視してよい契約（クライアント側は送ってこない想定だが、来ても捨てる）
  const layers = validateLayers(body.layers);
  let partKey: string;
  let baseFields: Record<string, unknown>;
  let publicFields: string[];
  if (layers) {
    // 一覧表示用の代表値として layers[0] と同じ値を top-level 列にも入れておく
    // （client-techops の `GraphicsTemplateInput` の規約に合わせる）
    partKey = layers[0].partKey;
    baseFields = layers[0].baseFields;
    publicFields = layers[0].publicFields;
  } else {
    if (!PART_KEYS.includes(body.partKey as (typeof PART_KEYS)[number])) {
      throw new AppError(400, 'VALIDATION_ERROR', `partKey は ${PART_KEYS.join(' / ')} のいずれかです`);
    }
    partKey = body.partKey as string;
    baseFields = validateBaseFields(body.baseFields);
    publicFields = validatePublicFields(body.publicFields ?? [], baseFields);
  }

  const row = await queryOne(
    `INSERT INTO graphics_templates (project_id, part_key, slot, name, description, base_fields, public_fields, layers)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb)
     RETURNING *`,
    [
      projectId, partKey, body.slot, name,
      (body.description ?? '').trim() || null,
      JSON.stringify(baseFields), JSON.stringify(publicFields),
      layers ? JSON.stringify(layers) : null,
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
    baseFields?: unknown; publicFields?: unknown; layers?: unknown;
  };
  const sets: string[] = [];
  const params: unknown[] = [];

  // layers（段6-2 本格拡張）を先に処理する — 非空配列が来たら part_key/base_fields/
  // public_fields は layers[0] の値で上書きする（body.partKey 等が別途来ていてもこちらを
  // 優先。一覧表示用の「代表値」を最新に保つため）。body.layers === [] は
  // 「単一部品モードへ戻す」（layers を NULL にする）明示的な指定として扱う。
  let layersHandled = false;
  if (body.layers !== undefined) {
    const layers = validateLayers(body.layers);
    sets.push('layers = ?::jsonb'); params.push(layers ? JSON.stringify(layers) : null);
    if (layers) {
      sets.push('part_key = ?'); params.push(layers[0].partKey);
      sets.push('base_fields = ?::jsonb'); params.push(JSON.stringify(layers[0].baseFields));
      sets.push('public_fields = ?::jsonb'); params.push(JSON.stringify(layers[0].publicFields));
      layersHandled = true;
    }
  }

  if (body.partKey !== undefined && !layersHandled) {
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
  // キーが消えていた」を防ぐため）。layers 側で既にこれらの列を書いたときは二重に
  // SET しない（layersHandled のときは上の layers[0] の値が正）
  if (!layersHandled && (body.baseFields !== undefined || body.publicFields !== undefined)) {
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
