import { Router } from 'express';
import { requireAuth, requirePermission, requireAnyPermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { financeDocService, inquiryService } from '../services/inbox.service';
import { handoffDoc, undoHandoff, type HandoffKind } from '../../finance/services/doc-handoff.service';

// 日常業務アプリ (dailyops) — 見積/請求書 + その他問い合わせ の受信箱 API + アラート集計。

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

/**
 * 受け取った書類は**経理も見る**。
 *
 * 中身は 請求書・見積書・注文書 ＋ 金額・締月・支払期日・GLS番号 で、
 * 完全に経理の仕事の道具なのに `dailyops` だけを要求していました。
 * その結果、**請求書が届いているのに支払う側の経理が開けません**でした
 * (実測: budget editor の利用者が 403)。
 *
 * v4 で画面を財務へ移したので、`dailyops` か `budget` のどちらかで通します。
 * **いま見られる人は見られたまま**、経理が見られるようになります。
 */
const docsRead = [requireAuth, requireAnyPermission(['dailyops', 'budget'], 'reader')] as const;
const docsEdit = [requireAuth, requireAnyPermission(['dailyops', 'budget'], 'editor')] as const;

// ── アラート集計 (案件管理ホーム用: 未処理の見積/請求 + 未対応の問い合わせ 件数) ──
router.get('/alerts', ...canRead, async (_req, res) => {
  const [pendingFinanceDocs, unhandledInquiries] = await Promise.all([
    financeDocService.pendingCount(),
    inquiryService.unhandledCount(),
  ]);
  res.json({ success: true, data: { pendingFinanceDocs, unhandledInquiries } });
});

// ── 見積/請求書 ──────────────────────────────
router.get('/finance-docs', ...docsRead, async (req, res) => {
  const rows = await financeDocService.list({
    status: req.query.status ? String(req.query.status) : undefined,
    doc_type: req.query.doc_type ? String(req.query.doc_type) : undefined,
    pendingOnly: req.query.pending === '1' || req.query.pending === 'true',
  });
  res.json({ success: true, data: rows });
});

router.post('/finance-docs', ...docsEdit, async (req, res) => {
  const { row, action } = await financeDocService.create({ ...req.body, source: req.body?.source ?? 'manual', created_by: req.user!.id });
  res.status(action === 'created' ? 201 : 200).json({ success: true, data: row, action });
});

router.put('/finance-docs/:id', ...docsEdit, async (req, res) => {
  // `created_by` は**誰が直したか**として AI の修正差分に残る（会社方針・条件2）
  const row = await financeDocService.update(String(req.params.id), {
    ...req.body, processed_by_user: req.user!.name, created_by: req.user!.id,
  });
  res.json({ success: true, data: row });
});

router.delete('/finance-docs/:id', ...docsEdit, async (req, res) => {
  await financeDocService.remove(String(req.params.id));
  res.json({ success: true, data: { deleted: true } });
});

/**
 * 受け取った書類を台帳（仕入 / 販管費）へ渡す。
 *
 * **これが「処理完了」の中身です。** 以前は状態が変わるだけで台帳に何も作られず、
 * 同じ請求書を2回入力していました（届いた記録 ＋ 台帳の記録）。
 */
router.post('/finance-docs/:id/handoff', ...docsEdit, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const kind = b.kind === 'sga' ? 'sga' : b.kind === 'purchase' ? 'purchase' : null;
  if (!kind) throw new AppError(400, 'VALIDATION_ERROR', '仕入か販管費かを指定してください');

  const result = await handoffDoc(String(req.params.id), {
    kind: kind as HandoffKind,
    amount: Number(b.amount),
    tax_category: typeof b.tax_category === 'string' ? b.tax_category : undefined,
    recognition_date: String(b.recognition_date ?? ''),
    payment_due_date: typeof b.payment_due_date === 'string' ? b.payment_due_date : null,
    description: typeof b.description === 'string' ? b.description : null,
    project_id: typeof b.project_id === 'string' ? b.project_id : null,
    vendor_id: typeof b.vendor_id === 'string' ? b.vendor_id : null,
    vendor_name: typeof b.vendor_name === 'string' ? b.vendor_name : null,
    expense_type: typeof b.expense_type === 'string' ? b.expense_type : null,
  }, req.user!.id);

  res.status(201).json({ success: true, data: result });
});

/** 渡したのを取り消す。**台帳の行は消さない**（経理が直しているかもしれない） */
router.post('/finance-docs/:id/handoff/undo', ...docsEdit, async (req, res) => {
  res.json({ success: true, data: await undoHandoff(String(req.params.id), req.user!.id) });
});

