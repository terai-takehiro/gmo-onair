import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  fetchCues, fetchProject, fetchTemplate, GraphicsPageLayer, mapPage, nextCallNo,
  normalizePageLayers, PART_KEYS, PROOF_STATES, SLOTS, Slot,
} from '../store';
import { clearVoteTimers, onVoteStateTransition, readVoteStateServer } from '../services/vote-lifecycle.service';

// ページ（graphics_pages）の CRUD。呼出番号は未指定ならスロット別ブロックの
// 最小空き番号を自動採番する（store.ts の SLOT_CALL_BASE）。
//
// 複数部品の組み合わせページ（段6-2 本格拡張・graphics-awards-migration-plan.md §2-2 の6番）:
// テンプレートが `layers`（非空配列）を持つ場合、作成時は各レイヤーの baseFields を
// ベースに body.layerFields[i] を publicFields の範囲だけ上書きして graphics_pages.layers
// に保存する。更新時（PUT）は同じ添字対応で publicFields 外のキーを 400 で拒否する。
// テンプレートを介さない従来の単一部品フローは一切変更しない（後方互換）。

const router = Router();
// 閲覧は reader・作成/更新/削除は editor（documents.routes.ts と同じ作法）
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
router.post('/projects/:id/pages', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const projectId = parseInt(req.params.id as string);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'テロップCGが見つかりません');

  const body = (req.body ?? {}) as {
    slot?: string; partKey?: string; name?: string; fields?: Record<string, unknown>;
    proofState?: string; callNo?: number; sortOrder?: number; templateId?: number | null;
    layerFields?: Record<string, unknown>[];
  };

  // テンプレートから作る（段6-2）: templateId が来たら、partKey/slot はテンプレートの値を
  // 使う（bodyの値より優先）。fields は baseFields をベースに、publicFields に含まれる
  // キーだけ body.fields の値で上書きする — publicFields に無いキーの上書きは無視する
  // （サーバー側で強制。オペレーターが公開されていないフィールドを弄れないことの核）
  let templateId: number | null = null;
  let slot: string | undefined = body.slot;
  let partKey: string | undefined = body.partKey;
  let fields: Record<string, unknown> = body.fields ?? {};
  // 複数部品の組み合わせページ（段6-2 本格拡張）。テンプレートが layers を持つときだけ使う
  let layers: GraphicsPageLayer[] | null = null;
  if (body.templateId !== undefined && body.templateId !== null) {
    const template = await fetchTemplate(body.templateId);
    if (!template || template.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', 'テンプレートが見つかりません');
    }
    templateId = template.id;
    slot = template.slot;
    if (template.layers && template.layers.length > 0) {
      // 各レイヤーの baseFields をベースに、layerFields[i] の値を publicFields の範囲だけ
      // 上書きする（publicFields に無いキーは無視 — 単一部品版と同じ強制ルールをレイヤー単位に）
      layers = template.layers.map((layer, i) => {
        const merged: Record<string, unknown> = { ...layer.baseFields };
        const overrides = body.layerFields?.[i];
        for (const key of layer.publicFields) {
          if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
            merged[key] = overrides[key];
          }
        }
        return { partKey: layer.partKey, fields: merged };
      });
      partKey = layers[0].partKey;
      fields = {};
    } else {
      partKey = template.partKey;
      const merged: Record<string, unknown> = { ...template.baseFields };
      for (const key of template.publicFields) {
        if (body.fields && Object.prototype.hasOwnProperty.call(body.fields, key)) {
          merged[key] = body.fields[key];
        }
      }
      fields = merged;
    }
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
    `INSERT INTO graphics_pages (project_id, call_no, slot, part_key, name, fields, proof_state, sort_order, template_id, layers)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?::jsonb)
     RETURNING *`,
    [projectId, callNo, slot, partKey, name,
     JSON.stringify(fields), proofState, sortOrder, templateId,
     layers ? JSON.stringify(layers) : null]
  );
  res.status(201).json({ success: true, data: mapPage(row!) });
}));

