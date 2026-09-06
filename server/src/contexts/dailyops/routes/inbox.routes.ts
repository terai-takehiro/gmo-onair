import { Router } from 'express';
import { requireAuth, requirePermission, requireAnyPermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { financeDocService, inquiryService } from '../services/inbox.service';
import { handoffDoc, undoHandoff, type HandoffKind } from '../../finance/services/doc-handoff.service';
import {
  listGroups, getGroup, updateGroup, removeGroup, moveDocToGroup, ensureGroup,
} from '../services/finance-doc-chain.service';
import { mailIntakeFolderUrl, MAIL_INTAKE_FOLDER_NAME } from '../../../shared/services/mail-attachment-box.service';

// 日常業務アプリ (dailyops) — 見積/請求書 + その他問い合わせ の受信箱 API + アラート集計。

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

/**
 * 受領書類は**経理も見る**。
 *
 * 中身は 請求書・見積書・注文書 ＋ 金額・締月・支払期日・GLS番号 で、
 * 完全に経理の仕事の道具なのに `dailyops` だけを要求していました。
 * その結果、**請求書が届いているのに支払う側の経理が開けません**でした
 * (実測: budget editor の利用者が 403)。
 *
 * v4 で画面を財務へ移したので、`dailyops` か `sales` のどちらかで通します
 * （`budget` は権限モデル単純化で `sales` に統合された。
 * docs/reviews/permission-model-simplification-plan.md）。
 * **いま見られる人は見られたまま**、経理が見られるようになります。
 */
const docsRead = [requireAuth, requireAnyPermission(['dailyops', 'sales'], 'reader')] as const;
const docsEdit = [requireAuth, requireAnyPermission(['dailyops', 'sales'], 'editor')] as const;
/**
 * **台帳（仕入・販管費）に行を作る操作。** 受領書類を見る・直すのは
 * `dailyops` でよいが、**お金の台帳に書くのは `sales`（旧 `budget`）の
 * 編集権限**が要る（`purchases.routes` / `sga.routes` の作成口はどちらも
 * `sales:editor`）。
 *
 * ⚠️ ここを `docsEdit` のままにすると、**`dailyops` だけの人が
 * 仕入・販管費に直接行を作れます**（台帳側の口は閉まっているのに、こちらから入れる）。
 */
const ledgerWrite = [requireAuth, requirePermission('sales', 'editor')] as const;

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

// ── ひとつづり（見積書 → 発注書 → 請求書）── migration 281 ─────
/**
 * 束の一覧。**中の書類と添付までまとめて返す。**
 *
 * 画面は「1通ずつの行」ではなく「1つの取引」を出します。
 * 別々に取りに行かせると、**書類が3通ある束で N+1 回の往復**になり、
 * しかも取りに行っている間に他の人が処理した書類が混ざります。
 *
 * `pending=1` … まだ片づいていない束だけ（中の書類が全部 登録済/却下 なら片づき）
 */
router.get('/finance-doc-groups', ...docsRead, async (req, res) => {
  const rows = await listGroups({
    pendingOnly: req.query.pending === '1' || req.query.pending === 'true',
    expense_kind: req.query.expense_kind ? String(req.query.expense_kind) : undefined,
  });
  res.json({
    success: true,
    data: rows,
    // 添付の在り処。**画面が「BOX のどこを見ればよいか」を言えるようにする**
    meta: { box_folder_name: MAIL_INTAKE_FOLDER_NAME, box_folder_url: mailIntakeFolderUrl() },
  });
});

router.get('/finance-doc-groups/:id', ...docsRead, async (req, res) => {
  const row = await getGroup(String(req.params.id));
  if (!row) throw new AppError(404, 'NOT_FOUND', 'その束が見つかりません');
  res.json({ success: true, data: row });
});

/** 束を1つ作る（人が手で束ね直すとき） */
router.post('/finance-doc-groups', ...docsEdit, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = String(b.title ?? '').trim();
  if (!title) throw new AppError(400, 'VALIDATION_ERROR', '題名を入れてください');
  const { id, created } = await ensureGroup({
    title,
    vendor_name: typeof b.vendor_name === 'string' ? b.vendor_name : null,
    group_key: typeof b.group_key === 'string' ? b.group_key : null,
    created_by: req.user!.id,
  });
  res.status(created ? 201 : 200).json({ success: true, data: await getGroup(id), created });
});

/**
 * 束を直す（案件の付け替え・販管費への切替・支払サイト・処理月）。
 *
 * ⚠️ **どの案件かは人が決めるもの**（ご指示）。AI が置いた候補をここで上書きすると
 * `project_source='human'` になり、**その差分が `ai_corrections` に入ります**
 * （会社方針「AI を使い捨てにしない」条件2）。
 */
router.put('/finance-doc-groups/:id', ...docsEdit, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const patch: Parameters<typeof updateGroup>[1] = {};
  if (b.title !== undefined) patch.title = String(b.title);
  if (b.vendor_name !== undefined) patch.vendor_name = (b.vendor_name as string | null) ?? null;
  if (b.expense_kind !== undefined) patch.expense_kind = (b.expense_kind as 'purchase' | 'sga' | null) ?? null;
  if (b.project_id !== undefined) patch.project_id = (b.project_id as string | null) ?? null;
  if (b.payment_terms_days !== undefined) {
    patch.payment_terms_days = b.payment_terms_days === null ? null : Number(b.payment_terms_days);
  }
  if (b.processing_month !== undefined) patch.processing_month = (b.processing_month as string | null) ?? null;
  res.json({ success: true, data: await updateGroup(String(req.params.id), patch) });
});

