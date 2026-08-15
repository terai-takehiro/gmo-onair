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
import { withCanApprove } from '../services/estimate.service';
import { requireAuth, requireAnyPermission } from '../../../shared/middleware/auth';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { assignInvoiceNumbers } from '../../finance/services/invoice-number.service';

const router = Router();

/**
 * **`sales` か `budget` のどちらかがあれば通す。**
 *
 * 同じ請求を2つの入口から扱います:
 *   案件管理 ⑤ 見積・請求  … 案件をまたいで取りこぼさない (`sales`)
 *   財務   ② 請求・入金   … 月次の締めを一括でやる (`budget`)
 *
 * `sales` だけを要求していたので、**経理だけの人は月次の締めができません**でした。
 */
router.use(requireAuth, requireAnyPermission(['sales', 'budget']));
const canEdit = requireAnyPermission(['sales', 'budget'], 'editor');

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
  // **`gls_category = 'A'` を必ず付ける。** `estimates` にはプロジェクト（GLS-B）の
  // 見積も入るので、外すと案件管理の見積・請求一覧にプロジェクトの見積が並ぶ
  // （migration 179 より前は `e.gpm_project_id IS NULL` が同じ役目をしていた）
  let where = `WHERE e.deleted_at IS NULL AND p.gls_category = 'A' AND e.status <> 'superseded' AND p.deleted_at IS NULL`;

  if (mine) { where += ' AND e.created_by = ?'; params.push(req.user!.id); }
  // **承認待ちだけを見る。** 承認する人は案件を1件ずつ開いて回れないので、
  // ここから探せる必要がある（`?approval=pending`）
  if (req.query.approval === 'pending') where += " AND e.approval_state = 'pending'";
  if (status) {
    // **知らない状態名は素通しさせない** (絞り込んだのに全件返ると気づけない)
    const list = status.split(',').map((s) => s.trim())
      .filter((s) => ['draft', 'sent', 'accepted', 'rejected'].includes(s));
    where += list.length ? ` AND e.status IN (${list.map(() => '?').join(',')})` : ' AND FALSE';
    params.push(...list);
  }

  const rows = await queryAll(
    `SELECT e.id, e.project_id, e.group_id, e.version, e.title, e.status,
            e.subtotal, e.discount, e.sent_at, e.valid_until, e.approval_state,
            p.name AS project_name, p.gls_number,
            c.name AS customer_name,
            u.name AS created_by_name
       FROM estimates e
       -- 案件の見積だけ。estimates にはプロジェクト管理 (GPM) の見積も入る
       -- (migration 173)。内部結合で自然に落ちるが、偶然そうなっている状態に
       -- 頼らず where で明示する (左結合に直した瞬間に GPM の見積が混ざる)
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
  // 「あなたは承認できるか」をサーバーが決めて渡す（押して 403 にしない）
  res.json({ success: true, data: await withCanApprove(rows as never[], req.user!.id) });
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
            r.billing_date, r.payment_due_date, r.invoice_issued, r.invoice_no,
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
router.patch('/invoices/:id', canEdit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const col of ['inspection_date', 'paid_date', 'billing_date'] as const) {
    if (!(col in body)) continue;                       // 渡していない = 触らない
    const v = body[col];
    if (v !== null && !(typeof v === 'string' && YMD.test(v))) {
      throw new AppError(400, 'VALIDATION_ERROR', `${col} は YYYY-MM-DD か null で指定してください`);
    }
    sets.push(`${col} = ?`);
    params.push(v);
  }
  // 請求書を出したか。**日付ではなく真偽値**なので別に扱う
  // (`billing_date` は「いつ出す予定か」で、出したかどうかとは別の列)
  if ('invoice_issued' in body) {
    sets.push('invoice_issued = ?');
    params.push(body.invoice_issued === true);
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

  // **請求書を出した瞬間に番号を採る** (migration 163)。
  // すでに番号があれば飛ばすので、取り消して出し直しても番号は変わらない
  if ('invoice_issued' in body && body.invoice_issued === true) {
    await assignInvoiceNumbers([String(req.params.id)]);
  }

  res.json({ success: true, data: await queryOne('SELECT * FROM revenues WHERE id = ?', [req.params.id]) });
});


// ══════════════════════════════════════════════════════════
// ② 請求・入金（財務） — 月次の締めを一括でやる
//
// ⑤ 見積・請求が「案件をまたいで取りこぼさない」ための一覧なのに対して、
// こちらは**締め月を決めて、その月ぶんをまとめて処理する**ための画面です。
// 書き込む列は同じ (`invoice_issued` / `paid_date` / `inspection_date`) で、
// **同じ `PATCH /invoices/:id` と同じ検査**を通します。
// ══════════════════════════════════════════════════════════

/** `YYYY-MM`。締め月 */
const YM = /^\d{4}-\d{2}$/;

/**
 * 締め月の3つの束。**1本のリクエストで返す** —
 * 3本に分けるとタブを切り替えるたびに数字が後から差し替わります。
 *
 * ・issue   請求書を出す … まだ出していない
 * ・collect 入金の確認   … 出したが入金が無い
 * ・inspect 検収書を出す … 検収日が無い
 *
 * **申込書 (`projects.application_form`) が無い案件は `blocked` を立てます。**
 * 出せないわけではなく、**選べない**ようにするための印です
 * (モックの「申込書が揃っていない案件は選べません」)。
 */
router.get('/closing', async (req, res) => {
  const month = typeof req.query.month === 'string' && YM.test(req.query.month)
    ? req.query.month
    : new Date().toISOString().slice(0, 7);

  const rows = await queryAll(
    `SELECT r.id, r.project_id, r.amount, r.tax_category,
            r.recognition_date, r.billing_date, r.payment_due_date,
            r.invoice_issued, r.invoice_no, r.inspection_date, r.paid_date,
            p.name AS project_name, p.gls_number,
            -- 申込書が揃っていない案件は選ばせない (0 = 未提出)
            (COALESCE(p.application_form, 0) = 0) AS blocked,
            c.name AS customer_name,
            e.episode_code
       FROM revenues r
       JOIN projects p ON p.id = r.project_id
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN episodes e ON e.id = r.episode_id
      WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
        AND r.group_id IS NULL AND p.deleted_at IS NULL
        AND r.recognition_date LIKE ?
      ORDER BY p.gls_number ASC NULLS LAST, r.amount DESC`,
    [`${month}-%`],
  );

  type Row = Record<string, unknown> & {
    invoice_issued: boolean; paid_date: string | null; inspection_date: string | null;
  };
  const all = rows as Row[];
  const issue = all.filter((r) => !r.invoice_issued);
  const collect = all.filter((r) => r.invoice_issued && !r.paid_date);
  const inspect = all.filter((r) => !r.inspection_date);

  const today = new Date().toISOString().slice(0, 10);
  res.json({
    success: true,
    data: { month, issue, collect, inspect },
    counts: {
      issue: issue.length,
      collect: collect.length,
      inspect: inspect.length,
      // 出せない (申込書が無い) もの。**「出していない」とは別に数える**
      blocked: issue.filter((r) => r.blocked).length,
      // 期日を過ぎた入金待ち
      overdue: collect.filter((r) => {
        const due = r.payment_due_date as string | null;
        return !!due && due < today;
      }).length,
    },
  });
});

/**
 * まとめて記録する（月次の締め）。
 *
 * **1件ずつと同じ検査を通します** — 別に書くと片方だけ緩くなります。
 * 途中で失敗しても**どこまで進んだかを返します**（黙って一部だけ入るのが最悪）。
 */
router.post('/invoices/bulk', canEdit, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string') : [];
  if (ids.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '対象が選ばれていません');
  if (ids.length > 200) throw new AppError(400, 'VALIDATION_ERROR', '一度に処理できるのは 200 件までです');

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const col of ['inspection_date', 'paid_date', 'billing_date'] as const) {
    if (!(col in body)) continue;
    const v = body[col];
    if (v !== null && !(typeof v === 'string' && YMD.test(v))) {
      throw new AppError(400, 'VALIDATION_ERROR', `${col} は YYYY-MM-DD か null で指定してください`);
    }
    sets.push(`${col} = ?`);
    values.push(v);
  }
  if ('invoice_issued' in body) {
    sets.push('invoice_issued = ?');
    values.push(body.invoice_issued === true);
  }
  if (sets.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '変更する項目がありません');

  // **申込書が揃っていないものは弾く。** 画面でも選べないようにしているが、
  // ここで見ないと直接叩けば通ってしまう
  const blocked = await queryAll(
    `SELECT r.id FROM revenues r JOIN projects p ON p.id = r.project_id
      WHERE r.id = ANY($1::text[]) AND COALESCE(p.application_form, 0) = 0`,
    [ids],
  ) as { id: string }[];
  const blockedIds = new Set(blocked.map((b) => b.id));
  const target = ids.filter((id) => !blockedIds.has(id));

  // 請求書を出すときだけ申込書を要求する。入金・検収の記録は止めない
  const issuing = 'invoice_issued' in body && body.invoice_issued === true;
  const finalIds = issuing ? target : ids;
  if (finalIds.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '選んだものはすべて申込書が揃っていません');
  }

  await execute(
    `UPDATE revenues SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ?
      WHERE id = ANY($${values.length + 2}::text[]) AND deleted_at IS NULL`,
    [...values, req.user!.id, finalIds],
  );

  // 締めからまとめて発行したぶんにも番号を採る。**1件ずつと同じ経路**を通す
  // (2つ書くと、片方だけ直したときに月次締めからだけ番号が付かなくなる)
  const numbered = issuing ? await assignInvoiceNumbers(finalIds) : [];

  res.json({
    success: true,
    data: {
      updated: finalIds.length,
      // **飛ばしたものを返す。** 黙って一部だけ処理するのがいちばん困る
      skipped_blocked: issuing ? [...blockedIds] : [],
      // 採った請求書番号。画面はこれを出して「何番で出したか」を見せる
      invoice_numbers: numbered,
    },
  });
});

export default router;
