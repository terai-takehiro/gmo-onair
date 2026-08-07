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
  /** プロジェクト管理の見積 (v4 大⑤)。`project_id` とは排他 */
  gpm_project_id?: string | null;
  /** 提出先 self / client / pm。案件の見積では null */
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
  sent_at: string | null;
  decided_at: string | null;
  revenue_id: string | null;
  notes: string | null;
  updated_at: string;
  items?: EstimateItem[];
}

const SELECT_ESTIMATE = `
  SELECT id, project_id, gpm_project_id, submit_to, customer_id, group_id, version, title, status,
         tax_category, subtotal, discount, valid_until,
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
   * プロジェクト（GPM）の見積 (v4 大⑤)。
   * **案件の見積とは混ざりません** — `project_id` と `gpm_project_id` は排他
   * （migration 173 の CHECK）。
   */
  async listByGpmProject(gpmProjectId: string): Promise<Estimate[]> {
    return (await queryAll(
      `${SELECT_ESTIMATE} WHERE gpm_project_id = $1 AND deleted_at IS NULL
       ORDER BY group_id, version DESC`,
      [gpmProjectId]
    )) as unknown as Estimate[];
  },

  /**
   * プロジェクトの見積を1本（v1）作る。
   *
   * **提出先を必須にします。** モックの GPM 見積は「誰に出すか」で金額も
   * 中身も変わる（自社への社内見積とPM会社への見積は別物）ので、
   * 空のまま作れると**どちらの見積か分からない行**が残ります。
   */
  async createForGpm(
    gpmProjectId: string,
    data: { title?: string; submit_to?: string; tax_category?: string; valid_until?: string | null },
    userId: string
  ): Promise<Estimate> {
    const submitTo = String(data.submit_to ?? '');
    if (!(SUBMIT_TO as readonly string[]).includes(submitTo)) {
      throw new AppError(400, 'VALIDATION_ERROR', '提出先（自社 / 依頼元 / PM会社）を選んでください');
    }
    const proj = await queryOne('SELECT id FROM gpm_projects WHERE id = $1 AND deleted_at IS NULL', [gpmProjectId]);
    if (!proj) throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');

    const id = uuidv4();
    await execute(
      `INSERT INTO estimates (id, project_id, gpm_project_id, submit_to, group_id, version, title,
         tax_category, valid_until, created_by, updated_by)
       VALUES ($1, NULL, $2, $3, $1, 1, $4, $5, $6, $7, $7)`,
      [id, gpmProjectId, submitTo, data.title ?? '', data.tax_category ?? 'tax10',
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
      // **どちらにぶら下がっているかを写す** (v4 大⑤)。片方だけ写すと
      // CHECK に弾かれるか、案件とプロジェクトの両方に出る行ができる
      `INSERT INTO estimates (id, project_id, gpm_project_id, submit_to, customer_id, group_id, version, title,
         tax_category, discount, valid_until, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
      [id, from.project_id, from.gpm_project_id, from.submit_to, from.customer_id, from.group_id,
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
    const existing = await queryOne(`SELECT id, status FROM estimates WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');

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
