/**
 * 社内取引（GJV⇄GSS） — 2026年10月の事業再編・P2 Round 2
 *
 * 設計の全文: docs/reorg-2026-10-plan.md §4.12（決定: 発生する → ONAiR に載せる）。
 *
 * ── 「同じ案件に付く、会社の違う2行」。写しの案件は作らない ──────────
 *
 * GJV が受けたグループ外の案件を GSS のスタジオ・人員・機材で作るとき、
 * **GSS → GJV の社内売上（revenues）と GJV の社内仕入（purchases）**を
 * 同じ案件（買い手＝GJV の案件）に対して1本ずつ作り、`intercompany_links`
 * （migration 289）で1対1に結ぶ。
 *
 * ── 今回のスコープ（決定） ──────────────────────────────────
 *
 * 売り手は常に GSS・買い手は常に GJV の1方向のみ。GMO はコストセンターで
 * 売上を持たないため対象外（§4.7）。将来 GMO も関わる社内取引が要るように
 * なったら、`SELLER_ENTITY`/`BUYER_ENTITY` の固定値を引数化する。
 *
 * ── 片方だけ直せない・消せない ──────────────────────────────
 *
 * `revenues.routes.ts`/`purchases.routes.ts` の通常の PUT/DELETE は、
 * `intercompany_links` に載っている行を 409 で止める（このファイルの
 * `findLinkByRevenueId`/`findLinkByPurchaseId` を呼ぶ）。直す・消すのは
 * 必ずこのファイルの `updateIntercompanyLink`/`deleteIntercompanyLink`
 * から——両側を同時に、同じ取引の中で書く。
 *
 * **売り手（GSS）側が請求書発行・検収・入金のいずれか済みなら、
 * この経路からも直せない**（`revertToEstimate` の請求後ガードと同じ考え方・
 * `estimate.service.ts` 参照）。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, withTransaction, type TxClient } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateBillingKey } from '../../../shared/services/billing-key.service';
import { normalizeTaxCategory } from '../../../shared/services/tax-category.service';
import { computeDueDate, computeVendorDueDate } from './money-rules.service';
import { SELF_COMPANY_ID_BY_ENTITY } from '../../../shared/constants/entity-default';
import type { LegalEntityCode } from '../../platform/services/legal-entity.service';

/** 今回のスコープ（決定・§4.12）。売り手は常に GSS・買い手は常に GJV */
const SELLER_ENTITY: LegalEntityCode = 'GSS';
const BUYER_ENTITY: LegalEntityCode = 'GJV';

export interface IntercompanyLink {
  id: string;
  revenue_id: string;
  purchase_id: string;
  project_id: string;
  created_at: string;
  created_by: string | null;
}

export interface IntercompanyDetail {
  link: IntercompanyLink;
  revenue: Record<string, unknown>;
  purchase: Record<string, unknown>;
}

export async function findLinkByRevenueId(revenueId: string): Promise<IntercompanyLink | null> {
  const row = await queryOne('SELECT * FROM intercompany_links WHERE revenue_id = ?', [revenueId]);
  return (row as unknown as IntercompanyLink) ?? null;
}

export async function findLinkByPurchaseId(purchaseId: string): Promise<IntercompanyLink | null> {
  const row = await queryOne('SELECT * FROM intercompany_links WHERE purchase_id = ?', [purchaseId]);
  return (row as unknown as IntercompanyLink) ?? null;
}

/**
 * リンク済みなら 409。**通常の `PUT/DELETE /revenues|purchases/:id` の入口で呼ぶガード**。
 * 「どちら側の id か」は呼び出し側が知っているので、列名だけ渡す。
 */
export async function assertNotIntercompanyLinked(
  kind: 'revenue' | 'purchase', id: string,
): Promise<void> {
  const col = kind === 'revenue' ? 'revenue_id' : 'purchase_id';
  const link = await queryOne(`SELECT id FROM intercompany_links WHERE ${col} = ?`, [id]);
  if (link) {
    throw new AppError(409, 'INTERCOMPANY_LINKED',
      'この行は社内取引としてリンクされています。社内取引の編集画面から直してください（片方だけは直せません）');
  }
}

/** 売り手（GSS）側が請求書発行・検収・入金済みなら true（この経路からも直せない） */
function isLocked(revenue: Record<string, unknown>): boolean {
  return !!(revenue.invoice_issued || revenue.inspection_date || revenue.paid_date);
}

