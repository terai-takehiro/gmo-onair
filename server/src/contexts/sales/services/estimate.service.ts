/**
 * 見積 (v4 ⑥ 見積・請求タブ)
 *
 * **`revenues` には一切触りません。** 理由は migration 138 の冒頭にあります
 * (`revenues` を読む 41 か所が `status` を見ておらず、見積を相乗りさせると
 *  当月売上に足されてしまう)。
 *
 * ── 版の増やし方 ────────────────────────────────────────────
 *
 * 「新しい版を作る」= **前の版を丸ごと写して version を +1 する**。
 * 前の版は `superseded` にして残します (中身は変えません — 送ったものを
 * 後から書き換えられると「何を出したか」が追えなくなる)。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { checkDiscount, NO_LIMIT, type DiscountLimit } from '../../../shared/services/discountLimit';

export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'superseded';

export interface EstimateItem {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  amount: number;
  cost: number;
  category: string | null;
  item_notes: string | null;
  sort_order: number;
}

export interface Estimate {
  /** 提出先 self / client / pm。GLS-B（プロジェクト）の見積だけが使う */
  submit_to?: string | null;
  id: string;
  project_id: string;
  customer_id: string | null;
  group_id: string;
  version: number;
  title: string;
  status: EstimateStatus;
  tax_category: string;
  subtotal: number;
  discount: number;
  valid_until: string | null;
  /** 値引きが上限を超えたか。`pending` の間は送れない (お金のルール ⑤) */
  approval_state?: 'none' | 'pending' | 'approved';
  approved_by?: string | null;
  approved_at?: string | null;
  sent_at: string | null;
  decided_at: string | null;
  revenue_id: string | null;
  notes: string | null;
  updated_at: string;
  items?: EstimateItem[];
}

const SELECT_ESTIMATE = `
  SELECT id, project_id, submit_to, customer_id, group_id, version, title, status,
         tax_category, subtotal, discount, valid_until,
         approval_state, approved_by, approved_at,
         sent_at, decided_at, revenue_id, notes, created_at, updated_at
  FROM estimates
`;

/**
 * 提出先（v4 大⑤・プロジェクト管理の見積だけで使う）。
 * 案件（GLS）の見積は相手が1つなので使いません。
 */
export const SUBMIT_TO = ['self', 'client', 'pm'] as const;
export type SubmitTo = (typeof SUBMIT_TO)[number];

/** 明細から合計を出し直す。**画面から送られた合計は信じない** (計算はサーバーが持つ) */
async function recalc(estimateId: string): Promise<void> {
  await execute(
    `UPDATE estimates SET subtotal = COALESCE(
       (SELECT SUM(amount) FROM estimate_items WHERE estimate_id = $1), 0
     ), updated_at = NOW() WHERE id = $1`,
    [estimateId]
  );
  await refreshApproval(estimateId);
}

// ───────────────────────────────────────────────────────────
// 値引きの上限（お金のルール ⑤）
// ───────────────────────────────────────────────────────────

/**
 * その人の役割の上限。**役割が無い人・上限を決めていない役割は「上限なし」。**
 *
 * 「決めていない = 出せない」にすると、役割を1つ足した瞬間その役割の人が
 * 見積を出せなくなります（気づけるのは出そうとした人だけ）。
 * 決めていないことは設定の画面に一覧で出して見えるようにしてあります。
 */
async function limitOf(userId: string): Promise<DiscountLimit> {
  const row = await queryOne(
    `SELECT u.role, l.max_rate, l.max_amount, l.can_estimate,
            l.approver_role_id, a.name AS approver_name
       FROM users u
       LEFT JOIN role_discount_limits l ON l.role_id = u.permission_role_id
       LEFT JOIN permission_roles a ON a.id = l.approver_role_id
      WHERE u.id = $1`,
    [userId],
  ) as Record<string, unknown> | null;
  // system_admin はすべての判定を素通りする（権限の仕組みと揃える）
  if (!row || row.role === 'system_admin') return NO_LIMIT;
  return {
    maxRate: row.max_rate == null ? null : Number(row.max_rate),
    maxAmount: row.max_amount == null ? null : Number(row.max_amount),
    canEstimate: row.can_estimate !== false,
  };
}

