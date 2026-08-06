/**
 * ⑤ 見積・請求（全案件） — 案件をまたいだ一覧
 *
 * ── 案件詳細の見積タブとの違い ──────────────────────────────
 *
 * あちらは「この案件の見積」、こちらは**全案件を横に見て、
 * 返事待ち・入金待ちを取りこぼさない**ための画面です。
 * 数字は同じテーブルから読むので食い違いません。
 *
 * ── 「回」ごとに1行にしない ──────────────────────────────
 *
 * 請求は `revenues` の1行 = 1請求です。按分の親行 (`group_id` が入っている行) は
 * **子行と二重に数えない**よう、他の集計と同じく `group_id IS NULL` で絞ります。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
router.use(requireAuth, requirePermission('sales'));

/** 日付の形。**画面から来た値をそのまま SQL に置かない** */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 見積の一覧。**旧版 (`superseded`) は出しません** — 一覧に出す意味が
 * 「返事待ちを取りこぼさない」なので、差し替え済みの版が並ぶと数が合いません。
 * 版そのものは案件詳細で見られます。
 */
router.get('/estimates', async (req, res) => {
  const mine = req.query.scope === 'mine';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const params: unknown[] = [];
  let where = `WHERE e.deleted_at IS NULL AND e.status <> 'superseded' AND p.deleted_at IS NULL`;

  if (mine) { where += ' AND e.created_by = ?'; params.push(req.user!.id); }
  if (status) {
    // **知らない状態名は素通しさせない** (絞り込んだのに全件返ると気づけない)
    const list = status.split(',').map((s) => s.trim())
      .filter((s) => ['draft', 'sent', 'accepted', 'rejected'].includes(s));
    where += list.length ? ` AND e.status IN (${list.map(() => '?').join(',')})` : ' AND FALSE';
    params.push(...list);
  }

  const rows = await queryAll(
    `SELECT e.id, e.project_id, e.group_id, e.version, e.title, e.status,
            e.subtotal, e.discount, e.sent_at, e.valid_until,
            p.name AS project_name, p.gls_number,
            c.name AS customer_name,
            u.name AS created_by_name
       FROM estimates e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN users u ON u.id = e.created_by
       ${where}
      ORDER BY
        -- 出したまま返事が無いものを先頭に。**期限が近い順**
        CASE e.status WHEN 'sent' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
        e.valid_until ASC NULLS LAST,
        e.updated_at DESC
      LIMIT 300`,
    params,
  );
  res.json({ success: true, data: rows });
});

/**
 * 請求の一覧。**確定 (`confirmed`) だけ**を出します —
 * 見積段階の行を混ぜると請求額の合計が実態より大きくなります
 * (`revenues` を読む多くの箇所が `status` を見ていない、という前例があるので明示)。
 */
router.get('/invoices', async (req, res) => {
  const mine = req.query.scope === 'mine';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const params: unknown[] = [];
  let where = `WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
                 AND r.group_id IS NULL AND p.deleted_at IS NULL`;

  if (mine) { where += ' AND r.assigned_to = ?'; params.push(req.user!.id); }
  if (state === 'unpaid') where += ' AND r.paid_date IS NULL';
  else if (state === 'overdue') where += ` AND r.paid_date IS NULL AND r.payment_due_date < to_char(NOW(), 'YYYY-MM-DD')`;
  else if (state === 'uninspected') where += ' AND r.inspection_date IS NULL';
  else if (state === 'paid') where += ' AND r.paid_date IS NOT NULL';
  else if (state) where += ' AND FALSE';   // 知らない状態は空で返す

  const rows = await queryAll(
    `SELECT r.id, r.project_id, r.episode_id, r.subtitle, r.amount, r.tax_category,
            r.billing_date, r.payment_due_date, r.invoice_issued,
            r.inspection_date, r.paid_date,
            p.name AS project_name, p.gls_number,
            c.name AS customer_name,
            e.episode_code,
            u.name AS assigned_to_name
       FROM revenues r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN episodes e ON e.id = r.episode_id
       LEFT JOIN users u ON u.id = r.assigned_to
       ${where}
      ORDER BY
        -- 入金がまだのものを先頭に。**期日が近い順** (超過が上に来る)
        CASE WHEN r.paid_date IS NULL THEN 0 ELSE 1 END,
        r.payment_due_date ASC NULLS LAST,
        r.billing_date DESC NULLS LAST
      LIMIT 300`,
    params,
  );
  res.json({ success: true, data: rows });
});

/**
 * 検収日・入金日を入れる／消す。
 *
 * **フラグではなく日付**を持たせているので、「済みにする」は日付を入れること、
 * 「取り消す」は `null` を入れることです (`{ inspection_date: null }`)。
 * 渡さなかった項目は触りません — 片方を入れるつもりで
 * もう片方を消してしまう事故を防ぎます。
 */
router.patch('/invoices/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const col of ['inspection_date', 'paid_date'] as const) {
    if (!(col in body)) continue;                       // 渡していない = 触らない
    const v = body[col];
    if (v !== null && !(typeof v === 'string' && YMD.test(v))) {
      throw new AppError(400, 'VALIDATION_ERROR', `${col} は YYYY-MM-DD か null で指定してください`);
    }
    sets.push(`${col} = ?`);
    params.push(v);
  }
  if (sets.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '変更する項目がありません');

  const existing = await queryOne(
    'SELECT id FROM revenues WHERE id = ? AND deleted_at IS NULL', [req.params.id],
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '請求が見つかりません');

  params.push(req.user!.id, req.params.id);
  await execute(
    `UPDATE revenues SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    params,
  );
  res.json({ success: true, data: await queryOne('SELECT * FROM revenues WHERE id = ?', [req.params.id]) });
});

export default router;
