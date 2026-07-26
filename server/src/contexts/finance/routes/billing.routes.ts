/**
 * 請求のしごと (デザイン 31章 31a) の HTTP 口
 *
 * お金の中の仕事なので `budget` 権限。読みは reader、記録は editor。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import {
  getBillingWork, markIssued, unmarkIssued, markPaid, unmarkPaid,
  markInspected, createDunningAction,
} from '../services/billing-work.service';

const router = Router();
router.use(requireAuth, requirePermission('budget'));

const uid = (req: any) => String(req.user?.id ?? '');

// GET /billing?month=YYYY-MM — 3つのタブ + 月次運用をまとめて返す
router.get('/', async (req, res) => {
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  res.json({ success: true, data: await getBillingWork(month) });
});

// POST /billing/issue — 選んだぶんを「請求書を出した」と記録する
router.post('/issue', requirePermission('budget', 'editor'), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  res.json({ success: true, data: await markIssued(ids, uid(req)) });
});

// POST /billing/:id/unissue — 発行を取り消す (番号は残す)
router.post('/:id/unissue', requirePermission('budget', 'editor'), async (req, res) => {
  await unmarkIssued(String(req.params.id), uid(req));
  res.json({ success: true });
});

// POST /billing/:id/paid — 入金を記録する
router.post('/:id/paid', requirePermission('budget', 'editor'), async (req, res) => {
  const data = await markPaid(String(req.params.id), uid(req), {
    paid_at: req.body?.paid_at ?? null,
    amount: req.body?.amount ?? null,
  });
  res.json({ success: true, data });
});

// POST /billing/:id/unpaid — 入金の記録を外す
router.post('/:id/unpaid', requirePermission('budget', 'editor'), async (req, res) => {
  await unmarkPaid(String(req.params.id), uid(req));
  res.json({ success: true });
});

// POST /billing/:id/inspected — 検収書を出したと記録する
router.post('/:id/inspected', requirePermission('budget', 'editor'), async (req, res) => {
  await markInspected(String(req.params.id), uid(req));
  res.json({ success: true });
});

// POST /billing/:id/dun — 催促する (次にやることを立てるだけ。ONAiR は送らない)
router.post('/:id/dun', requirePermission('budget', 'editor'), async (req, res) => {
  res.json({ success: true, data: await createDunningAction(String(req.params.id), uid(req)) });
});

export default router;