async function approverNameOf(userId: string): Promise<string | null> {
  const row = await queryOne(
    `SELECT a.name FROM users u
       JOIN role_discount_limits l ON l.role_id = u.permission_role_id
       JOIN permission_roles a ON a.id = l.approver_role_id
      WHERE u.id = $1`,
    [userId],
  ) as { name?: string } | null;
  return row?.name ?? null;
}

/**
 * 値引きが上限を超えていれば「承認待ち」にする。**保存は止めません**
 * （モック:「保存はできますが承認待ちになり、お客様に出せません」）。
 * 止まるのは `status = 'sent'` にするときだけ。
 *
 * **一度 approved にしたものは戻しません** — 承認したあとに明細を1行足しただけで
 * 承認が消えると、承認者を何度も呼ぶことになります。金額を大きく変えるときは
 * 版を上げる運用（新しい版は `none` から始まる）。
 */
async function refreshApproval(estimateId: string): Promise<void> {
  const est = await queryOne(
    `SELECT subtotal, discount, approval_state, updated_by, created_by
       FROM estimates WHERE id = $1 AND deleted_at IS NULL`,
    [estimateId],
  ) as Record<string, unknown> | null;
  if (!est) return;
  if (est.approval_state === 'approved') return;

  const owner = String(est.updated_by ?? est.created_by ?? '');
  if (!owner) return;
  const { needsApproval } = checkDiscount(Number(est.subtotal) || 0, Number(est.discount) || 0, await limitOf(owner));
  await execute(`UPDATE estimates SET approval_state = $2 WHERE id = $1`,
    [estimateId, needsApproval ? 'pending' : 'none']);
}

