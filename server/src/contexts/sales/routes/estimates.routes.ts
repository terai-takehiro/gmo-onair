/**
 * 見積 (v4 ⑥)。`/projects/:projectId/estimates` にぶら下がる。
 *
 * **書き込みは `sales` の editor 以上。** 見積は金額なので、閲覧だけの人が
 * 触れると出した額が変わってしまう。
 */
import { Router, Request, Response, NextFunction } from 'express';
import {
  requireAuth, requirePermission, requireAnyPermission, meetsPermissionLevel,
} from '../../../shared/middleware/auth';
import { estimateService } from '../services/estimate.service';
import { buildEstimatePdf } from '../services/estimate-pdf.service';
import { fileFinanceDocToBox, applyDocBoxHeaders, docBoxSkipped } from '../../../shared/services/doc-box.service';
import { AppError } from '../../../shared/middleware/errorHandler';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router({ mergeParams: true });
router.use(requireAuth, requirePermission('sales'));

const canEdit = requirePermission('sales', 'editor');
const userOf = (req: Request) => (req as { user?: { id: string } }).user!.id;

// GET /projects/:projectId/estimates
router.get('/', wrap(async (req, res) => {
  const { projectId } = req.params as Record<string, string>;
  res.json({ success: true, data: await estimateService.listByProject(projectId) });
}));

// GET /projects/:projectId/estimates/:id — 明細つき
router.get('/:id', wrap(async (req, res) => {
  const est = await estimateService.getById((req.params as Record<string, string>).id);
  if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
  res.json({ success: true, data: est });
}));

/**
 * GET /projects/:projectId/estimates/:id/pdf — 見積書 PDF を発行する
 *
 * ── 「出す」＝「BOX に入る」──────────────────────────────────
 *
 * ご指示どおり、**PDF を出す操作がそのまま発行**です。作った PDF は
 * 社外と共有するフォルダの `01_見積・提案` に置き（`doc-box.service` の表）、
 * 同じものを手元にもダウンロードします。同じ名前は BOX の**新しい版**になるので、
 * 出し直しても行は増えません。
 *
 * ── 読むだけの人でも PDF は出せる ───────────────────────────
 *
 * ダウンロードは `sales` の reader で通します（見積の金額はこの人たちも
 * 画面で見えているので、紙にするだけなら止める理由がない）。
 * **BOX に置くのは editor 以上**にして、入らなかったことを
 * `X-Box-Reason: NO_PERMISSION` で画面に出します —
 * 黙って落とすと「保存されたつもり」になります。
 */
router.get('/:id/pdf', wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const { buffer, filename, projectId } = await buildEstimatePdf(id);

  const user = (req as { user?: { role?: string; permissions?: Record<string, string> } }).user;
  const canStore = meetsPermissionLevel(user?.role, user?.permissions?.sales, 'editor');
  applyDocBoxHeaders(res, canStore
    ? await fileFinanceDocToBox(projectId, 'estimate', filename, buffer)
    : docBoxSkipped('estimate', 'NO_PERMISSION'));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}));

// POST /projects/:projectId/estimates — 新しい見積 (v1)
router.post('/', canEdit, wrap(async (req, res) => {
  const { projectId } = req.params as Record<string, string>;
  const est = await estimateService.create(projectId, req.body, userOf(req));
  res.status(201).json({ success: true, data: est });
}));

// POST /projects/:projectId/estimates/:id/next-version — 前の版を写して版を上げる
router.post('/:id/next-version', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  res.status(201).json({ success: true, data: await estimateService.createNextVersion(id, userOf(req)) });
}));

// PUT /projects/:projectId/estimates/:id
router.put('/:id', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  res.json({ success: true, data: await estimateService.update(id, req.body, userOf(req)) });
}));

// PUT /projects/:projectId/estimates/:id/items — 明細をまとめて置き換える
router.put('/:id/items', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  res.json({ success: true, data: await estimateService.replaceItems(id, items) });
}));

/**
 * POST /projects/:projectId/estimates/:id/approve — 値引き上限を超えた見積を承認する
 *
 * **`canEdit` では守れません。** 承認できるのは「その見積を作った人の役割に
 * 決めた承認者」だけで、それは編集権限とは別の話（同じ営業担当どうしで
 * 承認し合えたら上限に意味がない）。判定はサービス側が持ちます。
 */
router.post('/:id/approve', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  res.json({ success: true, data: await estimateService.approve(id, userOf(req)) });
}));

// DELETE /projects/:projectId/estimates/:id
router.delete('/:id', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  await estimateService.remove(id, userOf(req));
  res.json({ success: true });
}));

/**
 * POST /projects/:projectId/estimates/:id/convert-to-revenue
 * — 受注が決まった見積を売上・請求 (`revenues`) に登録する。
 *
 * **`sales` か `budget` のどちらかの editor で通す**（`billing.routes.ts` と同じ考え方）。
 * 案件管理から確定させる担当者と、売上を扱う経理の両方が押せる必要がある。
 */
router.post('/:id/convert-to-revenue', requireAnyPermission(['sales', 'budget'], 'editor'), wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  res.status(201).json({ success: true, data: await estimateService.convertToRevenue(id, userOf(req)) });
}));

export default router;