// ── その他問い合わせ ──────────────────────────────
router.get('/inquiries', ...canRead, async (req, res) => {
  const rows = await inquiryService.list({
    importance: req.query.importance ? String(req.query.importance) : undefined,
    state: req.query.state ? String(req.query.state) : undefined,
    tag: req.query.tag ? String(req.query.tag) : undefined,
    unhandledOnly: req.query.unhandled === '1' || req.query.unhandled === 'true',
  });
  res.json({ success: true, data: rows });
});

/** よく使うタグ。**画面で数えない**（絞り込むたびに件数が変わってしまう） */
router.get('/inquiries/tags', ...canRead, async (_req, res) => {
  res.json({ success: true, data: await inquiryService.tagStats() });
});

/**
 * 1件だけ読む。**案件管理からも読む**ので `sales` でも通す。
 *
 * 「案件の受付へ送る」は案件登録モーダル（案件管理アプリ）へ中身を持っていく形なので、
 * 送り先の画面がこれを読みます。`dailyops` だけを要求すると、
 * **営業の人が送られてきた中身を見られません**。
 */
router.get('/inquiries/:id', requireAuth, requireAnyPermission(['dailyops', 'sales'], 'reader'), async (req, res) => {
  const row = await inquiryService.getById(String(req.params.id));
  if (!row) throw new AppError(404, 'NOT_FOUND', '問い合わせが見つかりません');
  res.json({ success: true, data: row });
});

/**
 * 引き合いを1件入れる。
 *
 * **`dailyops` か `sales` のどちらかで通す。** 受付（`/sales/inbox`）は
 * `sales` の画面で、スマホの「電話・その他を貼る」もそこに属します。
 * `dailyops` だけを要求すると**営業の人が自分で聞いた話を入れられません**。
 * 同じ表を読む `GET /inquiries/:id` と `link-project` は大② で既に
 * この2つを見るようにしてあり、**入れる口だけ狭いまま**でした。
 */
router.post('/inquiries', requireAuth, requireAnyPermission(['dailyops', 'sales'], 'editor'), async (req, res) => {
  if (!req.body?.summary) throw new AppError(400, '要約 (summary) は必須です', 'VALIDATION_ERROR');
  const { row, action } = await inquiryService.create({ ...req.body, source: req.body?.source ?? 'manual', created_by: req.user!.id });
  res.status(action === 'created' ? 201 : 200).json({ success: true, data: row, action });
});

router.put('/inquiries/:id', ...canEdit, async (req, res) => {
  const row = await inquiryService.update(String(req.params.id), { ...(req.body ?? {}), created_by: req.user!.id });
  res.json({ success: true, data: row });
});

/**
 * 行き先を動かす（ストックする / 見送りにする / 未仕分けに戻す）。
 *
 * 旧 `POST /inquiries/:id/handle`（対応済みの入切）はここに畳みました。
 * 「対応済み」の1つでは、ストックしたのか見送ったのかチケットにしたのかが
 * 区別できず、**あとで引き直せません**。
 */
router.post('/inquiries/:id/state', ...canEdit, async (req, res) => {
  const row = await inquiryService.setState(String(req.params.id), String(req.body?.state ?? ''), req.user!.name);
  res.json({ success: true, data: row });
});

/** チケットにする = 案件管理のタスクを1本作る */
router.post('/inquiries/:id/ticket', ...canEdit, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const result = await inquiryService.makeTicket(String(req.params.id), {
    title: typeof b.title === 'string' ? b.title : null,
    assigned_to: typeof b.assigned_to === 'string' ? b.assigned_to : null,
    due_at: typeof b.due_at === 'string' ? b.due_at : null,
    description: typeof b.description === 'string' ? b.description : null,
  }, req.user!.id, req.user!.name);
  res.status(result.already ? 200 : 201).json({ success: true, data: result.row, already: result.already, task_id: result.task_id });
});

/**
 * 案件の受付へ送った結果を書き留める。**書くのは案件管理の画面から**なので
 * `sales` でも通す（`dailyops` を持たない営業が案件を作った直後に呼ぶ）。
 */
router.post('/inquiries/:id/link-project', requireAuth, requireAnyPermission(['dailyops', 'sales'], 'editor'), async (req, res) => {
  const projectId = String((req.body ?? {}).project_id ?? '');
  if (!projectId) throw new AppError(400, 'VALIDATION_ERROR', '案件を指定してください');
  const result = await inquiryService.linkProject(String(req.params.id), projectId, req.user!.name);
  res.json({ success: true, data: result.row, already: result.already });
});

router.delete('/inquiries/:id', ...canEdit, async (req, res) => {
  await inquiryService.remove(String(req.params.id));
  res.json({ success: true, data: { deleted: true } });
});

export default router;
