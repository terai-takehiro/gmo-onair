// レンタル機材検索 — DBアクセスとビジネスロジック（グループ化・重なり判定・小計・メール本文）。
// ルーター（`routes/rental.routes.ts`）はここを呼ぶだけの薄い層にする。
//
// company の値は常に '東京オフラインセンター' か 'レスター' の完全一致文字列（DB実データもこの2値）。
// カタログ（qsheet_rental_items）は company + item_id が自然主キー。予約行
// （qsheet_rental_reservations）は project_id/program_id のどちらか1つを owner として持つ
// （device-settings と同じ作法 — `../device-settings-owner.ts` の `Owner`/`ownerWhere`）。
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, Row } from '../../../shared/db/connection';
import { Owner, ownerWhere } from '../device-settings-owner';

const COMPANIES = ['東京オフラインセンター', 'レスター'] as const;
type Company = (typeof COMPANIES)[number];

function isCompany(v: unknown): v is Company {
  return typeof v === 'string' && (COMPANIES as readonly string[]).includes(v);
}

/** ILIKE 検索の `%`, `_`, `\` をエスケープする（programs.routes.ts の sanitizeSearch と同じ要領） */
function sanitizeSearch(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 100).replace(/[%_\\]/g, '\\$&');
}

/** 'YYYY-MM-DD' の日数差（両端含む） */
function daysBetween(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  return Math.round((e - s) / 86400000) + 1;
}

/** qsheet_rental_reservations は project_id/program_id のみ対応（doc_no 列を持たない） */
function ownerCols(owner: Owner): { col: 'project_id' | 'program_id'; value: string } {
  if (owner.kind === 'project') return { col: 'project_id', value: owner.projectId };
  if (owner.kind === 'program') return { col: 'program_id', value: owner.programId };
  // resolveOwner は project/program/null しか返さないため到達しない
  throw new Error('qsheet_rental_reservations は project/program のみ対応です');
}

/**
 * 「この owner ではない」条件。`ownerWhere` の `col = $n` をそのまま `NOT (...)` で
 * 包むと、案件行の program_id / 番組行の project_id は常に NULL のため
 * `NOT (NULL = 値)` が SQL の三値論理で NULL（＝ WHERE から除外）になり、
 * **案件↔番組をまたぐ行が「他の owner」として一切拾えなくなる**（実際に
 * `psql` で `NOT (project_id = 'X')` が project_id IS NULL の行で空になることを確認して発見）。
 * `IS DISTINCT FROM` は NULL を正しく「値と異なる」として扱うのでこちらを使う。
 */
function notThisOwnerClause(owner: Owner, paramIndex: number): { clause: string; params: unknown[] } {
  const { col, value } = ownerCols(owner);
  return { clause: `${col} IS DISTINCT FROM $${paramIndex}`, params: [value] };
}

