// 予算管理 一覧/エクスポート共通のフィルタ + 並び替えビルダー
// list ルートと excel エクスポートで同一の絞り込み・ソートを保証するために共有する。
import type { Request } from 'express';
import { billingStateSql } from '../../shared/services/billing-state';

type Query = Request['query'];

function s(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// ============================================================
// 仕入 (purchases)  alias: pu / projects p / vendors v
// ============================================================
export function buildPurchaseWhere(q: Query): { where: string; params: unknown[] } {
  let where = 'WHERE pu.deleted_at IS NULL';
  const params: unknown[] = [];
  const search = s(q.search);
  if (search) {
    // **案件名も見る。** 画面が「GLS番号・案件名・仕入先で検索」と書いているのに
    // 案件名だけ抜けていた（売上と同じ抜け）
    // ⚠️ **別名は `vco`（`v` ではない）。** Phase 3-3-9 で `vendors` 表を `companies` に
    // 寄せたとき、各クエリの JOIN は `companies vco` に直ったのに**ここだけ `v.` が
    // 残り**、`?search=` を付けた瞬間に `missing FROM-clause entry for table "v"` で
    // **500 になっていた**（画面の検索欄・Excel 書き出し・MCP の `list_purchases`）。
    // 型検査も lint も SQL の中身を見ないので、**誰も気づけないまま生きていた**。
    where += ` AND (pu.description ILIKE ? OR vco.name ILIKE ? OR p.gls_number ILIKE ? OR p.name ILIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
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

  // 精算の進み具合。`prov` = まだ金額が確定していない見込み
  const state = s(q.state);
  if (state === 'fixed') where += ` AND pu.is_provisional IS NOT TRUE`;
  else if (state === 'prov') where += ` AND pu.is_provisional = true`;
  else if (state === 'nourl') where += ` AND (pu.settlement_url IS NULL OR pu.settlement_url = '')`;
  // 知らない値は素通しさせない（絞り込んだのに全件返ると気づけない）
  else if (state) where += ` AND FALSE`;
  return { where, params };
}

// 既定: 案件コード昇順 → 金額降順
const PURCHASE_DEFAULT_ORDER = 'p.gls_number ASC NULLS LAST, pu.amount DESC, pu.created_at DESC';
const PURCHASE_SORT: Record<string, string> = {
  gls_asc: 'p.gls_number ASC NULLS LAST, pu.amount DESC',
  gls_desc: 'p.gls_number DESC NULLS LAST, pu.amount DESC',
  project_asc: 'p.name ASC NULLS LAST, pu.amount DESC',
  project_desc: 'p.name DESC NULLS LAST, pu.amount DESC',
  vendor_asc: 'vco.name ASC NULLS LAST, pu.amount DESC',   // ⚠️ `v` ではなく `vco`（上のコメント参照）
  vendor_desc: 'vco.name DESC NULLS LAST, pu.amount DESC',
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
  let where = 'WHERE r.deleted_at IS NULL';
  const params: unknown[] = [];
  const search = s(q.search);
  if (search) {
    const safe = search.slice(0, 100).replace(/[%_\\]/g, '\\$&');
    // **案件名・GLS番号・請求先も見る。** ここが請求KEYと備考だけだったため、
    // 画面が「請求KEY・案件名で検索」と書いているのに**案件名では1件も出ませんでした**
    // (仕入・販管費は元から相手先と説明を見ており、売上だけが抜けていた)。
    where += ` AND (r.billing_key ILIKE ? ESCAPE '\\' OR r.notes ILIKE ? ESCAPE '\\'`
      + ` OR p.name ILIKE ? ESCAPE '\\' OR p.gls_number ILIKE ? ESCAPE '\\' OR c.name ILIKE ? ESCAPE '\\')`;
    const like = `%${safe}%`;
    params.push(like, like, like, like, like);
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
  // `status=all` は「確定も見込みも出す」。**空文字と区別する** — 空文字のときは
  // 従来どおり確定だけに絞る (この既定を変えると、status を渡していない
  // 集計 (月次サマリ・MCP・Excel) に見込みが混ざって金額が変わる)
  if (status === 'all') { /* 絞らない */ }
  else if (status) { where += ` AND r.status = ?`; params.push(status); }
  else if (!projectId) { where += ` AND r.status = 'confirmed'`; }

  /*
   * 請求・入金の進み具合。**式は `shared/services/billing-state.ts` が持ちます**
   * （⑤ 見積・請求の `GET /billing/invoices` と**同じものを読む**。レビューでの指摘 #125）。
   *
   * ⚠️ **ここに書き戻さないこと。** 2か所に書いていたときは、同じ `state=unpaid` が
   * 口によって違う集合を指しており、**2つの画面で違う件数**が出ていました。
   */
  const state = s(q.state);
  const sql = billingStateSql(state);
  if (sql) where += ` AND ${sql}`;
  // 知らない値は**素通しさせない**。絞り込んだのに全件返ると気づけない
  else if (state) where += ` AND FALSE`;
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
/**
 * 販管費の条件を「チップの3つ」と「それ以外」に分けて作る。
 *
 * ⚠️ **チップの件数は「種別以外の絞り込みだけ」を掛けて数える**決めごとがあるため、
 * 一覧は2種類の WHERE を必要とする（全部掛けたものと、3つを外したもの）。
 * これまでは `buildSgaWhere` を2回呼んで**同じ表を4〜5回走査**していた。
 * 分けて作れるようにすると、CTE 1本にまとめて `FILTER (WHERE …)` で数え分けられる。
 *
 * ⚠️ **`buildSgaWhere` の返り値は1文字も変えない**（Excel・MCP が使っている）。
 * ここで作ったものを、これまでと同じ順で合成し直している。
 */
export function buildSgaWhereParts(q: Query): {
  base: { where: string; params: unknown[] };
  chip: { sql: string; params: unknown[] };
} {
  // ── チップの3つ（source / expense_type / account_title_id）──
  const chipSql: string[] = [];
  const chipParams: unknown[] = [];
  const source = s(q.source);
  if (source === 'staff' || source === 'accounting') { chipSql.push(`s.source = ?`); chipParams.push(source); }
  const et = s(q.expense_type);
  if (et === 'fixed' || et === 'spot') { chipSql.push(`s.expense_type = ?`); chipParams.push(et); }
  else if (et) { chipSql.push(`FALSE`); } // 知らない値は素通しさせない
  /**
   * 勘定科目 (migration 166)。**`none` は「未設定」を出す**ための特別な値。
   * 166 より前の行は科目を持たないので、それだけを見たいことがある。
   * 知らない値は素通しせず空で返す（絞ったのに全件出ると気づけない）。
   */
  const at = s(q.account_title_id);
  if (at === 'none') { chipSql.push(`s.account_title_id IS NULL`); }
  else if (at) { chipSql.push(`s.account_title_id = ?`); chipParams.push(at); }

  // ── それ以外（チップの件数を数えるときにも掛ける条件）──
  const { where, params } = buildSgaBaseWhere(q);
  return {
    base: { where, params },
    chip: { sql: chipSql.length ? chipSql.join(' AND ') : 'TRUE', params: chipParams },
  };
}

export function buildSgaWhere(q: Query): { where: string; params: unknown[] } {
  const { base, chip } = buildSgaWhereParts(q);
  // ⚠️ **チップのぶんを先に置く。** 分ける前と `?` の並びを1つも変えないため
  // （`convertPlaceholders` は出現順で $1..$n に置き換えるので、順番が命）
  const chipWhere = chip.sql === 'TRUE' ? '' : ` AND ${chip.sql}`;
  const head = 'WHERE s.deleted_at IS NULL';
  return {
    where: head + chipWhere + base.where.slice(head.length),
    params: [...chip.params, ...base.params],
  };
}

function buildSgaBaseWhere(q: Query): { where: string; params: unknown[] } {
  let where = 'WHERE s.deleted_at IS NULL';
  const params: unknown[] = [];
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