/** 束ごと消す（そもそもゴミだったとき）。**中の書類もまとめて消える** */
router.delete('/finance-doc-groups/:id', ...docsEdit, async (req, res) => {
  await removeGroup(String(req.params.id));
  res.json({ success: true, data: { deleted: true } });
});

/** 書類を別の束へ移す（束ね直し）。**台帳に渡した書類は動かせない** */
router.post('/finance-docs/:id/move-group', ...docsEdit, async (req, res) => {
  const groupId = String((req.body ?? {}).group_id ?? '');
  if (!groupId) throw new AppError(400, 'VALIDATION_ERROR', '移す先の束を指定してください');
  await moveDocToGroup(String(req.params.id), groupId);
  res.json({ success: true, data: await getGroup(groupId) });
});

/**
 * 書類を1件だけ読む（**原文つき**）。
 *
 * 束の一覧は原文を載せません（15秒ごとに取り直す画面が1日中それを運ぶため）。
 * 「メールの原文を見る」を開いたときだけ、ここから1件取りに行きます。
 */
router.get('/finance-docs/:id', ...docsRead, async (req, res) => {
  const row = await financeDocService.getById(String(req.params.id));
  if (!row) throw new AppError(404, 'NOT_FOUND', '書類が見つかりません');
  res.json({ success: true, data: row });
});

/** 添付（BOX に置いた PDF）の一覧。**入らなかったものも理由付きで返す** */
router.get('/finance-docs/:id/attachments', ...docsRead, async (req, res) => {
  res.json({ success: true, data: await financeDocService.attachments(String(req.params.id)) });
});

/**
 * 受領書類を台帳（仕入 / 販管費）へ渡す。
 *
 * **これが「処理完了」の中身です。** 以前は状態が変わるだけで台帳に何も作られず、
 * 同じ請求書を2回入力していました（届いた記録 ＋ 台帳の記録）。
 */
router.post('/finance-docs/:id/handoff', ...ledgerWrite, async (req, res) => {
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
router.post('/finance-docs/:id/handoff/undo', ...ledgerWrite, async (req, res) => {
  res.json({ success: true, data: await undoHandoff(String(req.params.id), req.user!.id) });
});

// ── その他問い合わせ ──────────────────────────────
/**
 * 一覧。**上限つき**（migration 247）。
 *
 * 画面は長らく絞り込み無しで全件を引き、画面側で state ごとに分けていました
 * （タブの件数を出すため）。溜まるほど遅くなるので、
 * **本体は `limit` で引き、件数は `/inquiries/counts` が COUNT で数えます**。
 *
 * - `states=ticket,project,dropped` … 「仕分け済み」タブ（3つまとめて）
 * - `desk=1` … 「今日さばくもの」＝ 未仕分け ＋ 見直しの日が来たストック
 */
router.get('/inquiries', ...canRead, async (req, res) => {
  const states = String(req.query.states ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const rows = await inquiryService.list({
    importance: req.query.importance ? String(req.query.importance) : undefined,
    state: req.query.state ? String(req.query.state) : undefined,
    states: states.length ? states : undefined,
    tag: req.query.tag ? String(req.query.tag) : undefined,
    unhandledOnly: req.query.unhandled === '1' || req.query.unhandled === 'true',
    deskOnly: req.query.desk === '1' || req.query.desk === 'true',
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });
  res.json({ success: true, data: rows });
});

/**
 * タブに出す件数。**一覧とは別に数える**（`shared/tests/countHonesty.test.ts` の形）。
 * 一覧に上限を付けた以上、運んだ行を画面で数えると件数が嘘になります。
 */
router.get('/inquiries/counts', ...canRead, async (_req, res) => {
  res.json({ success: true, data: await inquiryService.counts() });
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
  if (!req.body?.summary) throw new AppError(400, 'VALIDATION_ERROR', '要約 (summary) は必須です');
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
 *
 * ⚠️ **`sales` でも通す。** 案件作成（`/sales/projects/new`）の
 * 「ネタのまま残す」＝ストック／「見送りにする」＝見送り が**この口を叩きます**。
 * `dailyops` の editor だけを要求していたので、**`sales` の editor ＋
 * `dailyops` の reader** という人には**レールに問い合わせのカードが出るのに
 * どちらのボタンも 403**でした（受信箱はその人にカードを返します。実測）。
 * 同じ表を読む `GET /inquiries/:id`・`POST /inquiries`・`link-project` は
 * 同じ理由ですでに2つを見ており、**行き先を動かす口だけ狭いまま**でした。
 */
router.post('/inquiries/:id/state', requireAuth, requireAnyPermission(['dailyops', 'sales'], 'editor'), async (req, res) => {
  /*
    247: ストックには**見直す日**が付く。

    ⚠️ **鍵ごと渡していないときと、`null` を渡したときを分ける。**
    ・鍵が無い（案件作成の「ネタのまま残す」など、この決めごとを知らない呼び手）
      → サーバーが既定の1か月後を入れる
    ・`null`（画面の「決めない」）→ 空のまま。翌日から机に出る
    読めない日付は 400 にせず「決めていない」に落とす
    （落とすと「保存できないので見送りにする」が起きる）。
  */
  const body = (req.body ?? {}) as Record<string, unknown>;
  const hasReview = Object.prototype.hasOwnProperty.call(body, 'stock_review_on');
  const row = await inquiryService.setState(
    String(req.params.id), String(body.state ?? ''), req.user!.name,
    hasReview ? { stockReviewOn: (body.stock_review_on as string | null) ?? null } : {},
  );
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
