import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { securityCardService, SECURITY_AREAS, STUDIOS } from '../services/security-card.service';

// 日常業務アプリ (dailyops) — スタジオ セキュリティカード管理 API。
// 一覧/参照は reader、貸出・返却・カード編集は editor。
// 貸出対応者 (lent_by) は既定でログイン中の ONAiR ユーザー (明示指定も可)。

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

// エリア定義 + 拠点一覧 (クライアントの列見出し・拠点セレクト用)
router.get('/security-cards/meta', ...canRead, async (_req, res) => {
  res.json({ success: true, data: { areas: SECURITY_AREAS, studios: STUDIOS } });
});

// カード状況サマリー (ホームのバッジ用)
router.get('/security-cards/stats', ...canRead, async (req, res) => {
  const stats = await securityCardService.stats(req.query.studio ? String(req.query.studio) : undefined);
  res.json({ success: true, data: stats });
});

// 貸出履歴 (?card_id=&status=&from=&to=&studio=)
router.get('/security-cards/lendings', ...canRead, async (req, res) => {
  const rows = await securityCardService.listLendings({
    card_id: req.query.card_id ? String(req.query.card_id) : undefined,
    status: req.query.status === 'active' ? 'active' : req.query.status === 'returned' ? 'returned' : undefined,
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    studio: req.query.studio ? String(req.query.studio) : undefined,
  });
  res.json({ success: true, data: rows });
});

// カード一覧 (?studio=&status=available|lent&search=)
router.get('/security-cards', ...canRead, async (req, res) => {
  const rows = await securityCardService.listCards({
    studio: req.query.studio ? String(req.query.studio) : undefined,
    status: req.query.status === 'available' ? 'available' : req.query.status === 'lent' ? 'lent' : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  });
  res.json({ success: true, data: rows });
});

// カード詳細 (+貸出履歴)
router.get('/security-cards/:id', ...canRead, async (req, res) => {
  const row = await securityCardService.getCard(String(req.params.id));
  if (!row) throw new AppError(404, 'セキュリティカードが見つかりません', 'NOT_FOUND');
  res.json({ success: true, data: row });
});

// カードの軽微な編集 (表示名/メモ/運用有効フラグ)
router.put('/security-cards/:id', ...canEdit, async (req, res) => {
  const row = await securityCardService.updateCard(String(req.params.id), {
    label: req.body?.label,
    notes: req.body?.notes,
    is_active: req.body?.is_active,
  });
  res.json({ success: true, data: row });
});

// 貸出。lent_by は既定でログインユーザー (body で明示指定も可)
router.post('/security-cards/:id/lend', ...canEdit, async (req, res) => {
  const b = req.body ?? {};
  const row = await securityCardService.lend(String(req.params.id), {
    borrower_company: b.borrower_company,
    borrower_person: b.borrower_person,
    borrower_contact: b.borrower_contact,
    purpose: b.purpose,
    lent_on: b.lent_on,
    due_on: b.due_on,
    lent_by_user_id: b.lent_by_user_id ?? req.user!.id,
    lent_by_name: b.lent_by_name ?? req.user!.name,
    notes: b.notes,
    created_by: req.user!.id,
  });
  res.status(201).json({ success: true, data: row });
});

// 返却。returned_by は既定でログインユーザー
router.post('/security-cards/:id/return', ...canEdit, async (req, res) => {
  const b = req.body ?? {};
  const row = await securityCardService.returnCard(String(req.params.id), {
    returned_on: b.returned_on,
    returned_by_user_id: b.returned_by_user_id ?? req.user!.id,
    returned_by_name: b.returned_by_name ?? req.user!.name,
    notes: b.notes,
  });
  res.json({ success: true, data: row });
});

export default router;
