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
 *
 * **前の版を `superseded` にするのは、前の版が `sent`（お客様に出した）ときだけ**
 * です（ユーザー指摘）。以前は `accepted` 以外なら無条件に `superseded` に
 * しており、**まだお客様に出していない `draft`（下書き）から次の版を作っただけで
 * 前の版まで編集できなくなっていました**（`update`/`replaceItems` は `status = 'draft'`
 * のときしか編集を許さないため）。「並行して複数の版を作る」「意図的に案件を
 * 複数の見積に分ける（本編とケータリング等）」ときに下書きを直せなくなるのは
 * 事実に反するので、`draft` から次の版を作ったときは**前の版を `draft` のまま
 * 残します**（＝そのまま編集可能）。`sent`/`accepted`/`rejected`/`superseded` の
 * 版はもともと `status <> 'draft'` で編集を止めているので、ここで状態を触らなくても
 * 「送った記録は書き換えない」という既存方針は変わりません。
 *
 * この結果、**同じ `group_id` に `draft` が複数残ることがあります**
 * （下書きから版を重ねた分だけ）。周辺コード（一覧・承認判定・売上への変換・
 * PDF発行）はどれも「版1件＝行1件」で `id` 単位に扱っており、`group_id` に対して
 * 「`draft` は最大1件」を仮定している箇所は無いことを確認済みです
 * （唯一 `group_id` で集約する `project.service.ts` の `ESTIMATE_AMOUNT_LATERAL` は
 * `DISTINCT ON (group_id) ... ORDER BY version DESC` で常に最新版を1本だけ拾う作りなので、
 * 同じ group に draft が複数あっても壊れません）。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { checkDiscount, NO_LIMIT, type DiscountLimit } from '../../../shared/services/discountLimit';
import { taxBillingSuffix } from '../../../shared/services/tax-category.service';
import { assertCustomerCompanyId } from '../../../shared/services/company-directory.service';

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
  pricing_item_id: string | null;
  /** この行の日付（スタジオ利用日・機材の使用日など）。任意（migration 194） */
  item_date: string | null;
  /** この行の終了日。任意・`item_date`（開始日）とセットで使う（migration 235） */
  item_date_end: string | null;
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
  /**
   * **いま見ている人が、この見積を承認できるか。**
   *
   * 画面はこれを見て「承認する」を出します。**押して 403 にしない**ため
   * （v4 の決めごと）で、判定はサーバーが持ちます — 画面に写すと、
   * 承認者の決め方を変えた日に**ボタンだけ古い規則で出ます**。
   */
  can_approve?: boolean;
  /**
   * **承認者に決められているか**（編集権限は見ない）。`can_approve` が false でも
   * ここが true なら「承認者だが編集権限が無い」— 画面はその理由を名指しします。
   * 分けないと、**その人にだけ理由の分からない行き止まり**になります。
   */
  is_approver?: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  sent_at: string | null;
  decided_at: string | null;
  revenue_id: string | null;
  notes: string | null;
  updated_at: string;
  /** アーカイブした日時。`null` なら一覧に出る（migration 236） */
  archived_at: string | null;
  items?: EstimateItem[];
}

