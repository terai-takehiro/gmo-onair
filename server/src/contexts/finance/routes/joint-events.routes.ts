/**
 * 合同案件 (デザイン 32章 40a/40b) の HTTP 口
 *
 * 入口は「お金 ＞ 合同案件」なので `budget` 権限。31章の請求のしごとと同じ。
 * 読みは reader、記録は editor。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import {
  listJointEvents, getJointEvent, createJointEvent, updateJointEvent,
  absorbDifference, issueInvoices, cancelCompany, listCompanyChoices,
} from '../services/joint-event.service';

const router = Router();
router.use(requireAuth, requirePermission('budget'));

const uid = (req: any) => String(req.user?.id ?? '');

router.get('/', async (_req, res) => {
  res.json({ success: true, data: await listJointEvents() });
});

// 会社を選ぶための候補。顧客の一覧は sales 権限なので経理では読めない (だからここに置く)。
// `/:id` より前に置くこと (後ろだと id='companies' として拾われる)。
router.get('/companies', async (_req, res) => {
  res.json({ success: true, data: await listCompanyChoices() });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await getJointEvent(String(req.params.id)) });
});

// 会社を選ぶ → その社数ぶんの案件が自動でできる
router.post('/', requirePermission('budget', 'editor'), async (req, res) => {
  res.status(201).json({ success: true, data: await createJointEvent(req.body ?? {}, uid(req)) });
});

// 総額 / 分け方 / あまりの行き先 / 各社の金額・割合・請求先
router.put('/:id', requirePermission('budget', 'editor'), async (req, res) => {
  res.json({ success: true, data: await updateJointEvent(String(req.params.id), req.body ?? {}, uid(req)) });
});

// 1社だけ直したあとの差額の始末 (残りの社で割り直す / 幹事に寄せる)
router.post('/:id/absorb', requirePermission('budget', 'editor'), async (req, res) => {
  const how = req.body?.how === 'organizer' ? 'organizer' : 'others';
  res.json({
    success: true,
    data: await absorbDifference(String(req.params.id), String(req.body?.company_id ?? ''), how, uid(req)),
  });
});

// 参加社数ぶんの請求書をまとめて出す (合計が総額に合わないうちは1枚も出さない)
router.post('/:id/issue', requirePermission('budget', 'editor'), async (req, res) => {
  res.json({ success: true, data: await issueInvoices(String(req.params.id), uid(req)) });
});

// 1社を外す (出した請求書は消さず、取り消しの請求書を1枚出す)
router.post('/:id/companies/:companyId/cancel', requirePermission('budget', 'editor'), async (req, res) => {
  const how = ['others', 'organizer', 'none'].includes(req.body?.redistribute)
    ? req.body.redistribute : 'others';
  res.json({
    success: true,
    data: await cancelCompany(String(req.params.id), String(req.params.companyId), { redistribute: how }, uid(req)),
  });
});

export default router;
