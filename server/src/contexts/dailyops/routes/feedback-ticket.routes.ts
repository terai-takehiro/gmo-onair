import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { feedbackTicketService, TARGET_APPS, PAGES_BY_APP, CATEGORIES, STATUSES } from '../services/feedback-ticket.service';

// 日常業務アプリ (dailyops) — フィードバックチケット API。
// 起票（起こす人=全ユーザー）は reader（=このアプリを開ける人なら誰でも）、
// 対応状況の更新は editor（入ってきた情報の状態遷移などと同じ切り分け）。
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

const router = Router();

// 対象アプリ/画面・機能/種別/対応状況の候補 (画面のプルダウン・絞り込みチップ用)
router.get('/feedback-tickets/meta', ...canRead, async (_req, res) => {
  res.json({ success: true, data: { targetApps: TARGET_APPS, pagesByApp: PAGES_BY_APP, categories: CATEGORIES, statuses: STATUSES } });
});

// 状態ごとの件数 (絞り込みチップ用)
router.get('/feedback-tickets/counts', ...canRead, async (_req, res) => {
  res.json({ success: true, data: await feedbackTicketService.counts() });
});

// 一覧 (?status=&target_app=&category=&search=)
router.get('/feedback-tickets', ...canRead, async (req, res) => {
  const rows = await feedbackTicketService.list({
    status: req.query.status ? String(req.query.status) : undefined,
    target_app: req.query.target_app ? String(req.query.target_app) : undefined,
    category: req.query.category ? String(req.query.category) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  });
  res.json({ success: true, data: rows });
});

// 起票。**全ユーザーが行える**（このアプリを開ける人=全員が対象）
router.post('/feedback-tickets', ...canRead, async (req, res) => {
  const b = req.body ?? {};
  const row = await feedbackTicketService.create({
    title: b.title,
    description: b.description,
    target_app: b.target_app,
    target_page: b.target_page,
    category: b.category,
    reporter_id: req.user!.id,
    reporter_name: req.user!.name,
  });
  res.status(201).json({ success: true, data: row });
});

// 対応状況の更新 (対応中にする/対応済みにする/却下する/対応コメントを付ける)
router.patch('/feedback-tickets/:id/status', ...canEdit, async (req, res) => {
  const b = req.body ?? {};
  const row = await feedbackTicketService.updateStatus(String(req.params.id), {
    status: b.status,
    response_note: b.response_note,
  });
  res.json({ success: true, data: row });
});

export default router;