async function assertEditable(link: IntercompanyLink, tx: TxClient): Promise<Record<string, unknown>> {
  const revenue = await tx.queryOne(
    'SELECT id, invoice_issued, inspection_date, paid_date FROM revenues WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
    [link.revenue_id],
  ) as Record<string, unknown> | undefined;
  if (!revenue) throw new AppError(404, 'NOT_FOUND', '社内取引の売上行が見つかりません');
  if (isLocked(revenue)) {
    throw new AppError(409, 'INTERCOMPANY_INVOICED',
      '請求書発行・検収・入金が済んだ社内取引は直せません');
  }
  return revenue;
}

export interface CreateIntercompanyParams {
  projectId: string;
  episodeId: string;
  amount: number;
  recognitionDate?: string | null;
  taxCategory?: string;
  notes?: string | null;
  userId: string;
}

/**
 * 社内取引を作る。「サムライスタジオへ社内発注」の実体。
 *
 * 買い手（GJV）の案件に、売り手（GSS）の社内売上と買い手の社内仕入を
 * 1本ずつ、**同じ回に**作り、`intercompany_links` で結ぶ。
 * 案件そのものは1つのまま（写しの案件は作らない・§4.12）。
 */
export async function createIntercompanyPurchase(params: CreateIntercompanyParams): Promise<IntercompanyDetail> {
  const { projectId, episodeId, recognitionDate, notes, userId } = params;
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount < 1) throw new AppError(400, 'VALIDATION_ERROR', '金額（1円以上）を入れてください');
  const taxCategory = normalizeTaxCategory(params.taxCategory);

  const sellerCustomerId = SELF_COMPANY_ID_BY_ENTITY[BUYER_ENTITY];   // 売上の相手先＝買い手の自社行
  const buyerVendorId = SELF_COMPANY_ID_BY_ENTITY[SELLER_ENTITY];      // 仕入の相手先＝売り手の自社行
  if (!sellerCustomerId || !buyerVendorId) {
    throw new AppError(500, 'INTERNAL_ERROR', '社内取引の相手先（自社行）が設定されていません');
  }

  return withTransaction(async (tx) => {
    const project = await tx.queryOne(
      'SELECT id, entity_code FROM projects WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [projectId],
    ) as { id: string; entity_code: string | null } | undefined;
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
    if (project.entity_code && project.entity_code !== BUYER_ENTITY) {
      throw new AppError(400, 'VALIDATION_ERROR', '社内発注はGJVの案件から登録してください');
    }

    const episode = await tx.queryOne(
      'SELECT id, episode_code FROM episodes WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
      [episodeId, projectId],
    ) as { id: string; episode_code: string } | undefined;
    if (!episode) throw new AppError(400, 'VALIDATION_ERROR', 'この案件の回を指定してください');

    const billingKey = generateBillingKey(episode.episode_code, taxCategory);
    const recogDate = recognitionDate || null;

    // 期日は各社のお金のルールから引く（Round 1 で entity_code 対応済み）。
    // 取引の外で呼ぶ（設定の読み取りだけなので押さえた行を必要としない）
    const revenueDueDate = await computeDueDate(recogDate, sellerCustomerId, SELLER_ENTITY);
    const purchaseDueDate = await computeVendorDueDate(recogDate, buyerVendorId, BUYER_ENTITY);

    const revenueId = uuidv4();
    const purchaseId = uuidv4();
    const linkId = uuidv4();

    await tx.execute(
      `INSERT INTO revenues (id, billing_key, project_id, entity_code, customer_id, episode_id,
                              tax_category, amount, recognition_date, payment_due_date, notes,
                              status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
      [revenueId, billingKey, projectId, SELLER_ENTITY, sellerCustomerId, episodeId,
       taxCategory, amount, recogDate, revenueDueDate, notes,
       userId],
    );
    await tx.execute(
      `INSERT INTO purchases (id, billing_key, project_id, entity_code, episode_id, vendor_id,
                               assigned_to, tax_category, amount, recognition_date, payment_due_date,
                               notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchaseId, billingKey, projectId, BUYER_ENTITY, episodeId, buyerVendorId,
       userId, taxCategory, amount, recogDate, purchaseDueDate,
       notes, userId],
    );
    await tx.execute(
      `INSERT INTO intercompany_links (id, revenue_id, purchase_id, project_id, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [linkId, revenueId, purchaseId, projectId, userId],
    );

    const revenue = await tx.queryOne('SELECT * FROM revenues WHERE id = ?', [revenueId]) as Record<string, unknown>;
    const purchase = await tx.queryOne('SELECT * FROM purchases WHERE id = ?', [purchaseId]) as Record<string, unknown>;
    const link = await tx.queryOne('SELECT * FROM intercompany_links WHERE id = ? FOR UPDATE', [linkId]) as unknown as IntercompanyLink;
    return { link, revenue, purchase };
  });
}

export interface UpdateIntercompanyParams {
  amount?: number;
  recognitionDate?: string | null;
  episodeId?: string;
  notes?: string | null;
}

/** 金額・計上日・回・備考をまとめて直す。**両側を同じ取引の中で書く** */
export async function updateIntercompanyLink(
  linkId: string, patch: UpdateIntercompanyParams, _userId: string,
): Promise<IntercompanyDetail> {
  return withTransaction(async (tx) => {
    const link = await tx.queryOne('SELECT * FROM intercompany_links WHERE id = ? FOR UPDATE', [linkId]) as unknown as IntercompanyLink | undefined;
    if (!link) throw new AppError(404, 'NOT_FOUND', '社内取引が見つかりません');
    await assertEditable(link, tx);

    let billingKey: string | undefined;
    if (patch.episodeId !== undefined) {
      const episode = await tx.queryOne(
        'SELECT id, episode_code FROM episodes WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
        [patch.episodeId, link.project_id],
      ) as { id: string; episode_code: string } | undefined;
      if (!episode) throw new AppError(400, 'VALIDATION_ERROR', 'この案件の回を指定してください');
      const revForTax = await tx.queryOne('SELECT tax_category FROM revenues WHERE id = ?', [link.revenue_id]) as { tax_category: string };
      billingKey = generateBillingKey(episode.episode_code, revForTax.tax_category);
    }

    if (patch.amount !== undefined && (!Number.isFinite(patch.amount) || patch.amount < 1)) {
      throw new AppError(400, 'VALIDATION_ERROR', '金額（1円以上）を入れてください');
    }

    const dateChanged = patch.recognitionDate !== undefined;
    const revenueDueDate = dateChanged
      ? await computeDueDate(patch.recognitionDate ?? null, SELF_COMPANY_ID_BY_ENTITY[BUYER_ENTITY], SELLER_ENTITY) : null;
    const purchaseDueDate = dateChanged
      ? await computeVendorDueDate(patch.recognitionDate ?? null, SELF_COMPANY_ID_BY_ENTITY[SELLER_ENTITY], BUYER_ENTITY) : null;

    await tx.execute(
      `UPDATE revenues SET
         amount = COALESCE(?, amount),
         recognition_date = CASE WHEN ? THEN ? ELSE recognition_date END,
         payment_due_date = CASE WHEN ? THEN ? ELSE payment_due_date END,
         episode_id = COALESCE(?, episode_id),
         billing_key = COALESCE(?, billing_key),
         notes = CASE WHEN ? THEN ? ELSE notes END,
         updated_at = NOW()
       WHERE id = ?`,
      [patch.amount ?? null,
       patch.recognitionDate !== undefined, patch.recognitionDate ?? null,
       dateChanged, revenueDueDate,
       patch.episodeId ?? null, billingKey ?? null,
       patch.notes !== undefined, patch.notes ?? null,
       link.revenue_id],
    );
    await tx.execute(
      `UPDATE purchases SET
         amount = COALESCE(?, amount),
         recognition_date = CASE WHEN ? THEN ? ELSE recognition_date END,
         payment_due_date = CASE WHEN ? THEN ? ELSE payment_due_date END,
         episode_id = COALESCE(?, episode_id),
         billing_key = COALESCE(?, billing_key),
         notes = CASE WHEN ? THEN ? ELSE notes END,
         updated_at = NOW()
       WHERE id = ?`,
      [patch.amount ?? null,
       patch.recognitionDate !== undefined, patch.recognitionDate ?? null,
       dateChanged, purchaseDueDate,
       patch.episodeId ?? null, billingKey ?? null,
       patch.notes !== undefined, patch.notes ?? null,
       link.purchase_id],
    );

    const revenue = await tx.queryOne('SELECT * FROM revenues WHERE id = ?', [link.revenue_id]) as Record<string, unknown>;
    const purchase = await tx.queryOne('SELECT * FROM purchases WHERE id = ?', [link.purchase_id]) as Record<string, unknown>;
    return { link, revenue, purchase };
  });
}

/** 両側を同時に削除する（ソフトデリート）。売り手側が済んでいれば消せない */
export async function deleteIntercompanyLink(linkId: string, userId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const link = await tx.queryOne('SELECT * FROM intercompany_links WHERE id = ? FOR UPDATE', [linkId]) as unknown as IntercompanyLink | undefined;
    if (!link) throw new AppError(404, 'NOT_FOUND', '社内取引が見つかりません');
    await assertEditable(link, tx);

    await tx.execute(`UPDATE revenues SET deleted_at = NOW(), updated_by = ? WHERE id = ?`, [userId, link.revenue_id]);
    await tx.execute(`UPDATE purchases SET deleted_at = NOW(), updated_by = ? WHERE id = ?`, [userId, link.purchase_id]);
    await tx.execute(`DELETE FROM intercompany_links WHERE id = ?`, [linkId]);
  });
}

export async function getIntercompanyDetail(linkId: string): Promise<IntercompanyDetail> {
  const link = await queryOne('SELECT * FROM intercompany_links WHERE id = ?', [linkId]) as unknown as IntercompanyLink | null;
  if (!link) throw new AppError(404, 'NOT_FOUND', '社内取引が見つかりません');
  const revenue = await queryOne('SELECT * FROM revenues WHERE id = ?', [link.revenue_id]) as Record<string, unknown>;
  const purchase = await queryOne('SELECT * FROM purchases WHERE id = ?', [link.purchase_id]) as Record<string, unknown>;
  return { link, revenue, purchase };
}

/** 案件の社内取引の一覧（案件詳細の仕入タブが使う） */
export async function listIntercompanyByProject(projectId: string): Promise<IntercompanyDetail[]> {
  const links = await queryAll(
    'SELECT * FROM intercompany_links WHERE project_id = ? ORDER BY created_at DESC', [projectId],
  ) as unknown as IntercompanyLink[];
  const details: IntercompanyDetail[] = [];
  for (const link of links) {
    const revenue = await queryOne('SELECT * FROM revenues WHERE id = ?', [link.revenue_id]) as Record<string, unknown>;
    const purchase = await queryOne('SELECT * FROM purchases WHERE id = ?', [link.purchase_id]) as Record<string, unknown>;
    details.push({ link, revenue, purchase });
  }
  return details;
}

/**
 * 金額入力欄の初期値の下見（§4.12「初期値に、その案件の最新の見積の原価行の
 * 合計を出す」）。**見つからなければ 0**（手入力の代わりにはしない・下見だけ）。
 * 「最新」＝ `rejected`/`superseded` を除く、作成が最も新しい見積（版・見積グループを
 * 問わない——「いま生きている見積のうちいちばん新しいもの」を素朴に取る）。
 */
export async function suggestIntercompanyAmount(projectId: string): Promise<{ suggested_amount: number; estimate_id: string | null }> {
  const estimate = await queryOne(
    `SELECT id FROM estimates
      WHERE project_id = ? AND deleted_at IS NULL AND status NOT IN ('rejected', 'superseded')
      ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  ) as { id: string } | undefined;
  if (!estimate) return { suggested_amount: 0, estimate_id: null };
  const sum = await queryOne(
    'SELECT COALESCE(SUM(cost), 0) AS total FROM estimate_items WHERE estimate_id = ?',
    [estimate.id],
  ) as { total: string };
  return { suggested_amount: Number(sum.total), estimate_id: estimate.id };
}

/**
 * `revenue_id`/`purchase_id` の集合から、そのうち社内取引にリンクされているものだけを返す。
 * 一覧・粗利集計の除外に使う（N+1 を避けるため集合で引く）。
 */
export async function linkedRevenueIds(revenueIds: string[]): Promise<Set<string>> {
  if (revenueIds.length === 0) return new Set();
  const rows = await queryAll(
    'SELECT revenue_id FROM intercompany_links WHERE revenue_id = ANY(?)', [revenueIds],
  ) as { revenue_id: string }[];
  return new Set(rows.map((r) => r.revenue_id));
}

export async function linkedPurchaseIds(purchaseIds: string[]): Promise<Set<string>> {
  if (purchaseIds.length === 0) return new Set();
  const rows = await queryAll(
    'SELECT purchase_id FROM intercompany_links WHERE purchase_id = ANY(?)', [purchaseIds],
  ) as { purchase_id: string }[];
  return new Set(rows.map((r) => r.purchase_id));
}
