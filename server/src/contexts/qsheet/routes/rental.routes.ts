// レンタル機材検索（制作技術支援のミニアプリ）の10エンドポイント。
//
// 取得状況（0・0b）・カタログ（1・2）は company/item_id を自然主キーに持つ全案件共通のマスタなので
// `:ownerKey` は不要。予約リスト（3〜8）は案件/番組単位（`:ownerKey`。device-settings と
// 同じ `resolveOwner`/`ownerWhere` を使う）。DBアクセス・集計ロジックは
// `../services/rental.service.ts` に分離し、このファイルは薄く保つ。
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { resolveOwner } from '../device-settings-owner';
import * as svc from '../services/rental.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

const notFound = (res: Response) =>
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '見つかりません' } });

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ============================================================
// 0. 取得状況（クロールの最終取得状況）
// ============================================================
router.get('/sync-status', async (req: Request, res: Response) => {
  const data = await svc.getSyncStatus();
  res.json({ success: true, data });
});

// ============================================================
// 0b. 手動での取得トリガー（rental_scraper_dev に「今すぐ取得」を伝える）
// ============================================================
router.post('/sync-trigger', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const result = await svc.triggerSync(req.user!.id, req.user!.name);
  if (!result.ok) {
    if (result.reason === 'already-running') {
      return res
        .status(409)
        .json({ success: false, error: { code: 'ALREADY_RUNNING', message: '既に取得が進行中です' } });
    }
    return res.status(429).json({
      success: false,
      error: {
        code: 'COOLDOWN',
        message: `直近の取得からまだ間もないため、あと約${result.retryAfterMinutes}分待ってからお試しください`,
      },
    });
  }
  res.status(201).json({ success: true });
});

// ============================================================
// 1. カタログ検索
// ============================================================
router.get('/items', async (req: Request, res: Response) => {
  const data = await svc.searchItems(req.query);
  res.json({ success: true, data });
});

// ============================================================
// 2. 機材詳細
// ============================================================
router.get('/items/:company/:itemId', async (req: Request, res: Response) => {
  const data = await svc.getItemDetail(String(req.params.company), String(req.params.itemId));
  if (!data) return notFound(res);
  res.json({ success: true, data });
});

// ============================================================
// 3. 予約リスト（会社ごとにグループ化）
// ============================================================
router.get('/:ownerKey/reservations', async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey));
  if (!owner) return notFound(res);
  const data = await svc.getReservationGroups(owner);
  res.json({ success: true, data });
});

// ============================================================
// 4. 行を追加
// ============================================================
router.post('/:ownerKey/reservations', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey));
  if (!owner) return notFound(res);

  const { company, itemId, quantity, startDate, endDate } = req.body as Record<string, unknown>;
  if (typeof company !== 'string' || !company.trim()) return badRequest(res, 'company は必須です');
  if (typeof itemId !== 'string' || !itemId.trim()) return badRequest(res, 'itemId は必須です');
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) return badRequest(res, 'quantity は1以上の数値で指定してください');
  if (typeof startDate !== 'string' || !DATE_RE.test(startDate)) return badRequest(res, 'startDate は YYYY-MM-DD 形式で指定してください');
  if (typeof endDate !== 'string' || !DATE_RE.test(endDate)) return badRequest(res, 'endDate は YYYY-MM-DD 形式で指定してください');
  if (endDate < startDate) return badRequest(res, 'endDate は startDate 以降にしてください');

  const line = await svc.addReservationLine(owner, req.user!.id, {
    company,
    itemId,
    quantity: Math.floor(quantity),
    startDate,
    endDate,
  });
  if (!line) return notFound(res);
  res.status(201).json({ success: true, data: line });
});

// ============================================================
// 5. 行を編集
// ============================================================
router.put('/:ownerKey/reservations/:id', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey));
  if (!owner) return notFound(res);

  const { quantity, startDate, endDate } = req.body as Record<string, unknown>;
  const patch: { quantity?: number; startDate?: string; endDate?: string } = {};
  if (quantity !== undefined) {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) return badRequest(res, 'quantity は1以上の数値で指定してください');
    patch.quantity = Math.floor(quantity);
  }
  if (startDate !== undefined) {
    if (typeof startDate !== 'string' || !DATE_RE.test(startDate)) return badRequest(res, 'startDate は YYYY-MM-DD 形式で指定してください');
    patch.startDate = startDate;
  }
  if (endDate !== undefined) {
    if (typeof endDate !== 'string' || !DATE_RE.test(endDate)) return badRequest(res, 'endDate は YYYY-MM-DD 形式で指定してください');
    patch.endDate = endDate;
  }

  const result = await svc.updateReservationLine(owner, String(req.params.id), patch);
  if (result === 'NOT_FOUND') return notFound(res);
  if (result === 'BAD_REQUEST') return badRequest(res, 'endDate は startDate 以降にしてください');
  res.json({ success: true });
});

// ============================================================
// 6. 行を削除（論理削除）
// ============================================================
router.delete('/:ownerKey/reservations/:id', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey));
  if (!owner) return notFound(res);
  const result = await svc.deleteReservationLine(owner, String(req.params.id));
  if (result === 'NOT_FOUND') return notFound(res);
  res.json({ success: true });
});

// ============================================================
// 7. その会社の draft 行を全部 requested にする
// ============================================================
router.post('/:ownerKey/reservations/:company/request', requirePermission('qsheet', 'editor'), async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey));
  if (!owner) return notFound(res);
  const updated = await svc.requestCompanyLines(owner, String(req.params.company));
  res.json({ success: true, data: { updated } });
});

// ============================================================
// 8. 依頼メール文面のひな形
// ============================================================
router.get('/:ownerKey/reservations/:company/mail-draft', async (req: Request, res: Response) => {
  const owner = await resolveOwner(req.user!, String(req.params.ownerKey));
  if (!owner) return notFound(res);
  const draft = await svc.buildMailDraft(owner, String(req.params.company), req.user!.name);
  if (!draft) return notFound(res);
  res.json({ success: true, data: draft });
});

export default router;