export const estimateService = {
  /** 案件の見積を新しい版から順に。**版はまとめず全部返す** (履歴を見るのが目的) */
  async listByProject(projectId: string): Promise<Estimate[]> {
    return (await queryAll(
      `${SELECT_ESTIMATE} WHERE project_id = $1 AND deleted_at IS NULL
       ORDER BY group_id, version DESC`,
      [projectId]
    )) as unknown as Estimate[];
  },

  /**
   * プロジェクト（GLS-B）の見積を1本（v1）作る (v4 大⑤・migration 179)。
   *
   * **行き先は `project_id` 1 本**です。migration 179 より前は
   * `gpm_project_id` という別の列に入れて CHECK で排他していましたが、
   * プロジェクトも案件の行になったので分ける必要がなくなりました。
   * 案件管理の一覧・ダッシュボードには `gls_category = 'A'` で絞って出しません。
   *
   * **提出先を必須にします。** GPM の見積は「誰に出すか」で金額も中身も変わる
   * （自社への社内見積と PM 会社への見積は別物）ので、空のまま作れると
   * **どちらの見積か分からない行**が残ります。
   */
  async createForGpm(
    projectId: string,
    data: { title?: string; submit_to?: string; tax_category?: string; valid_until?: string | null },
    userId: string
  ): Promise<Estimate> {
    const submitTo = String(data.submit_to ?? '');
    if (!(SUBMIT_TO as readonly string[]).includes(submitTo)) {
      throw new AppError(400, 'VALIDATION_ERROR', '提出先（自社 / 依頼元 / PM会社）を選んでください');
    }
    // **プロジェクト（GLS-B）以外には作らせない。** 案件（A）を渡されたら 404 —
    // ここを通せば `gpm` だけの人が案件の見積を増やせてしまう
    const proj = await queryOne(
      `SELECT id FROM projects WHERE id = $1 AND gls_category = 'B' AND deleted_at IS NULL`,
      [projectId],
    );
    if (!proj) throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');

    const id = uuidv4();
    await execute(
      `INSERT INTO estimates (id, project_id, submit_to, group_id, version, title,
         tax_category, valid_until, created_by, updated_by)
       VALUES ($1, $2, $3, $1, 1, $4, $5, $6, $7, $7)`,
      [id, projectId, submitTo, data.title ?? '', data.tax_category ?? 'tax10',
       data.valid_until ?? null, userId]
    );
    return (await this.getById(id))!;
  },

  async getById(id: string): Promise<Estimate | undefined> {
    const row = (await queryOne(`${SELECT_ESTIMATE} WHERE id = $1 AND deleted_at IS NULL`, [id])) as
      unknown as Estimate | undefined;
    if (!row) return undefined;
    row.items = (await queryAll(
      `SELECT id, description, quantity, unit, unit_price, amount, cost, category, item_notes, sort_order
       FROM estimate_items WHERE estimate_id = $1 ORDER BY sort_order, created_at`,
      [id]
    )) as unknown as EstimateItem[];
    return row;
  },

  /** 新しい見積 (v1) */
  async create(
    projectId: string,
    data: { title?: string; customer_id?: string | null; tax_category?: string; valid_until?: string | null },
    userId: string
  ): Promise<Estimate> {
    const id = uuidv4();
    await execute(
      `INSERT INTO estimates (id, project_id, customer_id, group_id, version, title,
         tax_category, valid_until, created_by, updated_by)
       VALUES ($1, $2, $3, $1, 1, $4, $5, $6, $7, $7)`,
      [id, projectId, data.customer_id ?? null, data.title ?? '',
       data.tax_category ?? 'tax10', data.valid_until ?? null, userId]
    );
    return (await this.getById(id))!;
  },

  /**
   * 次の版を作る。**前の版は中身を変えずに `superseded` にして残す。**
   * 明細もそのまま写すので、直したいところだけ直せばよい。
   */
  async createNextVersion(fromId: string, userId: string): Promise<Estimate> {
    const from = await this.getById(fromId);
    if (!from) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');

    const maxRow = (await queryOne(
      `SELECT COALESCE(MAX(version), 0) AS v FROM estimates WHERE group_id = $1 AND deleted_at IS NULL`,
      [from.group_id]
    )) as unknown as { v: number };

    const id = uuidv4();
    await execute(
      // **提出先も写す** (v4 大⑤)。写さないと、v2 を作った瞬間に
      // 「自社への見積」だったものが行き先の分からない見積になる
      `INSERT INTO estimates (id, project_id, submit_to, customer_id, group_id, version, title,
         tax_category, discount, valid_until, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
      [id, from.project_id, from.submit_to, from.customer_id, from.group_id,
       Number(maxRow.v) + 1,
       from.title, from.tax_category, from.discount, from.valid_until, from.notes, userId]
    );
    for (const it of from.items ?? []) {
      await execute(
        `INSERT INTO estimate_items (id, estimate_id, description, quantity, unit, unit_price,
           amount, cost, category, pricing_item_id, item_notes, sort_order)
         SELECT $1, $2, description, quantity, unit, unit_price, amount, cost, category,
                pricing_item_id, item_notes, sort_order
         FROM estimate_items WHERE id = $3`,
        [uuidv4(), id, it.id]
      );
    }
    // 前の版は「次の版に置き換わった」印を付けるだけ。**中身は触らない**
    await execute(
      `UPDATE estimates SET status = 'superseded', updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND status <> 'accepted'`,
      [fromId, userId]
    );
    await recalc(id);
    return (await this.getById(id))!;
  },

  async update(
    id: string,
    data: Partial<{ title: string; status: EstimateStatus; tax_category: string;
      discount: number; valid_until: string | null; notes: string | null }>,
    userId: string
  ): Promise<Estimate> {
    const existing = await queryOne(
      `SELECT id, status, subtotal, discount, approval_state FROM estimates WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    ) as Record<string, unknown> | null;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');

    // ── 送るときだけ止める（お金のルール ⑤）──────────────────
    //
    // 値引きの保存そのものは通します。**送付だけ**を止めるのがモックの決めごと。
    // ここで止めないと、上限を決めても誰も止まりません。
    if (data.status === 'sent' && existing.approval_state !== 'approved') {
      // 同じ呼び出しで値引きも変えているときは**新しい値**で判定する
      // (保存してから判定すると、上限超えの値引きで送れてしまう一瞬ができる)
      const discount = 'discount' in data ? Number(data.discount) : Number(existing.discount);
      const { needsApproval, reasons } = checkDiscount(Number(existing.subtotal), discount, await limitOf(userId));
      if (needsApproval) {
        await execute(`UPDATE estimates SET approval_state = 'pending' WHERE id = $1`, [id]);
        const approver = await approverNameOf(userId);
        throw new AppError(400, 'APPROVAL_REQUIRED',
          `${reasons.join('。')}。${approver ? `${approver} の承認を受けてから送ってください。` : '承認者が決まっていないため、設定のお金のルールで決めてください。'}`);
      }
    }

    const sets = ['updated_at = NOW()', 'updated_by = $2'];
    const params: unknown[] = [id, userId];
    let i = 3;
    for (const f of ['title', 'tax_category', 'discount', 'valid_until', 'notes'] as const) {
      if (f in data) { sets.push(`${f} = $${i++}`); params.push((data as Record<string, unknown>)[f]); }
    }
    if (data.status) {
      sets.push(`status = $${i++}`); params.push(data.status);
      // 送った日・決まった日は**状態を変えたときに自動で入れる** (人が入れ忘れる)
      if (data.status === 'sent') sets.push('sent_at = COALESCE(sent_at, NOW())');
      if (data.status === 'accepted' || data.status === 'rejected') sets.push('decided_at = NOW()');
    }
    await execute(`UPDATE estimates SET ${sets.join(', ')} WHERE id = $1`, params);
    // 値引きを直したら承認待ちかどうかを見直す（**送付を止める根拠になる値**）
    if ('discount' in data) await refreshApproval(id);
    return (await this.getById(id))!;
  },

  /**
   * 承認する。**承認できるのは、その見積を作った人の役割に決めた承認者だけ。**
   *
   * 「誰でも承認できる」にすると上限そのものが意味を失います。
   * 承認者を決めていない役割は承認できない（設定で決めてもらう）。
   */
  async approve(id: string, approverId: string): Promise<Estimate> {
    const est = await queryOne(
      `SELECT id, approval_state, COALESCE(updated_by, created_by) AS owner
         FROM estimates WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    ) as Record<string, unknown> | null;
    if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    if (est.approval_state !== 'pending') {
      throw new AppError(400, 'VALIDATION_ERROR', 'この見積は承認待ちではありません');
    }

    const me = await queryOne(
      'SELECT role, permission_role_id FROM users WHERE id = $1', [approverId],
    ) as Record<string, unknown> | null;
    const wanted = await queryOne(
      `SELECT l.approver_role_id FROM users u
         JOIN role_discount_limits l ON l.role_id = u.permission_role_id
        WHERE u.id = $1`,
      [String(est.owner ?? '')],
    ) as { approver_role_id?: string } | null;

    const isAdmin = me?.role === 'system_admin';
    const isApprover = !!wanted?.approver_role_id && me?.permission_role_id === wanted.approver_role_id;
    if (!isAdmin && !isApprover) {
      throw new AppError(403, 'FORBIDDEN', 'この見積を承認できる役割ではありません');
    }

    await execute(
      `UPDATE estimates SET approval_state = 'approved', approved_by = $2, approved_at = NOW(),
                            updated_at = NOW() WHERE id = $1`,
      [id, approverId],
    );
    return (await this.getById(id))!;
  },

  /**
   * 明細をまとめて置き換える。
   * **合計はここで出し直す** — 画面が送ってきた合計をそのまま保存すると、
   * 計算の実装が画面とサーバーで2つになって必ず食い違う。
   */
  async replaceItems(estimateId: string, items: Partial<EstimateItem>[]): Promise<Estimate> {
    const existing = await queryOne(`SELECT id FROM estimates WHERE id = $1 AND deleted_at IS NULL`, [estimateId]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');

    await execute(`DELETE FROM estimate_items WHERE estimate_id = $1`, [estimateId]);
    let order = 0;
    for (const it of items) {
      const qty = Math.max(0, Number(it.quantity) || 0);
      const price = Math.round(Number(it.unit_price) || 0);
      await execute(
        `INSERT INTO estimate_items (id, estimate_id, description, quantity, unit, unit_price,
           amount, cost, category, item_notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [uuidv4(), estimateId, it.description ?? '', qty, it.unit ?? null, price,
         qty * price, Math.round(Number(it.cost) || 0), it.category ?? null,
         it.item_notes ?? null, order++]
      );
    }
    await recalc(estimateId);
    return (await this.getById(estimateId))!;
  },

  async remove(id: string, userId: string): Promise<void> {
    await execute(
      `UPDATE estimates SET deleted_at = NOW(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [id, userId]
    );
  },
};
