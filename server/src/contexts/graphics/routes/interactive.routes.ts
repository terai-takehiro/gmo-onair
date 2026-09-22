import { Router, Request, Response, NextFunction } from 'express';
import { execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { fetchProject, fetchProjectInteractiveLinkFull, toInteractiveLinkView } from '../store';
import { assertSafeHttpsUrl } from '../../../shared/security/safe-remote-url';
import type { InteractiveLink } from '../services/interactive-bridge.service';

// テロップCG — 外部インタラクティブ連携（別 VPS interactive.gmo-onair.jp）の設定 API（段6-7）。
// 旧 awards の `quizzes.routes.ts`「連携設定 (URL/APIキー/対象イベント)」節と同じ設計
// （`apiKeySecret` はレスポンスに一切含めない・PUT は新規/更新の両方を担う）を、
// event 単位（awards_events）から project 単位（graphics_projects・migration 258）へ
// そのまま踏襲する。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// ── 連携設定の取得（APIキーはマスクして返す） ─────────────────────────
router.get('/projects/:id/interactive-link', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const project = id && !isNaN(id) ? await fetchProject(id) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'テロップCGが見つかりません');

  const link = await fetchProjectInteractiveLinkFull(id);
  const view = toInteractiveLinkView(link);
  res.json({ success: true, data: view ? { configured: true, ...view } : { configured: false } });
}));

// ── 連携設定の保存（新規/更新とも同じエンドポイント） ───────────────────
router.put('/projects/:id/interactive-link', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const project = id && !isNaN(id) ? await fetchProject(id) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'テロップCGが見つかりません');

  const body = (req.body ?? {}) as {
    baseUrl?: unknown; apiKeySecret?: unknown; interactiveEventId?: unknown;
    closeBufferSeconds?: unknown; autoControl?: unknown;
  };
  const baseUrl = String(body.baseUrl ?? '').trim();
  const apiKeySecret = String(body.apiKeySecret ?? '').trim();
  const interactiveEventId = String(body.interactiveEventId ?? '').trim();
  if (!baseUrl || !apiKeySecret || !interactiveEventId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'baseUrl / apiKeySecret / interactiveEventId は必須です');
  }
  // SSRF 対策（ICS の SEC-01 と同じ守り・shared/security/safe-remote-url.ts）:
  // サーバーがこの URL へ fetch するので、https 以外・ループバック/プライベート宛は保存させない
  try {
    assertSafeHttpsUrl(baseUrl);
  } catch (e) {
    throw new AppError(400, 'VALIDATION_ERROR', `baseUrl: ${(e as Error).message}`);
  }

  let closeBufferSeconds = 0;
  if (body.closeBufferSeconds !== undefined) {
    const n = Number(body.closeBufferSeconds);
    if (!Number.isFinite(n) || n < 0 || n > 120) {
      throw new AppError(400, 'VALIDATION_ERROR', 'closeBufferSeconds は 0〜120 の数値です');
    }
    closeBufferSeconds = Math.floor(n);
  }
  const autoControl = body.autoControl !== undefined ? !!body.autoControl : true;

  const link: InteractiveLink = {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKeyPrefix: apiKeySecret.slice(0, 12),
    apiKeySecret,
    interactiveEventId,
    closeBufferSeconds,
    autoControl,
  };
  await execute(
    `UPDATE graphics_projects SET interactive_link = ?::jsonb, updated_at = NOW() WHERE id = ?`,
    [JSON.stringify(link), id],
  );

  res.json({
    success: true,
    data: {
      configured: true,
      baseUrl: link.baseUrl,
      apiKeyPrefix: link.apiKeyPrefix,
      interactiveEventId: link.interactiveEventId,
      closeBufferSeconds,
      autoControl,
    },
  });
}));

// ── 連携解除 ────────────────────────────────────────────────────
router.delete('/projects/:id/interactive-link', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const project = id && !isNaN(id) ? await fetchProject(id) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'テロップCGが見つかりません');

  await execute(`UPDATE graphics_projects SET interactive_link = NULL, updated_at = NOW() WHERE id = ?`, [id]);
  res.json({ success: true });
}));

export default router;