const SELECT_ESTIMATE = `
  SELECT id, project_id, submit_to, customer_id, group_id, version, title, status,
         tax_category, subtotal, discount, valid_until,
         approval_state, approved_by, approved_at,
         sent_at, decided_at, revenue_id, notes, archived_at, created_at, updated_at
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
 * 見積の**持ち主 = 作った人**（`created_by`）。
 *
 * ⚠️ **`updated_by`（最後に触った人）を持ち主にしないこと。** 値引きの限度も
 * 承認できる人も持ち主の役割で決まるので、`updated_by` にすると
 * **上司が保存ボタンを押しただけで限度がその人のものに上がり**、
 * **承認者も上司の承認者（＝もっと上）に変わって、本来の承認者が承認できなくなります**。
 *
 * ここが**3か所（送付の判定・承認待ちの見直し・承認の可否）に散っていて、
 * 実際に食い違っていました**（レビューで2度指摘された）。**この2つが正**です。
 * `created_by` が空の古い行だけ `updated_by` に落とします。
 */
const OWNER_SQL = 'COALESCE(created_by, updated_by)';
function ownerOf(row: Record<string, unknown>): string {
  return String(row.created_by ?? row.updated_by ?? '');
}

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

  const owner = ownerOf(est);
  if (!owner) return;
  const { needsApproval } = checkDiscount(Number(est.subtotal) || 0, Number(est.discount) || 0, await limitOf(owner));
  await execute(`UPDATE estimates SET approval_state = $2 WHERE id = $1`,
    [estimateId, needsApproval ? 'pending' : 'none']);
}

/**
 * その人は見積を作ってよいか。**設定の「お金のルール」で役割ごとに決める**
 * （`role_discount_limits.can_estimate`）。
 *
 * ⚠️ この値は**読み込んではいたが、どこからも見られていませんでした**。
 * 既定の「制作」役割は `can_estimate = false` かつ `gpm` の編集権限を持つので、
 * **設定で禁止したはずの人が見積を作れていました**（設定の画面には「作れません」と出る）。
 */
async function assertCanEstimate(userId: string): Promise<void> {
  const { canEstimate } = await limitOf(userId);
  if (!canEstimate) {
    throw new AppError(403, 'FORBIDDEN',
      'この役割は見積を作れません（設定 → お金のルールで決めています）。'
      + '作れる方に依頼するか、設定を見直してください');
  }
}


/**
 * **承認の帯を出すのはこの見積か。**
 *
 * 承認待ち（`approval_state = 'pending'`）でも、**次の版に置き換わったもの
 * （`superseded`）には出しません。** `createNextVersion` は前の版の中身を
 * 触らない決めごとなので、**`approval_state` は `pending` のまま残ります** —
 * そのまま出すと、**もう送れない版の帯が新しい版の帯と並んで2枚**出て、
 * しかも**送れない版に承認を記録できて**しまいます（レビューでの指摘）。
 *
 * ⚠️ **前の版の `approval_state` を書き換えて解かないこと。** 送った見積を
 * 見返せることが要件そのもので、承認待ちのまま置き換えた事実も記録です。
 *
 * 判定を `draft` に絞るのは、**承認が解くのが「送れない」だけ**だからです
 * （`rejected` も `superseded` も、承認しても送れるようにはならない）。
 */
function isApprovable(e: Estimate): boolean {
  return e.approval_state === 'pending' && e.status === 'draft';
}

/**
 * その人が承認できる見積はどれか。**まとめて1回で引きます** —
 * 一覧の行ごとに引くと、版が10本あれば10回になります。
 *
 * 承認できるのは **その見積を作った人の役割に決めた承認者**（`approve()` と同じ規則）。
 * ⚠️ 規則そのものを2か所に書かないこと — ここは「誰に出すか」、`approve()` は
 * 「実際に通すか」で、**食い違うと画面にボタンが出るのに押すと 403**になります。
 */
async function approverIds(estimates: Estimate[], viewerId: string): Promise<Set<string>> {
  const pending = estimates.filter(isApprovable);
  if (pending.length === 0 || !viewerId) return new Set();

  const me = await queryOne(
    'SELECT role, permission_role_id FROM users WHERE id = $1', [viewerId],
  ) as Record<string, unknown> | null;
  // system_admin は権限の仕組みと揃えて素通り
  if (me?.role === 'system_admin') return new Set(pending.map((e) => e.id));
  if (!me?.permission_role_id) return new Set();

  const rows = (await queryAll(
    `SELECT e.id
       FROM estimates e
       JOIN users u ON u.id = ${OWNER_SQL.replace(/created_by/g, 'e.created_by').replace(/updated_by/g, 'e.updated_by')}
       JOIN role_discount_limits l ON l.role_id = u.permission_role_id
      WHERE e.id = ANY($1) AND l.approver_role_id = $2`,
    [pending.map((e) => e.id), me.permission_role_id],
  )) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

/**
 * 一覧・詳細に「あなたは承認できるか」を付ける。
 *
 * ⚠️ **役割だけでは決まりません**（レビューでの指摘）。承認の口は案件も GPM も
 * **その画面の編集権限**を要求するので、承認者に決められていても
 * **編集権限が無い人にボタンを出すと、押した先は 403** です
 * （この版が塞ごうとしている壊れ方そのもの）。`canEditModule` は
 * **呼ぶ側が渡します** — 案件の口なら `sales`、GPM の口なら `gpm` で、
 * どの区画を要求するかは口ごとに違うためです。
 *
 * **`is_approver` も一緒に返します。** 「承認者だが編集権限が無い」を
 * 画面が名指しできないと、**その人には理由の分からない行き止まり**になり、
 * 見積はまた誰にも送れないままになります（#63 と同じ形）。
 */
export async function withCanApprove<T extends Estimate>(
  rows: T[], viewerId: string, canEditModule: boolean,
): Promise<T[]> {
  const approver = await approverIds(rows, viewerId);
  return rows.map((r) => ({
    ...r,
    is_approver: approver.has(r.id),
    can_approve: approver.has(r.id) && canEditModule,
  }));
}

export const estimateService = {
  /**
   * 案件の見積を新しい版から順に。**版はまとめず全部返す** (履歴を見るのが目的)
   *
   * **既定はアーカイブした版を除く。** 版を重ねるほど一覧に古い版が積み上がり、
   * 見たい版（最新の draft・sent）が埋もれるため、`archived_at` を立てた版は
   * `includeArchived: true` を渡したときだけ返す（画面の「アーカイブした版を表示」）。
   */
  async listByProject(projectId: string, includeArchived = false): Promise<Estimate[]> {
    return (await queryAll(
      `${SELECT_ESTIMATE} WHERE project_id = $1 AND deleted_at IS NULL
       ${includeArchived ? '' : 'AND archived_at IS NULL'}
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
    await assertCanEstimate(userId);

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
      // **`item_date`/`item_date_end` は DATE 列**なので、素通しで選ぶと pg が
      // 文字列ではなく Date を返し、`res.json()` が `toISOString()` した
      // "2026-09-01T00:00:00.000Z" が画面に渡る（実際に確認した）。
      // `<input type="date">` は `YYYY-MM-DD` しか受け付けないため、渡すたびに
      // 欄が空に見えてしまう。`to_char` で最初から `YYYY-MM-DD` の文字列にする
      // （`estimate-pdf.service.ts` の同じ落とし穴と同じ直し方）
      `SELECT id, description, quantity, unit, unit_price, amount, cost, category,
              pricing_item_id, item_notes,
              to_char(item_date, 'YYYY-MM-DD') AS item_date,
              to_char(item_date_end, 'YYYY-MM-DD') AS item_date_end,
              sort_order
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
    await assertCanEstimate(userId);
    // `customer_id` は companies.id（Phase 3-2a）を直接指すため、DB の FK は
    // 「顧客ロールの会社か」を保証しない（レビュー指摘・PR #199 P2 の2巡目）
    await assertCustomerCompanyId(data.customer_id);
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
   * 次の版を作る。**前の版は中身を変えない。** 明細もそのまま写すので、
   * 直したいところだけ直せばよい。
   *
   * 前の版を `superseded`（差し替え済み）にするのは**前の版が `sent`
   * （お客様に出した）ときだけ**。`draft`（まだ出していない下書き）から
   * 次の版を作ったときは前の版を `draft` のまま残す — お客様に出していない
   * ものまで「もう直せない」にする理由が無い（ユーザー指摘）。
   * `accepted`/`rejected`/`superseded` はここで触らなくても、そもそも
   * `update`/`replaceItems` が `status = 'draft'` のときしか編集を許さないので
   * 「送った記録は書き換えない」という既存方針は変わらない。
   */
  async createNextVersion(fromId: string, userId: string): Promise<Estimate> {
    const from = await this.getById(fromId);
    if (!from) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    // 次の版も「作る」— ここを通すと、作れない役割でも版を重ねられる
    await assertCanEstimate(userId);

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
           amount, cost, category, pricing_item_id, item_notes, item_date, item_date_end, sort_order)
         SELECT $1, $2, description, quantity, unit, unit_price, amount, cost, category,
                pricing_item_id, item_notes, item_date, item_date_end, sort_order
         FROM estimate_items WHERE id = $3`,
        [uuidv4(), id, it.id]
      );
    }
    // 前の版は「次の版に置き換わった」印を付けるだけ。**中身は触らない**。
    // **`sent` からの版上げだけ** `superseded` にする — `draft` はまだお客様に
    // 出していないので、次の版を作ったあとも編集できる `draft` のまま残す
    // （`accepted`/`rejected`/`superseded` はここで触らなくても編集不可のまま）
    await execute(
      `UPDATE estimates SET status = 'superseded', updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND status = 'sent'`,
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
      `SELECT id, status, subtotal, discount, approval_state, created_by, updated_by
         FROM estimates WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    ) as Record<string, unknown> | null;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');

    /*
     * ⚠️ **出した版（`sent`）・受注／失注した版・差し替え済みの版（`superseded`）の
     * 中身は直せません**（v4 の決めごと。「直すなら次の版を作る」）。
     *
     * ここに守りが無く、**画面がボタンを出さないだけ**でした（レビューでの指摘 #50）。
     * 古いタブ・MCP・直接叩けば通るので、**送った見積の金額が後から変わり**、
     * しかも「何を出したか」を見返せるという要件そのものが壊れます。
     *
     * **`status` だけの更新は通します** — 送る・受注・失注は記録そのもので、
     * 中身を変える操作ではありません（`superseded` からは動かしません）。
     */
    const CONTENT = ['title', 'tax_category', 'discount', 'valid_until', 'notes'] as const;
    const touchesContent = CONTENT.some((k) => k in data);
    if (touchesContent && existing.status !== 'draft') {
      throw new AppError(400, 'VALIDATION_ERROR',
        'この版はもう直せません（送付済み・受注済み・差し替え済み）。'
        + '内容を変えるときは「次の版をつくる」を押してください');
    }
    if (data.status && existing.status === 'superseded') {
      throw new AppError(400, 'VALIDATION_ERROR',
        'この版は次の版に置き換わっています。新しい版で操作してください');
    }

    // ── 送るときだけ止める（お金のルール ⑤）──────────────────
    //
    // 値引きの保存そのものは通します。**送付だけ**を止めるのがモックの決めごと。
    // ここで止めないと、上限を決めても誰も止まりません。
    if (data.status === 'sent' && existing.approval_state !== 'approved') {
      // 同じ呼び出しで値引きも変えているときは**新しい値**で判定する
      // (保存してから判定すると、上限超えの値引きで送れてしまう一瞬ができる)
      const discount = 'discount' in data ? Number(data.discount) : Number(existing.discount);
      /*
       * ⚠️ **限度は「作った人」の役割で見る。送る人ではない。**
       *
       * ここは `limitOf(userId)`（＝いま送ろうとしている人）を見ていました。
       * その結果、**上司が部下の上限超えの見積を、承認せずにそのまま送れました**
       * （上司の限度で通ってしまう）。しかも `approval_state` は `pending` のまま
       * `sent` になるので、**承認待ちなのに出ている**行が残ります。
       * `refreshApproval` は最初から作った人で見ており、ここだけ食い違っていました。
       */
      const owner = ownerOf(existing) || userId;
      const { needsApproval, reasons } = checkDiscount(Number(existing.subtotal), discount, await limitOf(owner));
      if (needsApproval) {
        await execute(`UPDATE estimates SET approval_state = 'pending' WHERE id = $1`, [id]);
        const approver = await approverNameOf(owner);
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
      // **持ち主は作った人**（`OWNER_SQL`）。ここが `updated_by` を先に見ていたため、
      // **上司が下書きを1文字直しただけで「承認できる人」が上司の承認者に変わり**、
      // 本来の承認者（上司自身）が 403 になっていた
      `SELECT id, status, approval_state, ${OWNER_SQL} AS owner
         FROM estimates WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    ) as Record<string, unknown> | null;
    if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    if (est.approval_state !== 'pending') {
      throw new AppError(400, 'VALIDATION_ERROR', 'この見積は承認待ちではありません');
    }
    // ⚠️ **次の版に置き換わったものは承認しない**（レビューでの指摘）。
    // `createNextVersion` は前の版の中身を触らないので `approval_state` は
    // `pending` のまま残り、**もう送れない版に承認を記録できてしまう**。
    // 画面の出し分け（`isApprovable`）だけに頼らないこと — 古いタブから
    // 直接叩けば通ってしまう
    if (est.status !== 'draft') {
      throw new AppError(400, 'VALIDATION_ERROR',
        'この見積はもう送れません（次の版に置き換わっている・却下済みなど）。'
        + '新しい版を承認してください');
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
    const existing = await queryOne(
      `SELECT id, status FROM estimates WHERE id = $1 AND deleted_at IS NULL`, [estimateId],
    ) as { status: string } | undefined;
    if (!existing) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    // **出した版の明細も直せません**（`update` と同じ決めごと）。
    // 中身を守るのに合計だけ止めても、明細から金額を変えられては意味がない
    if (existing.status !== 'draft') {
      throw new AppError(400, 'VALIDATION_ERROR',
        'この版の明細はもう直せません（送付済み・受注済み・差し替え済み）。'
        + '「次の版をつくる」を押してください');
    }

    /*
     * ⚠️ **消してから入れるので、取引にする**（レビューでの指摘 #50）。
     * 取引の外でやっていたため、**途中で1行でも失敗すると前の明細が消えたまま**
     * 残りました（画面には「保存できませんでした」と出るので、押した人は
     * 直っていないと思うだけ ── 実際には**明細が空になっている**）。
     */
    await withTransaction(async (tx) => {
      await tx.execute(`DELETE FROM estimate_items WHERE estimate_id = $1`, [estimateId]);
      let order = 0;
      for (const it of items) {
        // **`quantity` は INTEGER 列。** 数量欄は `type="number"` で小数も打てるため
        // （半日利用のつもりで「0.5」等）、`unit_price` と同じく丸めずに渡すと
        // Postgres が `invalid input syntax for type integer` で拒否し、
        // 見積の明細保存＝発行の手前が丸ごと 500 になっていた（実際に踏んだ）。
        // `unit_price` と同じく `Math.round` で整数に丸めてから渡す
        const qty = Math.max(0, Math.round(Number(it.quantity) || 0));
        const price = Math.round(Number(it.unit_price) || 0);
        const itemDate = it.item_date ?? null;
        const itemDateEnd = it.item_date_end ?? null;
        // 終了日が開始日より前は事実として矛盾するので保存の手前で弾く（DB の
        // CHECK 制約 `estimate_items_date_range_check`（migration 235）に任せて
        // そのまま突っ込むと、生の Postgres エラーが 500 として画面に出てしまう）
        if (itemDate && itemDateEnd && itemDateEnd < itemDate) {
          throw new AppError(400, 'VALIDATION_ERROR', '終了日は開始日より後にしてください');
        }
        await tx.execute(
          `INSERT INTO estimate_items (id, estimate_id, description, quantity, unit, unit_price,
             amount, cost, category, item_notes, item_date, item_date_end, pricing_item_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [uuidv4(), estimateId, it.description ?? '', qty, it.unit ?? null, price,
           qty * price, Math.round(Number(it.cost) || 0), it.category ?? null,
           it.item_notes ?? null, itemDate, itemDateEnd, it.pricing_item_id ?? null, order++]
        );
      }
    });
    await recalc(estimateId);
    return (await this.getById(estimateId))!;
  },

  /**
   * 消す。**下書きだけ**（レビューでの指摘 #50）。
   *
   * 守りが無く、**出した版・受注した版・差し替え済みの版まで消せました**
   * （画面は `revenue_id` が無いことだけを見てボタンを出していた）。
   * 送った見積は**お客様に渡した記録**で、消えると「何を出したか」を追えません。
   * 差し替え済みの版も、版を重ねた経緯そのものです。
   */
  async remove(id: string, userId: string): Promise<void> {
    const est = await queryOne(
      `SELECT status FROM estimates WHERE id = $1 AND deleted_at IS NULL`, [id],
    ) as { status: string } | undefined;
    if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    if (est.status !== 'draft') {
      throw new AppError(400, 'VALIDATION_ERROR',
        '下書きの見積だけ消せます（送付済み・受注済み・差し替え済みの版は記録として残します）');
    }
    await execute(
      `UPDATE estimates SET deleted_at = NOW(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [id, userId]
    );
  },

  /**
   * アーカイブする。**一覧から隠すだけ**（レビューでの指摘に先回り — `remove` と混同しないこと）。
   *
   * `status` はここでは一切触らない。アーカイブは「一覧に出すか」だけの直交した印で、
   * 送付済み・受注済みの版をアーカイブしても、送った記録（`sent`）そのものは変わらない。
   * 何度呼んでも同じ状態に収まるよう `WHERE archived_at IS NULL` は付けない
   * （すでにアーカイブ済みでも 400 にせず、`archived_at` を今の時刻に更新するだけ）。
   */
  async archive(id: string, userId: string): Promise<Estimate> {
    const est = await queryOne(
      `SELECT id FROM estimates WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    await execute(
      `UPDATE estimates SET archived_at = NOW(), updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [id, userId],
    );
    return (await this.getById(id))!;
  },

  /** アーカイブを解く。一覧に戻す。 */
  async unarchive(id: string, userId: string): Promise<Estimate> {
    const est = await queryOne(
      `SELECT id FROM estimates WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    await execute(
      `UPDATE estimates SET archived_at = NULL, updated_at = NOW(), updated_by = $2 WHERE id = $1`,
      [id, userId],
    );
    return (await this.getById(id))!;
  },

  /**
   * 受注が決まった見積を売上 (`revenues`) に変換する。
   *
   * migration 138 が「確定したら売上に変換します」と予告していたきり、
   * 変換する場所がどこにも無かった（見積を出す画面はできたが、
   * 受注後の行き先が無いまま止まっていた）。
   *
   * **`accepted`（受注）の見積だけ**変換できる。draft/sent のまま変換すると、
   * まだ決まっていない金額が確定売上に計上されてしまう。
   *
   * **二度は変換しない**（`revenue_id` を見る）。押し直しで売上が2行できると、
   * 同じ受注が二重に計上され、当月売上・請求の集計が実態よりふくらむ。
   *
   * `revenues` を直接組み立てるのは、`POST /revenues`（財務の売上作成）と
   * **billing_key の作り方を合わせるため**（別の式で書くと、見積からの変換だけ
   * 違う形の請求KEYが混ざる）。
   */
  async convertToRevenue(id: string, userId: string): Promise<Estimate> {
    const est = await queryOne(
      `SELECT e.*, p.gls_number AS project_gls_number, p.customer_id AS project_customer_id
         FROM estimates e JOIN projects p ON p.id = e.project_id
        WHERE e.id = $1 AND e.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [id],
    ) as Record<string, unknown> | null;
    if (!est) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    if (est.status !== 'accepted') {
      throw new AppError(400, 'VALIDATION_ERROR', '受注が決まった見積だけ売上・請求に登録できます');
    }
    if (est.revenue_id) {
      throw new AppError(400, 'ALREADY_CONVERTED', 'この見積はすでに売上・請求に登録されています');
    }
    const customerId = (est.customer_id as string | null) ?? (est.project_customer_id as string | null);
    if (!customerId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'お客様が決まっていないので売上・請求に登録できません（案件詳細の概要でお客様を選んでください）');
    }

    const items = (await queryAll(
      `SELECT description, quantity, unit_price, amount, category, pricing_item_id, item_notes, sort_order
         FROM estimate_items WHERE estimate_id = $1 ORDER BY sort_order, created_at`,
      [id],
    )) as Record<string, unknown>[];

    const projectId = String(est.project_id);
    const discount = Number(est.discount) || 0;
    const amount = (Number(est.subtotal) || 0) - discount;
    const taxCategory = String(est.tax_category ?? 'tax10');

    const revenueId = uuidv4();
    await withTransaction(async (tx) => {
      /*
       * ⚠️ **確かめるのも採番するのも取引の中で、行を押さえてから**（レビューでの指摘）。
       *
       * 上の `est.revenue_id` の確認と連番の数え上げを取引の外でやっていたので、
       * **2人が同時に押すと両方が確認を通り**、売上が2行できていました
       * （`estimates.revenue_id` は後から書いたほうだけが残るので、
       * **もう1行はどこからも参照されないまま台帳に載り続けます** = 二重計上）。
       * `billing_key` も同じ数え方をしていたので**同じ鍵の行が2つ**できます。
       * 議事録の持ち帰り（v4.0.10）とまったく同じ形です。
       */
      const locked = await tx.queryOne(
        `SELECT revenue_id FROM estimates WHERE id = $1 FOR UPDATE`, [id],
      ) as { revenue_id: string | null } | undefined;
      if (locked?.revenue_id) {
        throw new AppError(400, 'ALREADY_CONVERTED', 'この見積はすでに売上・請求に登録されています');
      }

      // 案件ごとの連番。**削除済みも含めて数える**（`POST /revenues` と同じ数え方 —
      // ソフトデリート分を除くと連番が再利用され、billing_key が重複しうる）
      const existingCount = ((await tx.queryOne(
        `SELECT COUNT(*) AS c FROM revenues WHERE project_id = $1`,
        [projectId],
      )) as { c: string }).c;
      const seqNum = String(Number(existingCount) + 1).padStart(3, '0');
      const base = (est.project_gls_number as string | null) || 'REV';
      const billingKey = `${base}-${seqNum}-${taxBillingSuffix(taxCategory)}`;

      /*
       * ⚠️ **備考は見積の備考をそのまま写す。「見積 vN から登録」等の自動文言を
       * 入れない**（ユーザー指摘・実際に踏んだ不具合）。
       *
       * この `notes` は社内向けの管理メモではなく、請求書・検収書 PDF の
       * 「備考」欄にそのまま印字される（`revenues.routes.ts` の `/:id/pdf`）。
       * 見積側で何も書いていないのに変換のたびに定型文が入ると、
       * 備考欄を空のまま出したいだけの帳票に社内の作成経緯が漏れて出る。
       * どの見積から変換したかは `estimates.revenue_id`（この行）から逆引き
       * できるので、`notes` に埋め込んで持たせる必要も無い。
       */
      await tx.execute(
        `INSERT INTO revenues (id, billing_key, project_id, customer_id, tax_category, amount,
           subtitle, notes, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', $9, $9)`,
        [revenueId, billingKey, projectId, customerId, taxCategory, amount,
         (est.title as string) || null, (est.notes as string) || null, userId],
      );
      let order = 1;
      for (const it of items) {
        await tx.execute(
          `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount,
             category, pricing_item_id, item_notes, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [uuidv4(), revenueId, it.description, it.quantity, it.unit_price, it.amount,
           it.category, it.pricing_item_id, it.item_notes, order++],
        );
      }
      /*
       * ⚠️ **値引きも1行として写す**（レビューでの指摘）。
       *
       * 見積の値引きは**単価を下げずに別建て**する決めごと（v4 の設計判断）なので、
       * 明細をそのまま写すと**定価のまま**になります。売上の合計（`revenues.amount`）は
       * 値引き後なのに、**明細を足すと合計より大きい** — 請求書 PDF は明細と合計の
       * 両方を刷るので、**紙の上で数字が合いません**。明細を足して数える画面
       * （案件詳細の売上・請求）も定価で数えます。
       *
       * **単価を按分して下げないこと** — どの品目をいくら引いたのかは決めていないので、
       * 勝手に配ると「この品目はこの値段で受けた」という誤った記録になります。
       */
      // **明細が1行も無い見積には書かない** — 値引きだけの明細になり、
      // 「明細の合計 = マイナス／ヘッダーはプラス」というもっと読めない形になる
      if (discount > 0 && items.length > 0) {
        await tx.execute(
          `INSERT INTO revenue_items (id, revenue_id, description, quantity, unit_price, amount,
             category, sort_order)
           VALUES ($1, $2, $3, 1, $4, $4, $5, $6)`,
          [uuidv4(), revenueId, `値引き（見積 v${est.version}）`, -discount, 'other', order++],
        );
      }
      // **見積の側にも売上の id を残す。** 「いくらで出して、いくらで決まったか」を
      // あとから見積タブから追えるようにする（migration 138 の `revenue_id` 列）
      await tx.execute(
        `UPDATE estimates SET revenue_id = $2, updated_at = NOW(), updated_by = $3 WHERE id = $1`,
        [id, revenueId, userId],
      );
    });

    return (await this.getById(id))!;
  },
};
