import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  applyCueTake, bumpRevealPhase, fetchBundle, fetchProject, SLOTS, Slot, SlotExitRule, THEMES, Theme,
} from '../store';

// CGプロジェクト（graphics_projects）の解決・取得と、スロット cue の HTTP 経路。
// 権限は計時・視聴者と同じく qsheet 区画へ統合（graphics.md §1・migration 232 の先例）。
// 閲覧は reader・作成/編集は editor・送出（cue）は liveops の本番操作と同じ manager
// （書き込みを reader に開けない — documents.routes.ts / display-templates.routes.ts の作法）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// ── slotExitRules のバリデーション（段6-4。migration 252） ─────────────
// 形は [{ whenSlot, autoOutSlots: [] }]。whenSlot/autoOutSlots は SLOTS の値のみ・
// whenSlot は autoOutSlots に自分自身を含めない（自分を自動OUTするルールは無意味で、
// 見た目のTAKEと同時に自分自身が消えるという分かりにくい挙動になるため弾く）。
function validateSlotExitRules(input: unknown): SlotExitRule[] {
  if (!Array.isArray(input)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'slotExitRules は配列です');
  }
  return input.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      throw new AppError(400, 'VALIDATION_ERROR', `slotExitRules[${i}] の形が不正です`);
    }
    const whenSlot = (raw as Record<string, unknown>).whenSlot;
    const autoOutSlots = (raw as Record<string, unknown>).autoOutSlots;
    if (!SLOTS.includes(whenSlot as Slot)) {
      throw new AppError(400, 'VALIDATION_ERROR', `slotExitRules[${i}].whenSlot は ${SLOTS.join(' / ')} のいずれかです`);
    }
    if (!Array.isArray(autoOutSlots) || autoOutSlots.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `slotExitRules[${i}].autoOutSlots は1件以上の配列です`);
    }
    const cleaned = autoOutSlots.map((s, j) => {
      if (!SLOTS.includes(s as Slot)) {
        throw new AppError(400, 'VALIDATION_ERROR', `slotExitRules[${i}].autoOutSlots[${j}] は ${SLOTS.join(' / ')} のいずれかです`);
      }
      return s as Slot;
    });
    if (cleaned.includes(whenSlot as Slot)) {
      throw new AppError(400, 'VALIDATION_ERROR', `slotExitRules[${i}]: whenSlot 自身を autoOutSlots に含めることはできません`);
    }
    return { whenSlot: whenSlot as Slot, autoOutSlots: cleaned };
  });
}

// ── owner（案件 or 番組）から CGプロジェクトを get-or-create ──────────
// ownerId は案件なら projects.id / gls_number のどちらでも受け、canonical な id で
// 保存する（device-settings-owner.ts の resolveOwner と同じ作法。GLS 番号と id の
// 2経路から別プロジェクトが生えるのを UNIQUE(owner_type, owner_id) で防ぐため）。
router.post('/projects/resolve', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
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
      `SELECT id, name FROM projects
        WHERE deleted_at IS NULL
          AND (id = ? OR gls_number = ?
               OR id = (SELECT project_id FROM project_numbers WHERE number = ?))`,
      [key, key, key]
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

// ── プロジェクト一覧（軽量版。④「前の番組からコピー」のピッカー専用） ─────────
// テーマ・スロット退出ルール等の重い列は含めない——一覧のピッカーが名前と更新日時しか
// 使わないため。閲覧のみで書き込まないので editor は要らない（router.use の
// requirePermission('qsheet') = reader をそのまま継承する。GET /projects/:id と同じ作法）。
router.get('/projects', wrap(async (req, res) => {
  const excludeIdRaw = parseInt(req.query.excludeId as string);
  const excludeId = Number.isFinite(excludeIdRaw) ? excludeIdRaw : null;

  const params: unknown[] = [];
  if (excludeId !== null) params.push(excludeId);
  const rows = await queryAll(
    `SELECT id, name, owner_type, owner_id, updated_at FROM graphics_projects
     ${excludeId !== null ? 'WHERE id != ?' : ''}
     ORDER BY updated_at DESC
     LIMIT 30`,
    params
  );
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      ownerType: r.owner_type as string,
      ownerId: r.owner_id as string,
      updatedAt: r.updated_at,
    })),
  });
}));

// ── プロジェクト一式（project + pages + cues） ─────────────────────
router.get('/projects/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const bundle = id && !isNaN(id) ? await fetchBundle(id) : null;
  if (!bundle) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');
  res.json({ success: true, data: bundle });
}));

// ── プロジェクトの部分更新（theme / name / slotExitRules / followScript） ─────
router.put('/projects/:id', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const project = id && !isNaN(id) ? await fetchProject(id) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const body = (req.body ?? {}) as {
    theme?: string; name?: string; slotExitRules?: unknown; followScript?: boolean;
  };
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
  if (body.slotExitRules !== undefined) {
    const rules = validateSlotExitRules(body.slotExitRules);
    sets.push('slot_exit_rules = ?::jsonb'); params.push(JSON.stringify(rules));
  }
  // 台本に追従（段E・migration 283）。既定 false・番組ごとに ON にできるだけの
  // 単純なスイッチ——theme/name と同じ「来ていれば上書き」のパターン
  if (body.followScript !== undefined) {
    sets.push('follow_script = ?'); params.push(!!body.followScript);
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
router.post('/projects/:id/cue', requirePermission('qsheet', 'manager'), wrap(async (req, res) => {
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

  // 段6-4: TAKE 時はスロット間自動退出ルール（slot_exit_rules）も同じトランザクションで
  // 適用する。1回のTAKEで複数スロットが切り替わっても cg:sync の同報は1回にまとめる
  const { cues, autoOutSlots } = await applyCueTake(id, slot as Slot, targetPageId);

  // Socket.IO の出力画面へも同報（awards の cues.routes.ts と同じ二重化）
  const io = req.app.get('io');
  if (io) {
    io.of('/graphics').to(`project:${id}`).emit('cg:sync', { cues, autoOutSlots, timestamp: Date.now() });
  }

  res.json({ success: true, data: { cues, autoOutSlots } });
}));

// ── 「続き」（段6-1・汎用機構）: 対象スロットの cue の reveal_phase を +1 する ──
// docs/design/v4/graphics.md §4 の5動詞のうち唯一未実装だったもの。上限や意味は
// ここでは決め打ちしない（部品側が「もう増えない」を判断する）。
router.post('/projects/:id/cue/continue', requirePermission('qsheet', 'manager'), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const project = id && !isNaN(id) ? await fetchProject(id) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'CGプロジェクトが見つかりません');

  const { slot } = (req.body ?? {}) as { slot?: string };
  if (!SLOTS.includes(slot as Slot)) {
    throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
  }

  const cues = await bumpRevealPhase(id, slot as Slot);

  // Socket.IO の出力画面へも同報（POST …/cue と同じ二重化。cg:sync 受け手は cues を
  // 丸ごと差し替えるだけでよく、reveal_phase もその中に乗って届く）
  const io = req.app.get('io');
  if (io) {
    io.of('/graphics').to(`project:${id}`).emit('cg:sync', { cues, timestamp: Date.now() });
  }

  res.json({ success: true, data: { cues } });
}));

export default router;
