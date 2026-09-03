/**
 * 見積 (v4 ⑥)。`/projects/:projectId/estimates` にぶら下がる。
 *
 * **書き込みは `sales` の editor 以上。** 見積は金額なので、閲覧だけの人が
 * 触れると出した額が変わってしまう。
 */
import { Router, Request, Response, NextFunction } from 'express';
import {
  requireAuth, requirePermission, meetsPermissionLevel,
} from '../../../shared/middleware/auth';
import { estimateService, withCanApprove } from '../services/estimate.service';
import { buildEstimatePdf } from '../services/estimate-pdf.service';
import { fileFinanceDocToBox, applyDocBoxHeaders, docBoxSkipped } from '../../../shared/services/doc-box.service';
import { AppError } from '../../../shared/middleware/errorHandler';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router({ mergeParams: true });
/**
 * POST /projects/:projectId/estimates/:id/convert-to-revenue
 * — 受注が決まった見積を売上・請求 (`revenues`) に登録する。
 *
 * 以前は `sales` と `budget` を別区画にして `requireAnyPermission` で
 * 両方を通していたが、全体ゲート（下の `sales` 要求）より前に置いていたため
 * **`budget` だけの人はそこに到達できない**事故があった（レビューでの指摘 #87
 * — 書いてあるのに効かない、いちばん気づけない形）。権限モデル単純化で
 * `budget` は `sales` に統合されたため、この種のゲート順の事故自体が
 * 起きなくなった（docs/reviews/permission-model-simplification-plan.md）。
 */
router.post('/:id/convert-to-revenue',
  requireAuth, requirePermission('sales', 'editor'),
  wrap(async (req, res) => {
    const { id } = req.params as Record<string, string>;
    res.status(201).json({ success: true, data: await estimateService.convertToRevenue(id, userOf(req)) });
  }));

router.use(requireAuth, requirePermission('sales'));

const canEdit = requirePermission('sales', 'editor');
const userOf = (req: Request) => (req as { user?: { id: string } }).user!.id;

/**
 * 承認の口（`POST /:id/approve`）が要求するもの。**承認できるかの判定に混ぜます** —
 * 承認者に決められていても、**`sales` の編集権限が無ければ押した先は 403** です。
 * 認証がすでに読んだ `req.user.permissions` を使う（引き直すと答えが2つになる）。
 */
const canEditSales = (req: Request) => meetsPermissionLevel(
  req.user?.role, req.user?.permissions?.sales, 'editor',
);

// GET /projects/:projectId/estimates
// ?include_archived=1 でアーカイブした版も含める（既定は除く。画面の「アーカイブした版を表示」）
router.get('/', wrap(async (req, res) => {
  const { projectId } = req.params as Record<string, string>;
  const rows = await estimateService.listByProject(projectId, req.query.include_archived === '1');
  // **「あなたは承認できるか」をサーバーが決めて渡す。** 画面はこれを見て
  // 「承認する」を出す（押して 403 にしないため）
  res.json({ success: true, data: await withCanApprove(rows, userOf(req), canEditSales(req)) });
}));

// GET /projects/:projectId/estimates/:id — 明細つき
router.get('/:id', wrap(async (req, res) => {
  const est = await estimateService.getById((req.params as Record<string, string>).id);
  if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
  res.json({ success: true, data: (await withCanApprove([est], userOf(req), canEditSales(req)))[0] });
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
  const { buffer, filename, projectId, approvalState } = await buildEstimatePdf(id);

  const user = (req as { user?: { role?: string; permissions?: Record<string, string> } }).user;
  const canStore = meetsPermissionLevel(user?.role, user?.permissions?.sales, 'editor');
  /*
   * ⚠️ **承認待ちの見積は社外フォルダに置きません**（レビューでの指摘 #102）。
   *
   * 値引きが上限を超えた見積は**お客様に出せない**決めごと（お金のルール ⑤）なのに、
   * 行き先は**社外と共有するフォルダ**（`01_見積・提案`）です。置いた時点で
   * 相手から見えるので、**送付を止めている意味が消えます**。
   *
   * **紙にするのは止めません** — 承認を頼む相手に見せるのに要ります。
   * 入らなかったことは `X-Box-Reason: NOT_APPROVED` で画面に出ます
   * （黙って落とすと「保存されたつもり」になる）。
   */
  const pending = approvalState === 'pending';
  applyDocBoxHeaders(res, pending
    ? docBoxSkipped('estimate', 'NOT_APPROVED')
    : canStore
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

/**
 * POST /projects/:projectId/estimates/:id/duplicate-to-episodes
 * — 明細を写して、**別の回（の組）**向けの新しい見積 (v1) をつくる（仕様変更 #18・#20）。
 *
 * `next-version`（同じ回の書き直し）とは別の口。`episode_ids`（body・配列）は
 * 1件以上必須 — 「案件全体の見積」として複製したいだけなら「次の版をつくる」ではなく
 * 通常の「見積をつくる」（`POST /`）を使えばよいため、ここでは省略を許さない。
 * 1件で送れば従来どおり「別の回1つに複製」、複数件で送れば「複数回のひとまとまり」になる。
 */
router.post('/:id/duplicate-to-episodes', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const episodeIds = Array.isArray(req.body?.episode_ids)
    ? req.body.episode_ids.map((v: unknown) => String(v)).filter(Boolean)
    : [];
  if (episodeIds.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '複製先の回を選んでください');
  res.status(201).json({ success: true, data: await estimateService.duplicateToEpisodes(id, episodeIds, userOf(req)) });
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
 * POST /projects/:projectId/estimates/:id/archive — 一覧から隠す（消さない）
 * POST /projects/:projectId/estimates/:id/unarchive — 一覧に戻す
 *
 * `status` は一切変えない（アーカイブは一覧に出すかどうかだけの直交した印。
 * migration 236）。**送付済み・受注済みの版もアーカイブできる** — 「もう見ない版を
 * 隠したい」だけの操作で、記録を直すものではないため `canEdit` 止まりでよい。
 */
router.post('/:id/archive', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  res.json({ success: true, data: await estimateService.archive(id, userOf(req)) });
}));

router.post('/:id/unarchive', canEdit, wrap(async (req, res) => {
  const { id } = req.params as Record<string, string>;
  res.json({ success: true, data: await estimateService.unarchive(id, userOf(req)) });
}));

export default router;
