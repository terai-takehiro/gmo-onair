/**
 * equipment/services/item.service.ts — Phase 3 v2.6.11
 * 機材アイテム CRUD のロジック層。
 * EQ コード発番、親子設置場所継承、一括更新の enum バリデーション、
 * 貸出中情報の付加 (effective_rental_listed) もここに集約。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  EQUIPMENT_LENDING_STATUS,
  EQUIPMENT_STATUS,
} from '../../../shared/constants/statuses';

export interface ListFilter {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  equipment_section?: string;
  equipment_type_code?: string;
  include_children?: string;
  parent_id?: string;
  is_rental_listed?: string;
}

export interface ItemRow {
  id: string;
  effective_rental_listed?: boolean;
  current_lending?: unknown;
  parent_id?: string | null;
  location_id?: string | null;
  location_detail?: string | null;
  [k: string]: unknown;
}

export interface ItemCreateInput {
  name: string;
  unit_number?: number | null;
  parent_id?: string | null;
  manufacturer_id?: string | null;
  model_number?: string | null;
  serial_number?: string | null;
  asset_class?: string;
  status?: string;
  condition?: string;
  location_id?: string | null;
  location_detail?: string | null;
  notes?: string | null;
  branch_code?: string | null;
  fixed_asset_code?: string | null;
  depreciation_years?: number | null;
  equipment_section?: string | null;
  equipment_type_code?: string;
  location_code?: string;
  purchased_at?: string | null;
  warranty_years?: number | null;
  rack_position?: number | null;
  rack_height?: number | null;
  rack_slot?: string | null;
  rack_side?: string | null;
  color_id?: string | null;
}

const ALLOWED_BULK_FIELDS = new Set([
  'name', 'model_number', 'manufacturer_id',
  'branch_code', 'asset_class', 'fixed_asset_code', 'depreciation_years',
  'equipment_section', 'equipment_type_code', 'location_code',
  'location_id', 'purchased_at', 'warranty_years',
  'status', 'condition', 'notes', 'parent_id',
  'rack_position', 'rack_height', 'rack_slot', 'rack_side', 'color_id',
  'display_config',
]);

const PATCHABLE_FIELDS = new Set([
  'eq_code', 'name', 'unit_number', 'parent_id', 'manufacturer_id', 'model_number',
  'serial_number', 'asset_class', 'status', 'condition', 'location_id', 'location_detail',
  'notes', 'branch_code', 'fixed_asset_code', 'depreciation_years',
  'equipment_section', 'equipment_type_code', 'location_code', 'purchased_at', 'warranty_years',
  'rack_position', 'rack_height', 'rack_slot', 'rack_side', 'color_id',
  'display_config', 'rental_category_id', 'rental_display_name',
]);

const ENUM_RULES: Record<string, string[]> = {
  status: ['active', 'in_repair', 'retired', 'disposed', 'lost'],
  condition: ['excellent', 'good', 'fair', 'poor'],
  asset_class: ['fixed_asset', 'consumable', 'leased', 'transferred'],
  equipment_section: ['equipment', 'rental'],
  equipment_type_code: ['V', 'C', 'A', 'IC', 'NW', 'L', 'XR', 'E'],
  rack_slot: ['full', 'left-1_2', 'right-1_2', 'left-1_3', 'mid-1_3', 'right-1_3'],
  rack_side: ['front', 'back'],
};

/**
 * EQ コード発番 (Y-V-00001 形式)。
 * 既存の eq_code から最大値を取り、sequences テーブルを atomic に更新して新番を払い出す。
 */