// ── 部分更新 ─────────────────────────────────────────────────────
router.put('/pages/:id', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = id && !isNaN(id)
    ? await queryOne(`SELECT * FROM graphics_pages WHERE id = ?`, [id])
    : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'テロップが見つかりません');
  const projectId = existing.project_id as number;

  const body = (req.body ?? {}) as {
    slot?: string; partKey?: string; name?: string; fields?: Record<string, unknown>;
    proofState?: string; callNo?: number; sortOrder?: number;
    layerFields?: Record<string, unknown>[];
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  let layersChanged = false;

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
    let candidateFields: Record<string, unknown>;
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
      candidateFields = { ...(existing.fields as Record<string, unknown> ?? {}), ...(body.fields ?? {}) };
    } else {
      candidateFields = body.fields ?? {};
    }

    // 投票・クイズ部品（段6-6・段6-7）: voteState の遷移を検知し、締切タイマーの予約・
    // 外部インタラクティブ連携（activate/close/reveal）のフックを回す。openedAt 等の
    // サーバー専用フィールドはここで書き足された値を DB へ保存する（UPDATE 文を打つ前に
    // 呼ぶこと）。外部呼び出しは投げっぱなし（await しない）— PUT のレスポンスを
    // 遅らせない設計は onVoteStateTransition 側で担保している。
    if (existing.part_key === 'vote') {
      const io = req.app.get('io');
      if (io) {
        const prevVoteState = readVoteStateServer(existing.fields as Record<string, unknown> | null | undefined);
        candidateFields = await onVoteStateTransition(io, projectId, id, prevVoteState, candidateFields);
      }
    }

    sets.push('fields = ?::jsonb'); params.push(JSON.stringify(candidateFields));
  }
  if (body.layerFields !== undefined) {
    // 複数部品の組み合わせページ（段6-2 本格拡張）: 既存の layers（非空配列）を持つページ
    // だけが対象。layerFields[i] を layers[i] の publicFields に含まれるキーだけ反映する。
    // 公開されていないキーが1つでも含まれていれば 400（単一部品版と同じ「無視より拒否」）。
    // publicFields はレイヤーが持たないため、作成元テンプレート（template_id）から引く —
    // テンプレートが削除済み（template_id が SET NULL 済み）のページは制約対象外になり、
    // layerFields のキーをそのまま各レイヤーの fields にマージする（単一部品版の
    // 「template_id なしは自由編集」と同じ扱い）。
    const existingLayers = normalizePageLayers(existing.layers);
    if (!existingLayers) {
      throw new AppError(400, 'VALIDATION_ERROR', 'このテロップは複数の種類を組み合わせたものではありません（layerFields は使えません）');
    }
    const template = existing.template_id != null ? await fetchTemplate(existing.template_id as number) : null;
    const templateLayers = template?.layers ?? null;

    const nextLayers: GraphicsPageLayer[] = existingLayers.map((layer, i) => {
      const overrides = body.layerFields?.[i];
      if (!overrides) return layer;
      const publicKeys = templateLayers?.[i] ? new Set(templateLayers[i].publicFields) : null;
      if (publicKeys) {
        const offending = Object.keys(overrides).filter((k) => !publicKeys.has(k));
        if (offending.length > 0) {
          throw new AppError(
            400, 'VALIDATION_ERROR',
            `layerFields[${i}] にテンプレート固定のフィールドを含みます（編集不可: ${offending.join(', ')}）`
          );
        }
      }
      return { partKey: layer.partKey, fields: { ...layer.fields, ...overrides } };
    });
    sets.push('layers = ?::jsonb'); params.push(JSON.stringify(nextLayers));
    layersChanged = true;
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
  if (body.fields !== undefined || layersChanged) {
    const io = req.app.get('io');
    if (io) {
      const cues = await fetchCues(projectId);
      io.of('/graphics').to(`project:${projectId}`).emit('cg:sync', { cues, page, timestamp: Date.now() });
    }
  }

  res.json({ success: true, data: page });
}));

// ── 削除 ─────────────────────────────────────────────────────────
router.delete('/pages/:id', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const existing = id && !isNaN(id)
    ? await queryOne(`SELECT id, project_id FROM graphics_pages WHERE id = ?`, [id])
    : undefined;
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'テロップが見つかりません');
  const projectId = existing.project_id as number;

  // FK の ON DELETE SET NULL に任せると「live のまま絵だけ消える」cue が残るため、
  // 先に cue を明示的に下ろしてから消し、出力画面へ同報する
  await execute(
    `UPDATE graphics_cue_state SET page_id = NULL, is_live = FALSE, updated_at = NOW()
     WHERE page_id = ?`,
    [id]
  );
  // 投票・クイズ部品の予約中タイマー（自動締切・外部締切）が残っていたら止める
  // （段6-6・段6-7。無くてもクラッシュはしないが、消えたページに向けて後から
  // interactiveBridge を呼ぶ・DB を更新しようとする行儀の悪さを避ける）
  clearVoteTimers(id);
  await execute(`DELETE FROM graphics_pages WHERE id = ?`, [id]);

  const io = req.app.get('io');
  if (io) {
    const cues = await fetchCues(projectId);
    io.of('/graphics').to(`project:${projectId}`).emit('cg:sync', { cues, timestamp: Date.now() });
  }
  res.json({ success: true });
}));

export default router;
