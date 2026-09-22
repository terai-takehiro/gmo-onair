import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { fetchProject } from '../store';
import {
  commitQsheetImport, fetchQsheetLiveText, previewQsheetImport, QsheetImportItemInput,
} from '../services/qsheet-import.service';

// 進行台本（Qシート）からの取り込み（段C）。docs/design/v4/graphics-redesign.md
// §9「進行台本との連携」1〜2番。roster.routes.ts と同じ2段構え（preview は
// 保存しないので reader 可・commit はページを量産するので editor）だが、
// 取り込み元がこのプロジェクトの外（別テーブルの qsheet_documents）にあるぶん、
// 台本そのものへのアクセス権チェック（canAccessDoc）がサービス層に追加で入る
// ——qsheet の reader/editor 権限を持っているだけで「共有されていない他人の台本」の
// 中身が読める抜け道を作らないため（qsheet-import.service.ts 冒頭コメント参照）。

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

async function requireProject(idParam: string) {
  const projectId = parseInt(idParam);
  const project = projectId && !isNaN(projectId) ? await fetchProject(projectId) : null;
  if (!project) throw new AppError(404, 'NOT_FOUND', 'テロップCGが見つかりません');
  return projectId;
}

// ── プレビュー（台本を選ぶ → 取り込み候補を見る。保存しないので reader 可） ─────────
router.get('/projects/:id/qsheet-import/preview', wrap(async (req, res) => {
  await requireProject(req.params.id as string);

  const qsheetDocId = req.query.qsheetDocId;
  if (typeof qsheetDocId !== 'string' || !qsheetDocId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'qsheetDocId は必須です');
  }

  const result = await previewQsheetImport(req.user!, qsheetDocId);
  res.json({ success: true, data: result });
}));

// ── 投入（選んだ候補をページとして一括作成。ページを量産するので editor） ──────────
router.post('/projects/:id/qsheet-import/commit', requirePermission('qsheet', 'editor'), wrap(async (req, res) => {
  const projectId = await requireProject(req.params.id as string);

  const body = (req.body ?? {}) as { qsheetDocId?: unknown; items?: unknown };
  if (typeof body.qsheetDocId !== 'string' || !body.qsheetDocId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'qsheetDocId は必須です');
  }
  if (!Array.isArray(body.items)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'items は配列です');
  }

  const created = await commitQsheetImport(
    req.user!, projectId, body.qsheetDocId, body.items as QsheetImportItemInput[]
  );
  res.json({ success: true, data: created });
}));

// ── 台本のいまの文言（①の「台本と違います」バッジの差分判定に使う） ────────────
router.get('/projects/:id/qsheet-live-text', wrap(async (req, res) => {
  const projectId = await requireProject(req.params.id as string);
  const result = await fetchQsheetLiveText(req.user!, projectId);
  res.json({ success: true, data: result });
}));

export default router;