export async function generateEqCode(locationCode: string, typeCode: string): Promise<string> {
  if (!locationCode || !typeCode) {
    throw new AppError(400, 'VALIDATION_ERROR', '拠点コードと種別コードは必須です');
  }
  const prefix = `${locationCode}-${typeCode}`;
  // numStart は .length から導出される TS 整数なので SQL に直接埋め込んでも安全
  const numStart = prefix.length + 2; // "Y-A-000006" → SUBSTRING FROM 5 = "000006"

  // Step 1: 既存 eq_code (soft-deleted 含む) から実際の最大値を求める
  const maxRow = (await queryOne(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(eq_code FROM ${numStart}) AS INTEGER)), 0) AS maxn
     FROM equipment_items WHERE eq_code LIKE $1`,
    [`${prefix}-%`],
  )) as { maxn: number } | null;
  const maxFromItems = maxRow?.maxn ?? 0;

  // Step 2: sequence を atomic に upsert (counter は max(items, sequence) + 1)
  const seq = (await queryOne(
    `INSERT INTO equipment_id_sequences (prefix, counter) VALUES ($1, $2 + 1)
     ON CONFLICT (prefix) DO UPDATE
       SET counter = GREATEST(equipment_id_sequences.counter, $2) + 1
     RETURNING counter`,
    [prefix, maxFromItems],
  )) as { counter: number } | null;

  return `${prefix}-${String(seq?.counter ?? 1).padStart(6, '0')}`;
}

export const itemService = {
  /**
   * 機材一覧 + 件数 + 貸出中情報の付加。
   * paginatedResponse() に渡すための rows / total を返す。
   */
  async list(filter: ListFilter): Promise<{ rows: ItemRow[]; total: number }> {
    let sql = `
      SELECT ei.*,
             em.name as manufacturer_name,
             el.name as location_name,
             el.is_rack as location_is_rack, el.rack_units as location_rack_units,
             p.eq_code as parent_eq_code, p.name as parent_name,
             ec.color_hex, ec.name as color_name,
             CASE WHEN ei.purchased_at IS NOT NULL AND ei.warranty_years > 0
                  THEN (ei.purchased_at + (ei.warranty_years || ' years')::interval)::date
                  ELSE NULL END as warranty_end,
             (SELECT COUNT(*)::int FROM equipment_items c WHERE c.parent_id = ei.id AND c.deleted_at IS NULL) AS children_count,
             ei.is_rental_listed,
             p.is_rental_listed AS parent_rental_listed,
             COALESCE(p.is_rental_listed, ei.is_rental_listed) AS effective_rental_listed
      FROM equipment_items ei
      LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
      LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
      LEFT JOIN equipment_items p ON p.id = ei.parent_id AND p.deleted_at IS NULL
      LEFT JOIN equipment_colors ec ON ec.id = ei.color_id AND ec.deleted_at IS NULL
      WHERE ei.deleted_at IS NULL
    `;
    const params: unknown[] = [];
    let i = 1;

    if (filter.parent_id) {
      sql += ` AND ei.parent_id = $${i++}`;
      params.push(filter.parent_id);
    } else if (filter.include_children !== '1') {
      sql += ` AND ei.parent_id IS NULL`;
    }
    if (filter.status) { sql += ` AND ei.status = $${i++}`; params.push(filter.status); }
    if (filter.equipment_section) { sql += ` AND ei.equipment_section = $${i++}`; params.push(filter.equipment_section); }
    if (filter.equipment_type_code) { sql += ` AND ei.equipment_type_code = $${i++}`; params.push(filter.equipment_type_code); }
    if (filter.is_rental_listed === 'true') { sql += ` AND COALESCE(p.is_rental_listed, ei.is_rental_listed) = true`; }
    if (filter.search) {
      /**
       * **区切り記号を落として突き合わせる列を足した。**
       *
       * 機材 ID は `EQ-0001`、型名は `HDX-3000` のようにハイフンが入るが、
       * **打つ人は入れたり入れなかったりする**（現場では `eq0001` と打つ）。
       * `ILIKE '%eq0001%'` は `EQ-0001` に当たらないので、
       * **「見えているのに出てこない」**が起きていた（実ブラウザで確認）。
       *
       * ID・型名・製造番号だけ、**両側からハイフン・空白・アンダースコアを
       * 落とした形でも**比べる。落とした側は OR で足すだけなので、
       * **いままで当たっていたものは全部当たる**（広がるだけ）。
       * 名前 (`ei.name`) は素のままにする — 日本語の中黒や括弧まで
       * 落とすと、別の機材が混ざって出る。
       *
       * `ILIKE '%…%'` はもともと索引を使えないので、`REPLACE` を挟んでも
       * 速さは変わらない。
       */
      const strip = (col: string) => `REPLACE(REPLACE(REPLACE(${col}, '-', ''), ' ', ''), '_', '')`;
      /*
       * ⚠️ **打った文字だけを寄せてはいけない**（レビューでの指摘・この PR で直した）。
       *
       * 最初の版は打たれた語だけを NFKC で半角に寄せていました。すると
       * **台帳の値のほうが全角だったとき**（Excel 取込で `ＦＸ９` と入っている等）、
       * `ＦＸ９` と打つと語だけ `FX9` になり、**今まで当たっていたものが
       * 当たらなくなります** — 直したつもりで、別の当たり方を壊していました。
       *
       * **両側を寄せて比べます**（Postgres の `normalize(…, NFKC)`。PG 13 以降）。
       * これで 全角↔半角 のどちらの組み合わせでも当たります。
       * **素のままの比較も残す** ので、いままで当たっていたものは全部当たります
       * （`ILIKE '%…%'` はもともと索引を使えないので、関数を挟んでも速さは変わりません）。
       */
      const norm = (col: string) => `normalize(${col}, NFKC)`;
      /** 素のまま比べる列（今までの当たり方を1つも失わないため） */
      const RAW_COLS = [
        'ei.name', 'ei.eq_code', 'em.name', 'ei.model_number', 'ei.serial_number',
        'el.name', 'ei.location_detail',
      ];
      /** 寄せて比べる列（全角↔半角）。**同じ並び**にしておく */
      const NORM_COLS = RAW_COLS;
      /**
       * 区切り記号（ハイフン・空白・アンダースコア）を落として比べる列。
       * **ID・型名・製造番号だけ**にする — 名前まで落とすと、日本語の中黒や
       * 括弧が消えて別の機材が混ざって出ます。
       */
      const BARE_COLS = ['ei.eq_code', 'ei.model_number', 'ei.serial_number'];

      const raw = String(filter.search);
      const term = raw.normalize('NFKC');
      const conds: string[] = [];
      for (const c of RAW_COLS) { conds.push(`${c} ILIKE $${i++}`); params.push(`%${raw}%`); }
      for (const c of NORM_COLS) { conds.push(`${norm(c)} ILIKE $${i++}`); params.push(`%${term}%`); }
      for (const c of BARE_COLS) {
        conds.push(`${strip(norm(c))} ILIKE $${i++}`);
        params.push(`%${term.replace(/[-\s_]/g, '')}%`);
      }
      sql += ` AND (${conds.join(' OR ')})`;
    }

    // Count (where 句を流用するため、本体クエリを wrap)
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) _cnt`;
    const countRow = (await queryOne(countSql, params)) as { total: number | string } | null;

    sql += `
      ORDER BY
        COALESCE(el.sort_order, 9999),
        COALESCE(el.name, ei.location_detail, ''),
        ei.name,
        COALESCE(ei.model_number, ''), ei.unit_number
    `;
    if (filter.limit) { sql += ` LIMIT $${i++}`; params.push(Number(filter.limit)); }
    if (filter.offset) { sql += ` OFFSET $${i++}`; params.push(Number(filter.offset)); }

    const rows = (await queryAll(sql, params)) as unknown as ItemRow[];

    // 貸出中機材の貸出情報を 1 クエリでバッチ取得して付加
    // 子機材は親の is_rental_listed を継承するため effective_rental_listed で判定
    const lendableIds = rows.filter((r) => r.effective_rental_listed).map((r) => r.id);
    if (lendableIds.length > 0) {
      const lendingRows = (await queryAll(
        `SELECT DISTINCT ON (equipment_id)
           id, equipment_id, borrower_name, project_id, lent_at, due_date
         FROM equipment_lendings
         WHERE equipment_id = ANY($1::text[]) AND status = '${EQUIPMENT_LENDING_STATUS.LENT}'
         ORDER BY equipment_id, lent_at DESC`,
        [lendableIds],
      )) as { equipment_id: string; [k: string]: unknown }[];
      const lendingMap = new Map(lendingRows.map((l) => [l.equipment_id, l]));
      for (const row of rows) {
        if (row.effective_rental_listed) {
          row.current_lending = lendingMap.get(row.id) || null;
        }
      }
    }

    return { rows, total: Number(countRow?.total ?? 0) };
  },

  async getById(id: string) {
    const item = await queryOne(
      `SELECT ei.*,
              em.name as manufacturer_name,
              el.name as location_name,
              el.is_rack as location_is_rack, el.rack_units as location_rack_units,
              ec.color_hex, ec.name as color_name,
              erc.name as rental_category_name,
              CASE WHEN ei.purchased_at IS NOT NULL AND ei.warranty_years > 0
                   THEN (ei.purchased_at + (ei.warranty_years || ' years')::interval)::date
                   ELSE NULL END as warranty_end
       FROM equipment_items ei
       LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
       LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
       LEFT JOIN equipment_colors ec ON ec.id = ei.color_id AND ec.deleted_at IS NULL
       LEFT JOIN equipment_rental_categories erc ON erc.id = ei.rental_category_id
       WHERE ei.id = $1 AND ei.deleted_at IS NULL`,
      [id],
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', '機材が見つかりません');

    const lendings = await queryAll(
      'SELECT * FROM equipment_lendings WHERE equipment_id = $1 ORDER BY lent_at DESC LIMIT 20',
      [id],
    );
    const maintenance = await queryAll(
      'SELECT * FROM maintenance_records WHERE equipment_id = $1 ORDER BY reported_at DESC LIMIT 20',
      [id],
    );
    const children = await queryAll(
      `SELECT id, eq_code, name, status, condition, unit_number, model_number, notes
       FROM equipment_items
       WHERE parent_id = $1 AND deleted_at IS NULL
       ORDER BY name, unit_number`,
      [id],
    );
    const parentId = (item as { parent_id?: string | null }).parent_id;
    const parent = parentId
      ? await queryOne(
          'SELECT id, eq_code, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL',
          [parentId],
        )
      : null;

    return { ...(item as Record<string, unknown>), lendings, maintenance, children, parent };
  },

  /**
   * CSV 出力用の全件取得 (pagination 無し)。
   * dist 内の generateCsv() に渡す前提で、列順を固定済み。
   */
  async listForExport() {
    return (await queryAll(`
      SELECT ei.eq_code, ei.name, ei.equipment_type_code, ei.equipment_section,
             em.name as manufacturer, ei.model_number, ei.serial_number, ei.status, ei.condition,
             COALESCE(el.name, ei.location_detail) as location
      FROM equipment_items ei
      LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
      LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
      WHERE ei.deleted_at IS NULL
      ORDER BY ei.equipment_type_code, ei.name, ei.unit_number
    `)) as Record<string, unknown>[];
  },

  async create(input: ItemCreateInput, userId: string | null): Promise<{ id: string; eq_code: string }> {
    if (!input.location_code || !input.equipment_type_code) {
      throw new AppError(
        400, 'VALIDATION_ERROR',
        '拠点コード(location_code)と種別コード(equipment_type_code)は必須です',
      );
    }
    const eq_code = await generateEqCode(input.location_code, input.equipment_type_code);

    // 親機材がある場合、設置場所は親から継承する (子は親と同じ場所に置かれる前提)
    let effectiveLocationId = input.location_id ?? null;
    let effectiveLocationDetail = input.location_detail ?? null;
    if (input.parent_id) {
      const parentItem = (await queryOne(
        'SELECT location_id, location_detail FROM equipment_items WHERE id = $1 AND deleted_at IS NULL',
        [input.parent_id],
      )) as { location_id: string | null; location_detail: string | null } | null;
      if (parentItem) {
        effectiveLocationId = parentItem.location_id;
        effectiveLocationDetail = parentItem.location_detail;
      }
    }

    const id = uuid();
    await execute(
      `INSERT INTO equipment_items (
         id, eq_code, name, unit_number, parent_id,
         manufacturer_id, model_number, serial_number, asset_class,
         status, condition, location_id, location_detail, notes,
         branch_code, fixed_asset_code, depreciation_years,
         equipment_section, equipment_type_code, location_code,
         purchased_at, warranty_years,
         rack_position, rack_height, rack_slot, rack_side, color_id,
         created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11,$12,$13,$14, $15,$16,$17, $18,$19,$20, $21,$22, $23,$24,$25,$26,$27, $28,$29)`,
      [
        id, eq_code, input.name, input.unit_number ?? null, input.parent_id ?? null,
        input.manufacturer_id ?? null, input.model_number ?? null, input.serial_number ?? null,
        input.asset_class || 'fixed_asset',
        input.status || EQUIPMENT_STATUS.ACTIVE, input.condition || 'good',
        effectiveLocationId, effectiveLocationDetail, input.notes ?? null,
        input.branch_code ?? null, input.fixed_asset_code ?? null, input.depreciation_years ?? null,
        input.equipment_section ?? null, input.equipment_type_code ?? null, input.location_code ?? null,
        input.purchased_at ?? null, input.warranty_years ?? null,
        input.rack_position ?? null, input.rack_height ?? 1, input.rack_slot ?? 'full',
        input.rack_side ?? 'front', input.color_id ?? null,
        userId, userId,
      ],
    );
    return { id, eq_code };
  },

  /** 全フィールド送り直しの PUT。子機材の設置場所も親に合わせて伝播する */
  async update(id: string, input: ItemCreateInput, userId: string | null) {
    await execute(
      `UPDATE equipment_items SET
         name=$1, unit_number=$2, parent_id=$3,
         manufacturer_id=$4, model_number=$5, serial_number=$6, asset_class=$7,
         status=$8, condition=$9, location_id=$10, location_detail=$11, notes=$12,
         branch_code=$13, fixed_asset_code=$14, depreciation_years=$15,
         equipment_section=$16, equipment_type_code=$17, location_code=$18,
         purchased_at=$19, warranty_years=$20,
         rack_position=$21, rack_height=$22, rack_slot=$23, rack_side=$24, color_id=$25,
         updated_by=$26, updated_at=NOW()
       WHERE id=$27 AND deleted_at IS NULL`,
      [
        input.name, input.unit_number ?? null,
        input.parent_id !== undefined ? (input.parent_id ?? null) : null,
        input.manufacturer_id ?? null, input.model_number ?? null, input.serial_number ?? null,
        input.asset_class || 'fixed_asset',
        input.status || EQUIPMENT_STATUS.ACTIVE, input.condition || 'good',
        input.location_id ?? null, input.location_detail ?? null, input.notes ?? null,
        input.branch_code ?? null, input.fixed_asset_code ?? null, input.depreciation_years ?? null,
        input.equipment_section ?? null, input.equipment_type_code ?? null, input.location_code ?? null,
        input.purchased_at ?? null, input.warranty_years ?? null,
        input.rack_position ?? null, input.rack_height ?? 1, input.rack_slot ?? 'full',
        input.rack_side ?? 'front', input.color_id ?? null,
        userId, id,
      ],
    );

    await execute(
      `UPDATE equipment_items SET location_id=$1, location_detail=$2, updated_at=NOW(), updated_by=$3
       WHERE parent_id=$4 AND deleted_at IS NULL`,
      [input.location_id ?? null, input.location_detail ?? null, userId, id],
    );
  },

  /**
   * 部分更新。eq_code 変更は system_admin のみ。
   * location_id / location_detail が含まれていれば子機材にも伝播。
   */
  async patch(
    id: string,
    body: Record<string, unknown>,
    userId: string | null,
    userRole: string | undefined,
  ) {
    if ('eq_code' in body && userRole !== 'system_admin') {
      throw new AppError(403, 'FORBIDDEN', '機材IDの変更は管理者のみ可能です');
    }
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(body)) {
      if (!PATCHABLE_FIELDS.has(key)) continue;
      setClauses.push(`${key}=$${i++}`);
      // 空文字 / undefined は NULL に正規化 (date / numeric カラムでの DB エラー防止)
      params.push(value === '' || value === undefined ? null : value);
    }
    if (setClauses.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', '更新フィールドがありません');
    }
    setClauses.push(`updated_by=$${i++}`, 'updated_at=NOW()');
    params.push(userId);

    await execute(
      `UPDATE equipment_items SET ${setClauses.join(', ')} WHERE id=$${i} AND deleted_at IS NULL`,
      [...params, id],
    );

    if ('location_id' in body || 'location_detail' in body) {
      const loc = (await queryOne(
        'SELECT location_id, location_detail FROM equipment_items WHERE id=$1',
        [id],
      )) as { location_id: string | null; location_detail: string | null } | null;
      if (loc) {
        await execute(
          `UPDATE equipment_items SET location_id=$1, location_detail=$2, updated_at=NOW(), updated_by=$3
           WHERE parent_id=$4 AND deleted_at IS NULL`,
          [loc.location_id, loc.location_detail, userId, id],
        );
      }
    }
  },

  async delete(id: string, userId: string | null) {
    await execute(
      'UPDATE equipment_items SET deleted_at=NOW(), updated_by=$1 WHERE id=$2',
      [userId, id],
    );
  },

  /** グループ単位の貸出設定一括更新 */
  async batchRental(
    ids: string[],
    rental_category_id: string | null,
    rental_display_name: string | null,
    userId: string | null,
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ids は空でない配列を指定してください');
    }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await execute(
      `UPDATE equipment_items SET
         rental_category_id = $${ids.length + 1},
         rental_display_name = $${ids.length + 2},
         updated_at = NOW(), updated_by = $${ids.length + 3}
       WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      [...ids, rental_category_id ?? null, rental_display_name ?? null, userId],
    );
  },

  /** 一括フィールド更新 (管理者専用)。enum バリデーション + ホワイトリスト */
  async bulkUpdate(
    ids: string[],
    fields: Record<string, unknown>,
    userId: string | null,
  ): Promise<{ updated: number }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ids は空でない配列を指定してください');
    }
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'fields が空です');
    }
    for (const [key, allowed] of Object.entries(ENUM_RULES)) {
      if (key in fields && fields[key] !== null && fields[key] !== '') {
        if (!allowed.includes(fields[key] as string)) {
          throw new AppError(400, 'VALIDATION_ERROR', `${key} の値が不正です: ${fields[key]}`);
        }
      }
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_BULK_FIELDS.has(key)) continue;
      setClauses.push(`${key}=$${i++}`);
      params.push(value === '' ? null : value);
    }
    if (setClauses.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', '更新可能なフィールドが指定されていません');
    }
    setClauses.push(`updated_by=$${i++}`);
    params.push(userId);
    setClauses.push('updated_at=NOW()');

    const idPlaceholders = ids.map((_, idx) => `$${i + idx}`).join(',');
    params.push(...ids);

    await execute(
      `UPDATE equipment_items SET ${setClauses.join(', ')} WHERE id IN (${idPlaceholders}) AND deleted_at IS NULL`,
      params,
    );
    return { updated: ids.length };
  },
};
