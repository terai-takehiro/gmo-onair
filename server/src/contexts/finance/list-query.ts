// 予算管理 一覧/エクスポート共通のフィルタ + 並び替えビルダー
// list ルートと excel エクスポートで同一の絞り込み・ソートを保証するために共有する。
//
// 25章: **お試し (練習) の案件に付いた売上・仕入はここで外す**。
// この2つのビルダーは 一覧 / CSV / Excel / MCP (`list_revenues` `list_purchases`) が
// 共有しているので、1か所直せば全部に効く。
// 案件の付いていない行 (案件なしの仕入など) は落とさない。
import type { Request } from 'express';
import { NOT_SANDBOX_VIA } from '../../shared/db/sandbox-filter';

type Query = Request['query'];

function s(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// ============================================================
// 仕入 (purchases)  alias: pu / projects p / vendors v
// ============================================================
export function buildPurchaseWhere(q: Query): { where: string; params: unknown[] } {
  let where = `WHERE pu.deleted_at IS NULL AND ${NOT_SANDBOX_VIA('pu')}`;
  const params: unknown[] = [];
  const search = s(q.search);
  if (search) {
    where += ` AND (pu.description ILIKE ? OR v.name ILIKE ? OR p.gls_number ILIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const projectId = s(q.project_id);
  if (projectId) {
    where += ` AND ((pu.project_id = ? AND pu.group_id IS NULL) OR pu.id IN (SELECT purchase_id FROM purchase_allocations WHERE project_id = ?))`;
    params.push(projectId, projectId);
  }
  const groupId = s(q.group_id);
  if (groupId) { where += ` AND pu.group_id = ?`; params.push(groupId); }
  const rm = s(q.recognition_month);
  if (rm) { where += ` AND pu.recognition_date LIKE ?`; params.push(`${rm}-%`); }
  const rf = s(q.recognition_from), rt = s(q.recognition_to);
  if (rf) { where += ` AND pu.recognition_date >= ?`; params.push(rf); }
  if (rt) { where += ` AND pu.recognition_date <= ?`; params.push(rt); }
  // 固定原価Pj (code=FIXED-COGS) の絞り込み。'1'=固定原価のみ / '0'=固定原価を除く
  const fc = s(q.fixed_cost);
  if (fc === '1') { where += ` AND p.code = 'FIXED-COGS'`; }
  else if (fc === '0') { where += ` AND (p.code IS NULL OR p.code <> 'FIXED-COGS')`; }
  return { where, params };
}

// 既定: 案件コード昇順 → 金額降順
const PURCHASE_DEFAULT_ORDER = 'p.gls_number ASC NULLS LAST, pu.amount DESC, pu.created_at DESC';
const PURCHASE_SORT: Record<string, string> = {
  gls_asc: 'p.gls_number ASC NULLS LAST, pu.amount DESC',
  gls_desc: 'p.gls_number DESC NULLS LAST, pu.amount DESC',
  project_asc: 'p.name ASC NULLS LAST, pu.amount DESC',
  project_desc: 'p.name DESC NULLS LAST, pu.amount DESC',
  vendor_asc: 'v.name ASC NULLS LAST, pu.amount DESC',
  vendor_desc: 'v.name DESC NULLS LAST, pu.amount DESC',
  desc_asc: 'pu.description ASC NULLS LAST',
  desc_desc: 'pu.description DESC NULLS LAST',
  settlement_asc: 'pu.settlement_number ASC NULLS LAST',
  settlement_desc: 'pu.settlement_number DESC NULLS LAST',
  tax_asc: 'pu.tax_category ASC, pu.amount DESC',
  tax_desc: 'pu.tax_category DESC, pu.amount DESC',
  amount_asc: 'pu.amount ASC, p.gls_number ASC NULLS LAST',
  amount_desc: 'pu.amount DESC, p.gls_number ASC NULLS LAST',
  recognition_asc: 'pu.recognition_date ASC NULLS LAST, pu.amount DESC',
  recognition_desc: 'pu.recognition_date DESC NULLS LAST, pu.amount DESC',
  invoice_asc: 'pu.invoice_qualified ASC, pu.amount DESC',
  invoice_desc: 'pu.invoice_qualified DESC, pu.amount DESC',
};
export function buildPurchaseOrder(q: Query): string {
  return PURCHASE_SORT[s(q.sort)] || PURCHASE_DEFAULT_ORDER;
}

// ============================================================
// 売上 (revenues)  alias: r / projects p / customers c
// ============================================================
export function buildRevenueWhere(q: Query): { where: string; params: unknown[] } {
  let where = `WHERE r.deleted_at IS NULL AND ${NOT_SANDBOX_VIA('r')}`;
  const params: unknown[] = [];
  const search = s(q.search);
  if (search) {
    const safe = search.slice(0, 100).replace(/[%_\\]/g, '\\$&');
    where += ` AND (r.billing_key ILIKE ? ESCAPE '\\' OR r.notes ILIKE ? ESCAPE '\\')`;
    params.push(`%${safe}%`, `%${safe}%`);
  }
  const projectId = s(q.project_id);
  if (projectId) {
    where += ` AND ((r.project_id = ? AND r.group_id IS NULL) OR r.id IN (SELECT revenue_id FROM revenue_allocations WHERE project_id = ?))`;
    params.push(projectId, projectId);
  }
  const rm = s(q.recognition_month);
  if (rm) { where += ` AND r.recognition_date LIKE ?`; params.push(`${rm}-%`); }
  const rf = s(q.recognition_from), rt = s(q.recognition_to);
  if (rf) { where += ` AND r.recognition_date >= ?`; params.push(rf); }
  if (rt) { where += ` AND r.recognition_date <= ?`; params.push(rt); }
  const status = s(q.status);
  if (status) { where += ` AND r.status = ?`; params.push(status); }
  else if (!projectId) { where += ` AND r.status = 'confirmed'`; }
  return { where, params };
}

const REVENUE_DEFAULT_ORDER = 'p.gls_number ASC NULLS LAST, r.amount DESC, r.created_at DESC';
const REVENUE_SORT: Record<string, string> = {
  billing_key_asc: 'r.billing_key ASC NULLS LAST',
  billing_key_desc: 'r.billing_key DESC NULLS LAST',
  gls_asc: 'p.gls_number ASC NULLS LAST, r.amount DESC',
  gls_desc: 'p.gls_number DESC NULLS LAST, r.amount DESC',
  project_asc: 'p.name ASC NULLS LAST, r.amount DESC',
  project_desc: 'p.name DESC NULLS LAST, r.amount DESC',
  customer_asc: 'c.name ASC NULLS LAST, r.amount DESC',
  customer_desc: 'c.name DESC NULLS LAST, r.amount DESC',
  tax_asc: 'r.tax_category ASC, r.amount DESC',
  tax_desc: 'r.tax_category DESC, r.amount DESC',
  amount_asc: 'r.amount ASC, p.gls_number ASC NULLS LAST',
  amount_desc: 'r.amount DESC, p.gls_number ASC NULLS LAST',
  recognition_asc: 'r.recognition_date ASC NULLS LAST, r.amount DESC',
  recognition_desc: 'r.recognition_date DESC NULLS LAST, r.amount DESC',
};
export function buildRevenueOrder(q: Query): string {
  return REVENUE_SORT[s(q.sort)] || REVENUE_DEFAULT_ORDER;
}

// ============================================================
// 販管費 (sga_expenses)  alias: s  ※案件コードを持たないため既定は金額降順
// ============================================================
export function buildSgaWhere(q: Query): { where: string; params: unknown[] } {
  let where = 'WHERE s.deleted_at IS NULL';
  const params: unknown[] = [];
  const source = s(q.source);
  if (source === 'staff' || source === 'accounting') { where += ` AND s.source = ?`; params.push(source); }
  const search = s(q.search);
  if (search) { where += ` AND (s.vendor_name ILIKE ? OR s.description ILIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  const dateFrom = s(q.date_from);
  if (dateFrom) { where += ` AND s.recognition_date >= ?`; params.push(dateFrom); }
  const dateTo = s(q.date_to);
  if (dateTo) { where += ` AND s.recognition_date <= ?`; params.push(dateTo); }
  const rm = s(q.recognition_month);
  if (rm) { where += ` AND s.recognition_date LIKE ?`; params.push(`${rm}-%`); }
  const rf = s(q.recognition_from), rt = s(q.recognition_to);
  if (rf) { where += ` AND s.recognition_date >= ?`; params.push(rf); }
  if (rt) { where += ` AND s.recognition_date <= ?`; params.push(rt); }
  return { where, params };
}

const SGA_DEFAULT_ORDER = 's.amount DESC, s.recognition_date DESC, s.created_at DESC';
const SGA_SORT: Record<string, string> = {
  billing_key_asc: 's.billing_key ASC NULLS LAST',
  billing_key_desc: 's.billing_key DESC NULLS LAST',
  vendor_asc: 's.vendor_name ASC NULLS LAST, s.amount DESC',
  vendor_desc: 's.vendor_name DESC NULLS LAST, s.amount DESC',
  desc_asc: 's.description ASC NULLS LAST',
  desc_desc: 's.description DESC NULLS LAST',
  recognition_asc: 's.recognition_date ASC NULLS LAST, s.amount DESC',
  recognition_desc: 's.recognition_date DESC NULLS LAST, s.amount DESC',
  due_asc: 's.payment_due_date ASC NULLS LAST',
  due_desc: 's.payment_due_date DESC NULLS LAST',
  tax_asc: 's.tax_category ASC, s.amount DESC',
  tax_desc: 's.tax_category DESC, s.amount DESC',
  amount_asc: 's.amount ASC',
  amount_desc: 's.amount DESC',
  method_asc: 's.settlement_method ASC NULLS LAST',
  method_desc: 's.settlement_method DESC NULLS LAST',
  settlement_asc: 's.settlement_number ASC NULLS LAST',
  settlement_desc: 's.settlement_number DESC NULLS LAST',
  type_asc: 's.expense_type ASC, s.amount DESC',
  type_desc: 's.expense_type DESC, s.amount DESC',
  source_asc: 's.source ASC, s.amount DESC',
  source_desc: 's.source DESC, s.amount DESC',
};
export function buildSgaOrder(q: Query): string {
  return SGA_SORT[s(q.sort)] || SGA_DEFAULT_ORDER;
}