// ============================================================
// 1. カタログ検索
// ============================================================
export interface ItemSearchQuery {
  q?: unknown;
  company?: unknown;
  category?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

export interface ItemListItem {
  company: string;
  itemId: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  priceTel: number | null;
  priceNet: number | null;
  thumbnailUrl: string | null;
  status: string;
}

export interface ItemSearchResult {
  items: ItemListItem[];
  total: number;
  categories: { category: string; count: number }[];
  companies: { company: string; count: number }[];
}

function thumbnailOf(row: Row): string | null {
  const images = row.images;
  return Array.isArray(images) && images.length > 0 ? String(images[0]) : null;
}

function toListItem(row: Row): ItemListItem {
  return {
    company: row.company as string,
    itemId: row.item_id as string,
    name: row.name as string,
    category: (row.category as string) ?? null,
    subcategory: (row.subcategory as string) ?? null,
    priceTel: (row.price_tel as number) ?? null,
    priceNet: (row.price_net as number) ?? null,
    thumbnailUrl: thumbnailOf(row),
    status: row.status as string,
  };
}

export async function searchItems(query: ItemSearchQuery): Promise<ItemSearchResult> {
  const page = Number.isFinite(Number(query.page)) && Number(query.page) > 0 ? Math.floor(Number(query.page)) : 1;
  const pageSize = Math.min(
    Number.isFinite(Number(query.pageSize)) && Number(query.pageSize) > 0 ? Math.floor(Number(query.pageSize)) : 30,
    60
  );
  const offset = (page - 1) * pageSize;

  const safeQ = sanitizeSearch(query.q);
  const company = isCompany(query.company) ? query.company : null;
  const category = typeof query.category === 'string' && query.category.trim() ? query.category.trim() : null;

  // q だけ効かせた条件（会社別件数の集計用）
  const qParams: unknown[] = [];
  let qClause = '';
  if (safeQ) {
    qParams.push(`%${safeQ}%`);
    qClause = ` AND name ILIKE $${qParams.length} ESCAPE '\\'`;
  }

  // q + company を効かせた条件（カテゴリ別件数の集計用）
  const qcParams = [...qParams];
  let qcClause = qClause;
  if (company) {
    qcParams.push(company);
    qcClause += ` AND company = $${qcParams.length}`;
  }

  // q + company + category を全部効かせた条件（一覧・総件数用）
  const fullParams = [...qcParams];
  let fullClause = qcClause;
  if (category) {
    fullParams.push(category);
    fullClause += ` AND category = $${fullParams.length}`;
  }

  const limitIdx = fullParams.length + 1;
  const offsetIdx = fullParams.length + 2;

  const [itemsRows, totalRow, categoryRows, companyRows] = await Promise.all([
    queryAll(
      `SELECT company, item_id, name, category, subcategory, price_tel, price_net, images, status
       FROM qsheet_rental_items
       WHERE TRUE${fullClause}
       ORDER BY name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...fullParams, pageSize, offset]
    ),
    queryOne(`SELECT COUNT(*)::int AS count FROM qsheet_rental_items WHERE TRUE${fullClause}`, fullParams),
    queryAll(
      `SELECT category, COUNT(*)::int AS count FROM qsheet_rental_items
       WHERE TRUE${qcClause} AND category IS NOT NULL
       GROUP BY category ORDER BY category`,
      qcParams
    ),
    queryAll(
      `SELECT company, COUNT(*)::int AS count FROM qsheet_rental_items
       WHERE TRUE${qClause}
       GROUP BY company ORDER BY company`,
      qParams
    ),
  ]);

  return {
    items: itemsRows.map(toListItem),
    total: (totalRow?.count as number) ?? 0,
    categories: categoryRows.map((r) => ({ category: r.category as string, count: r.count as number })),
    companies: companyRows.map((r) => ({ company: r.company as string, count: r.count as number })),
  };
}

// ============================================================
// 2. 機材詳細
// ============================================================
export interface ItemDetail {
  company: string;
  itemId: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  priceTel: number | null;
  priceNet: number | null;
  status: string;
  specs: Record<string, string>;
  images: string[];
  url: string | null;
  relatedItems: { company: string; itemId: string; name: string; priceNet: number | null }[];
}

export async function getItemDetail(company: string, itemId: string): Promise<ItemDetail | null> {
  const row = await queryOne(`SELECT * FROM qsheet_rental_items WHERE company = $1 AND item_id = $2`, [company, itemId]);
  if (!row) return null;

  const relatedIds = Array.isArray(row.related_item_ids) ? row.related_item_ids.map((v) => String(v)) : [];
  let relatedItems: ItemDetail['relatedItems'] = [];
  if (relatedIds.length > 0) {
    const rows = await queryAll(
      `SELECT company, item_id, name, price_net FROM qsheet_rental_items WHERE company = $1 AND item_id = ANY($2::text[])`,
      [company, relatedIds]
    );
    relatedItems = rows.map((r) => ({
      company: r.company as string,
      itemId: r.item_id as string,
      name: r.name as string,
      priceNet: (r.price_net as number) ?? null,
    }));
  }

  return {
    company: row.company as string,
    itemId: row.item_id as string,
    name: row.name as string,
    category: (row.category as string) ?? null,
    subcategory: (row.subcategory as string) ?? null,
    priceTel: (row.price_tel as number) ?? null,
    priceNet: (row.price_net as number) ?? null,
    status: row.status as string,
    specs: (row.specs as Record<string, string>) ?? {},
    images: (row.images as string[]) ?? [],
    url: (row.url as string) ?? null,
    relatedItems,
  };
}

// ============================================================
// 3. 予約リスト（会社ごとにグループ化）
// ============================================================
export interface ReservationLine {
  id: string;
  company: string;
  itemId: string;
  itemName: string;
  category: string | null;
  quantity: number;
  startDate: string;
  endDate: string;
  priceNet: number | null;
  lineTotal: number;
  status: 'draft' | 'requested';
  conflict: { ownerLabel: string; date: string } | null;
}

export interface ReservationGroup {
  company: string;
  status: 'draft' | 'requested' | 'mixed';
  requestedAt: string | null;
  subtotal: number;
  lines: ReservationLine[];
}

function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export async function getReservationGroups(owner: Owner): Promise<{ groups: ReservationGroup[] }> {
  const { clause, params } = ownerWhere(owner, 1);
  const ownRows = await queryAll(
    `SELECT id, company, item_id, item_name, category, quantity,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date,
            price_net, status, requested_at
     FROM qsheet_rental_reservations
     WHERE ${clause} AND deleted_at IS NULL
     ORDER BY company, item_name`,
    params
  );
  if (ownRows.length === 0) return { groups: [] };

  // 「同じ機材を他番組・他案件も予約予定」の警告用に、他ownerの行を候補として全部引く
  // （社内メモ用途で件数が少ない前提。日付の重なり判定はアプリ側で行う）
  const notThis = notThisOwnerClause(owner, 1);
  const otherRows = await queryAll(
    `SELECT company, item_id, project_id, program_id,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date
     FROM qsheet_rental_reservations
     WHERE deleted_at IS NULL AND ${notThis.clause}`,
    notThis.params
  );

  const projectIds = [...new Set(otherRows.filter((r) => r.project_id).map((r) => r.project_id as string))];
  const programIds = [...new Set(otherRows.filter((r) => r.program_id).map((r) => r.program_id as string))];
  const [projectRows, programRows] = await Promise.all([
    projectIds.length
      ? queryAll(`SELECT id, name, gls_number FROM projects WHERE id = ANY($1::text[])`, [projectIds])
      : Promise.resolve([] as Row[]),
    programIds.length
      ? queryAll(`SELECT id, name FROM qsheet_programs WHERE id = ANY($1::text[])`, [programIds])
      : Promise.resolve([] as Row[]),
  ]);
  const projectLabel = new Map(projectRows.map((r) => [r.id as string, (r.name as string) || (r.gls_number as string) || (r.id as string)]));
  const programLabel = new Map(programRows.map((r) => [r.id as string, (r.name as string) || (r.id as string)]));

  function findConflict(company: string, itemId: string, start: string, end: string): ReservationLine['conflict'] {
    for (const o of otherRows) {
      if (o.company !== company || o.item_id !== itemId) continue;
      const oStart = o.start_date as string;
      const oEnd = o.end_date as string;
      if (start <= oEnd && end >= oStart) {
        const label = o.project_id
          ? projectLabel.get(o.project_id as string) ?? '他の案件'
          : programLabel.get(o.program_id as string) ?? '他の番組';
        return { ownerLabel: label, date: oStart };
      }
    }
    return null;
  }

  const groupsMap = new Map<string, Row[]>();
  for (const row of ownRows) {
    const key = row.company as string;
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(row);
  }

  const groups: ReservationGroup[] = [...groupsMap.keys()].sort().map((company) => {
    const rows = groupsMap.get(company)!;
    const lines: ReservationLine[] = rows.map((row) => {
      const startDate = row.start_date as string;
      const endDate = row.end_date as string;
      const days = daysBetween(startDate, endDate);
      const priceNet = (row.price_net as number) ?? null;
      const quantity = row.quantity as number;
      return {
        id: row.id as string,
        company: row.company as string,
        itemId: row.item_id as string,
        itemName: row.item_name as string,
        category: (row.category as string) ?? null,
        quantity,
        startDate,
        endDate,
        priceNet,
        lineTotal: (priceNet ?? 0) * quantity * days,
        status: row.status as 'draft' | 'requested',
        conflict: findConflict(company, row.item_id as string, startDate, endDate),
      };
    });

    const statuses = new Set(lines.map((l) => l.status));
    const status: ReservationGroup['status'] = statuses.size === 1 ? [...statuses][0] : 'mixed';
    const requestedTimes = rows.map((r) => toIso(r.requested_at)).filter((v): v is string => v !== null);
    const requestedAt = requestedTimes.length ? requestedTimes.sort().slice(-1)[0] : null;
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);

    return { company, status, requestedAt, subtotal, lines };
  });

  return { groups };
}

// ============================================================
// 4. 行を追加（既存の同一条件draft行があれば数量を加算）
// ============================================================
export interface AddLineInput {
  company: string;
  itemId: string;
  quantity: number;
  startDate: string;
  endDate: string;
}

export async function addReservationLine(
  owner: Owner,
  userId: string,
  input: AddLineInput
): Promise<ReservationLine | null> {
  const item = await queryOne(
    `SELECT name, category, price_net FROM qsheet_rental_items WHERE company = $1 AND item_id = $2`,
    [input.company, input.itemId]
  );
  if (!item) return null;

  const { col, value } = ownerCols(owner);
  const existing = await queryOne(
    `SELECT id, quantity FROM qsheet_rental_reservations
     WHERE ${col} = $1 AND company = $2 AND item_id = $3 AND start_date = $4 AND end_date = $5
       AND status = 'draft' AND deleted_at IS NULL`,
    [value, input.company, input.itemId, input.startDate, input.endDate]
  );

  const category = (item.category as string) ?? null;
  const priceNet = (item.price_net as number) ?? null;
  const days = daysBetween(input.startDate, input.endDate);

  let id: string;
  let quantity: number;
  if (existing) {
    id = existing.id as string;
    quantity = (existing.quantity as number) + input.quantity;
    await execute(`UPDATE qsheet_rental_reservations SET quantity = $1, updated_at = NOW() WHERE id = $2`, [quantity, id]);
  } else {
    id = uuid();
    quantity = input.quantity;
    await execute(
      `INSERT INTO qsheet_rental_reservations
         (id, ${col}, company, item_id, item_name, category, quantity, start_date, end_date, price_net, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11)`,
      [id, value, input.company, input.itemId, item.name, category, quantity, input.startDate, input.endDate, priceNet, userId]
    );
  }

  return {
    id,
    company: input.company,
    itemId: input.itemId,
    itemName: item.name as string,
    category,
    quantity,
    startDate: input.startDate,
    endDate: input.endDate,
    priceNet,
    lineTotal: (priceNet ?? 0) * quantity * days,
    status: 'draft',
    conflict: null,
  };
}

// ============================================================
// 5. 行を編集
// ============================================================
export interface UpdateLinePatch {
  quantity?: number;
  startDate?: string;
  endDate?: string;
}

export type UpdateLineResult = 'OK' | 'NOT_FOUND' | 'BAD_REQUEST';

export async function updateReservationLine(owner: Owner, id: string, patch: UpdateLinePatch): Promise<UpdateLineResult> {
  const { clause, params } = ownerWhere(owner, 2);
  const existing = await queryOne(
    `SELECT quantity, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
     FROM qsheet_rental_reservations WHERE id = $1 AND ${clause} AND deleted_at IS NULL`,
    [id, ...params]
  );
  if (!existing) return 'NOT_FOUND';

  const quantity = patch.quantity !== undefined ? patch.quantity : (existing.quantity as number);
  const startDate = patch.startDate !== undefined ? patch.startDate : (existing.start_date as string);
  const endDate = patch.endDate !== undefined ? patch.endDate : (existing.end_date as string);
  if (!Number.isFinite(quantity) || quantity < 1) return 'BAD_REQUEST';
  if (endDate < startDate) return 'BAD_REQUEST';

  await execute(
    `UPDATE qsheet_rental_reservations SET quantity = $1, start_date = $2, end_date = $3, updated_at = NOW() WHERE id = $4`,
    [quantity, startDate, endDate, id]
  );
  return 'OK';
}

// ============================================================
// 6. 行を削除（論理削除）
// ============================================================
export async function deleteReservationLine(owner: Owner, id: string): Promise<'OK' | 'NOT_FOUND'> {
  const { clause, params } = ownerWhere(owner, 2);
  const existing = await queryOne(
    `SELECT id FROM qsheet_rental_reservations WHERE id = $1 AND ${clause} AND deleted_at IS NULL`,
    [id, ...params]
  );
  if (!existing) return 'NOT_FOUND';
  await execute(`UPDATE qsheet_rental_reservations SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
  return 'OK';
}

// ============================================================
// 7. その会社の draft 行を全部 requested にする
// ============================================================
export async function requestCompanyLines(owner: Owner, company: string): Promise<number> {
  const { clause, params } = ownerWhere(owner, 2);
  const rows = await queryAll(
    `UPDATE qsheet_rental_reservations
     SET status = 'requested', requested_at = NOW(), updated_at = NOW()
     WHERE company = $1 AND ${clause} AND status = 'draft' AND deleted_at IS NULL
     RETURNING id`,
    [company, ...params]
  );
  return rows.length;
}

// ============================================================
// 8. 依頼メール文面のひな形（AI不使用・決め打ちテンプレート）
// ============================================================
export interface MailDraft {
  subject: string;
  body: string;
  itemCount: number;
  quantityTotal: number;
  subtotal: number;
}

function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export async function buildMailDraft(owner: Owner, company: string, userName: string | undefined): Promise<MailDraft | null> {
  const { clause, params } = ownerWhere(owner, 2);
  const rows = await queryAll(
    `SELECT item_name, item_id, quantity, price_net,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date
     FROM qsheet_rental_reservations
     WHERE company = $1 AND ${clause} AND deleted_at IS NULL
     ORDER BY item_name`,
    [company, ...params]
  );
  if (rows.length === 0) return null;

  const starts = rows.map((r) => r.start_date as string);
  const ends = rows.map((r) => r.end_date as string);
  const minStart = starts.reduce((a, b) => (b < a ? b : a));
  const maxEnd = ends.reduce((a, b) => (b > a ? b : a));

  const itemCount = rows.length;
  const quantityTotal = rows.reduce((sum, r) => sum + (r.quantity as number), 0);
  const subtotal = rows.reduce((sum, r) => {
    const days = daysBetween(r.start_date as string, r.end_date as string);
    return sum + ((r.price_net as number) ?? 0) * (r.quantity as number) * days;
  }, 0);

  // ⚠️ ここは「依頼する側（自分）」の名前。'ご担当者様' は宛先（相手）の敬称なので
  // フォールバックに使うと「GMOグローバルスタジオのご担当者様です」のような
  // 自己紹介として破綻した文になる。空のときは埋めるべきプレースホルダにする。
  const senderName = userName && userName.trim() ? userName : '【氏名】';
  const itemLines = rows.map((r) => `・${r.item_name}（貴社ID: ${r.item_id}） × ${r.quantity}`).join('\n');

  const subject = `機材レンタルのお見積・ご手配のお願い（${formatMonthDay(minStart)}〜${formatMonthDay(maxEnd)}・GMOグローバルスタジオ）`;

  const body = `${company} ご担当者様

いつもお世話になっております。GMOグローバルスタジオの${senderName}です。
下記機材のお見積・ご手配をお願いいたします。

【利用期間】
${minStart} 〜 ${maxEnd}

【ご依頼機材】
${itemLines}

【受け渡し方法】
配送希望
返却日: （空欄）

ご不明点等ございましたらお気軽にお問い合わせください。
何卒よろしくお願いいたします。

--
${senderName}
GMOグローバルスタジオ
【部署名】
【電話番号】
【メールアドレス】
【住所を入力】
`;

  return { subject, body, itemCount, quantityTotal, subtotal };
}
