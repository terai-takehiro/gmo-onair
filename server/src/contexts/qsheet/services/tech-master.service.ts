/**
 * 技術資料のマスタ — パッチ盤（`qsheet_patch_panels` / `qsheet_patch_jacks`）と
 * 会社・技術人員（会社は案件管理の取引先 `companies`・人は `qsheet_tech_persons`）。
 * 設計: docs/design/v4/tech-docs.md §5-1・§5-5・§9・§13-5（会社は取引先を使う・migration 307）。
 *
 * 組織共通のマスタなので案件には紐づかない（行の可視性は `qsheet` reader 以上で一律）。
 * 書き込みは manager だけ——権限はルーター側（`tech-masters.routes.ts`）で見る。
 *
 * ⚠️ 数えて出すもの（列に持たないもの。§5-1）:
 *   - 盤の「転記の進み」= `filled_count`（**番号の数**。A段/B段のどちらかに機材名が
 *     入っている `jack_no` を DISTINCT で数える。行数 48×2＝96 ではない）
 *   - 人の「参加回数」= `participation_count`（`COUNT(DISTINCT (tech_doc_id, work_date))`）
 * ⚠️ 返り値は `pg` の行のまま（snake_case）。`shared/src/tech/types.ts` がその形。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, withTransaction, type Row } from '../../../shared/db/connection';
import { createVendorRecord } from '../../../shared/services/company-directory.service';
import { NotFoundError, ValidationError } from './httpErrors';

const PANEL_COLUMNS = `
  p.id, p.name, p.jack_count, p.kind, p.location, p.model, p.note, p.sort_order, p.updated_at
`;
const JACK_COLUMNS = `
  id, panel_id, jack_no, jack_row, device_name, label, signal, area, note, updated_at
`;

// ============================================================
// パッチ盤
// ============================================================

/** 盤の一覧（`PatchPanelListItem[]`。転記の進みと使用中の目安を添える） */
export async function listPanels(): Promise<Row[]> {
  return queryAll(`
    SELECT ${PANEL_COLUMNS},
           (SELECT COUNT(DISTINCT j.jack_no) FROM qsheet_patch_jacks j
             WHERE j.panel_id = p.id AND j.device_name <> '') AS filled_count,
           (SELECT COUNT(*) FROM qsheet_tech_patch_rows r
             WHERE EXISTS (SELECT 1 FROM qsheet_patch_jacks j2
                            WHERE j2.panel_id = p.id AND (j2.id = r.from_jack_id OR j2.id = r.to_jack_id))) AS used_count
    FROM qsheet_patch_panels p
    ORDER BY p.sort_order, p.name
  `);
}

export async function getPanel(id: string): Promise<Row | undefined> {
  return queryOne(`SELECT ${PANEL_COLUMNS} FROM qsheet_patch_panels p WHERE p.id = $1`, [id]);
}

/** 盤1枚＋パッチ番号の一覧（`PatchPanelDetail`。jack_no, jack_row 順） */
export async function getPanelDetail(id: string): Promise<{ panel: Row; jacks: Row[] } | undefined> {
  const panel = await getPanel(id);
  if (!panel) return undefined;
  const jacks = await queryAll(
    `SELECT ${JACK_COLUMNS} FROM qsheet_patch_jacks WHERE panel_id = $1 ORDER BY jack_no, jack_row`,
    [id],
  );
  return { panel, jacks };
}

/**
 * 機材の候補（`PatchDeviceOption[]`）。機材名が空でないパッチ番号を機材名で束ねる。
 * **`/:id` より先にルートを定義する**（`devices` が id として食われないように）。
 */
export async function listDeviceOptions(): Promise<Array<{
  device_name: string; area: string;
  jacks: Array<{ id: string; panel_id: string; jack_no: number; jack_row: string; label: string; signal: string; panel_name: string }>;
}>> {
  const rows = await queryAll(`
    SELECT j.id, j.panel_id, j.jack_no, j.jack_row, j.label, j.signal, j.area, j.device_name,
           p.name AS panel_name
    FROM qsheet_patch_jacks j
    JOIN qsheet_patch_panels p ON j.panel_id = p.id
    WHERE j.device_name <> ''
    ORDER BY j.device_name, p.sort_order, j.jack_no, j.jack_row
  `);

  const byDevice = new Map<string, {
    device_name: string; area: string;
    jacks: Array<{ id: string; panel_id: string; jack_no: number; jack_row: string; label: string; signal: string; panel_name: string }>;
  }>();
  for (const r of rows) {
    const name = r.device_name as string;
    let entry = byDevice.get(name);
    if (!entry) {
      entry = { device_name: name, area: '', jacks: [] };
      byDevice.set(name, entry);
    }
    if (!entry.area && r.area) entry.area = r.area as string;
    entry.jacks.push({
      id: r.id as string,
      panel_id: r.panel_id as string,
      jack_no: Number(r.jack_no),
      jack_row: r.jack_row as string,
      label: (r.label as string) ?? '',
      signal: (r.signal as string) ?? '',
      panel_name: r.panel_name as string,
    });
  }
  return [...byDevice.values()];
}

export interface CreatePanelInput {
  name: string;
  jack_count: number;
  kind: string;
  location: string;
  model: string;
}

/**
 * 画面から足した盤のパッチ番号の id。**盤の id（uuid）から作る**。
 * ⚠️ 盤の名前から作ってはいけない——以前は名前を英数字だけに削った slug を使っていたため、
 *    日本語だけの名前（slug が空）や `A-B` と `AB` が同じ id になり、2枚目の盤は
 *    `ON CONFLICT DO NOTHING` で番号が1つも作られなかった（レビュー指摘）。
 *    migration 305 が入れた盤（`pj_vjp100_01a` の形）はそのまま。
 */
export function patchJackId(panelId: string, jackNo: number, jackRow: 'A' | 'B'): string {
  return `pj_${panelId}_${String(jackNo).padStart(2, '0')}${jackRow.toLowerCase()}`;
}

/** 盤を1枚足す（manager）。空のパッチ番号（ch数 × A/B の2段）も一緒に作る */
export async function createPanel(input: CreatePanelInput, userId: string): Promise<Row> {
  const name = (input.name || '').trim();
  if (!name) throw new ValidationError('パッチ盤の名前を入力してください');
  const jackCount = Number(input.jack_count);
  if (jackCount !== 32 && jackCount !== 48) throw new ValidationError('ch数は 32 または 48 を選択してください');
  const kind = input.kind === 'trunk' ? 'trunk' : 'jack';

  const existing = await queryOne('SELECT id FROM qsheet_patch_panels WHERE name = $1', [name]);
  if (existing) throw new ValidationError('同じ名前のパッチ盤があります。別の名前を入力してください');

  const id = uuid();
  // 盤と空のパッチ番号を1つのトランザクションで作る（途中で落ちて番号が欠けた盤を残さない）
  await withTransaction(async (tx) => {
    const next = await tx.queryOne('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM qsheet_patch_panels');
    await tx.execute(
      `INSERT INTO qsheet_patch_panels (id, name, jack_count, kind, location, model, sort_order, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, jackCount, kind, (input.location || '').slice(0, 200), (input.model || '').slice(0, 200), Number(next?.n ?? 1), userId],
    );
    for (let n = 1; n <= jackCount; n++) {
      for (const jrow of ['A', 'B'] as const) {
        // ⚠️ ON CONFLICT DO NOTHING を付けない。ぶつかったら黙って番号の無い盤を残すより、失敗させて巻き戻す
        await tx.execute(
          'INSERT INTO qsheet_patch_jacks (id, panel_id, jack_no, jack_row) VALUES ($1, $2, $3, $4)',
          [patchJackId(id, n, jrow), id, n, jrow],
        );
      }
    }
  });
  const row = await getPanel(id);
  if (!row) throw new Error('createPanel: INSERT 直後の SELECT が空でした');
  return row;
}

const PANEL_TEXT_FIELDS = ['name', 'location', 'model', 'note'] as const;

/** 盤の名前・場所・型番・備考を直す（manager） */
export async function updatePanel(id: string, userId: string, body: Record<string, unknown>): Promise<Row> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  for (const f of PANEL_TEXT_FIELDS) {
    if (f in body) {
      const v = typeof body[f] === 'string' ? (body[f] as string).slice(0, 500) : '';
      if (f === 'name' && !v.trim()) throw new ValidationError('パッチ盤の名前を入力してください');
      sets.push(`${f} = $${params.push(v)}`);
    }
  }
  sets.push(`updated_by = $${params.push(userId)}`);
  const updated = await queryOne(
    `UPDATE qsheet_patch_panels SET ${sets.join(', ')} WHERE id = $${params.push(id)} RETURNING id`,
    params,
  );
  if (!updated) throw new NotFoundError('パッチ盤が見つかりません');
  const row = await getPanel(id);
  if (!row) throw new Error('updatePanel: UPDATE 直後の SELECT が空でした');
  return row;
}

const JACK_TEXT_FIELDS = ['device_name', 'label', 'signal', 'area', 'note'] as const;

/** 1ch の転記（manager）。将来「外観図から転記する」を足すときも同じ口を呼ぶ（§9-1） */
export async function updateJack(panelId: string, jackId: string, userId: string, body: Record<string, unknown>): Promise<Row> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  for (const f of JACK_TEXT_FIELDS) {
    if (f in body) {
      const v = typeof body[f] === 'string' ? (body[f] as string).slice(0, f === 'note' ? 2000 : 200) : '';
      sets.push(`${f} = $${params.push(v)}`);
    }
  }
  sets.push(`updated_by = $${params.push(userId)}`);
  const updated = await queryOne(
    `UPDATE qsheet_patch_jacks SET ${sets.join(', ')} WHERE id = $${params.push(jackId)} AND panel_id = $${params.push(panelId)} RETURNING id`,
    params,
  );
  if (!updated) throw new NotFoundError('パッチ番号が見つかりません');
  const row = await queryOne(`SELECT ${JACK_COLUMNS} FROM qsheet_patch_jacks WHERE id = $1`, [jackId]);
  if (!row) throw new Error('updateJack: UPDATE 直後の SELECT が空でした');
  return row;
}

// ============================================================
// 会社（= 案件管理の取引先 `companies`。§13-5・migration 307）
// ============================================================

/*
 * ⚠️ `companies` は案件管理（sales）の持ち物で、`GET /companies` は `requirePermission('sales')`。
 *    techops の利用者が sales を持つとは限らないので、ここは **qsheet 権限のまま
 *    読むのに要る列（id・name・short_name・人数）だけ**を出す（連絡先・支払条件などは出さない）。
 *    取引先の名前の変更・削除は案件管理で行う（techops からは直さない）。
 */
const COMPANY_SELECT = `
  SELECT co.id, co.name, COALESCE(co.short_name, '') AS short_name,
         (SELECT COUNT(*) FROM qsheet_tech_persons p
           WHERE p.company_id = co.id AND p.deleted_at IS NULL)::int AS person_count
  FROM companies co
`;

/**
 * 技術人員の会社の候補（`TechCompany[]`）。**技術人員が1人以上いる会社、または仕入先**
 * （`is_vendor`）で、削除されていないもの。人数の多い順 → 名前順。
 */
export async function listCompanies(): Promise<Row[]> {
  return queryAll(`
    SELECT * FROM (${COMPANY_SELECT}
      WHERE co.deleted_at IS NULL
        AND (co.is_vendor = TRUE
             OR EXISTS (SELECT 1 FROM qsheet_tech_persons p2
                         WHERE p2.company_id = co.id AND p2.deleted_at IS NULL))
    ) t
    ORDER BY t.person_count DESC, t.name
  `);
}

async function getCompany(id: string): Promise<Row | undefined> {
  return queryOne(`${COMPANY_SELECT} WHERE co.id = $1 AND co.deleted_at IS NULL`, [id]);
}

/**
 * 協力会社を取引先に足す（manager）。**同じ名前の取引先が既にあればそれを返す**（二重に作らない）。
 *
 * ⚠️ techops から `companies` に行を作るのはここだけ。§13-5 の決定（2026-09-23・利用者のご判断）で
 *    「技術人員の会社は取引先そのもの」になり、⑥の「会社を追加」を残すために
 *    **仕入先（is_vendor）として名前と短い名前だけを登録する**道を認めてもらったもの。
 *    登録は `company-directory.service.ts`（取引先の登録の唯一の入口）を通す。
 */
export async function createCompany(body: Record<string, unknown>, userId: string): Promise<Row> {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  if (!name) throw new ValidationError('会社の名前を入力してください');
  const shortName = typeof body.short_name === 'string' ? body.short_name.trim().slice(0, 200) : '';

  const id = await withTransaction(async (tx) => {
    const existing = await tx.queryOne(
      'SELECT id FROM companies WHERE name = $1 AND deleted_at IS NULL ORDER BY created_at, id LIMIT 1',
      [name],
    );
    if (existing) return existing.id as string;
    const newId = await createVendorRecord({ name }, userId, (sql, params) => tx.execute(sql, params));
    // `createVendorRecord` は仕入先の画面に合わせて短い名前を持たないので、ここで足す
    if (shortName) await tx.execute('UPDATE companies SET short_name = $1 WHERE id = $2', [shortName, newId]);
    return newId;
  });
  const row = await getCompany(id);
  if (!row) throw new Error('createCompany: INSERT 直後の SELECT が空でした');
  return row;
}

async function assertCompany(companyId: string): Promise<void> {
  const company = await queryOne('SELECT id FROM companies WHERE id = $1 AND deleted_at IS NULL', [companyId]);
  if (!company) throw new NotFoundError('会社が見つかりません');
}

// ============================================================
// 技術人員
// ============================================================

const PERSON_SELECT = `
  SELECT p.id, p.company_id, p.name, p.kana, p.main_roles, p.active, p.partner_id, p.note,
         COALESCE(c.name, '') AS company_name, COALESCE(c.short_name, '') AS company_short_name,
         (SELECT COUNT(DISTINCT (s.tech_doc_id, s.work_date)) FROM qsheet_tech_staff_rows s
           WHERE s.person_id = p.id) AS participation_count,
         (SELECT to_char(MAX(s.work_date), 'YYYY-MM-DD') FROM qsheet_tech_staff_rows s
           WHERE s.person_id = p.id) AS last_work_date
  FROM qsheet_tech_persons p
  LEFT JOIN companies c ON p.company_id = c.id
`;

export interface PersonFilter {
  company?: string;
  q?: string;
  role?: string;
  include_inactive?: boolean;
}

/** 人の一覧（既定は active のみ・参加回数の多い順 → 名前順） */
export async function listPersons(filter: PersonFilter): Promise<Row[]> {
  const params: unknown[] = [];
  let sql = `${PERSON_SELECT} WHERE p.deleted_at IS NULL`;
  if (!filter.include_inactive) sql += ' AND p.active';
  if (filter.company) sql += ` AND p.company_id = $${params.push(filter.company)}`;
  if (filter.q) {
    const n = params.push(`%${filter.q}%`);
    sql += ` AND (p.name ILIKE $${n} OR p.kana ILIKE $${n} OR c.name ILIKE $${n} OR c.short_name ILIKE $${n})`;
  }
  if (filter.role) sql += ` AND $${params.push(filter.role)} = ANY(p.main_roles)`;
  sql += ' ORDER BY participation_count DESC, p.name';
  return queryAll(sql, params);
}

async function getPerson(id: string): Promise<Row | undefined> {
  return queryOne(`${PERSON_SELECT} WHERE p.id = $1 AND p.deleted_at IS NULL`, [id]);
}

function roles(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 50)) : [];
}

export async function createPerson(body: Record<string, unknown>): Promise<Row> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new ValidationError('名前を入力してください');
  const companyId = typeof body.company_id === 'string' ? body.company_id : '';
  if (!companyId) throw new ValidationError('会社を選択してください');
  await assertCompany(companyId);

  const id = uuid();
  await execute(
    `INSERT INTO qsheet_tech_persons (id, company_id, name, kana, main_roles, active, partner_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, companyId, name.slice(0, 200), typeof body.kana === 'string' ? body.kana.slice(0, 200) : '',
      roles(body.main_roles), body.active === false ? false : true,
      typeof body.partner_id === 'string' && body.partner_id ? body.partner_id : null,
      typeof body.note === 'string' ? body.note.slice(0, 2000) : ''],
  );
  const row = await getPerson(id);
  if (!row) throw new Error('createPerson: INSERT 直後の SELECT が空でした');
  return row;
}

export async function updatePerson(id: string, body: Record<string, unknown>): Promise<Row> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  for (const f of ['name', 'kana', 'note'] as const) {
    if (f in body) {
      const v = typeof body[f] === 'string' ? (body[f] as string).slice(0, f === 'note' ? 2000 : 200) : '';
      if (f === 'name' && !v.trim()) throw new ValidationError('名前を入力してください');
      sets.push(`${f} = $${params.push(v)}`);
    }
  }
  if ('company_id' in body) {
    const companyId = typeof body.company_id === 'string' ? body.company_id : '';
    await assertCompany(companyId);
    sets.push(`company_id = $${params.push(companyId)}`);
  }
  if ('main_roles' in body) sets.push(`main_roles = $${params.push(roles(body.main_roles))}`);
  if ('active' in body) sets.push(`active = $${params.push(body.active !== false)}`);
  if ('partner_id' in body) {
    sets.push(`partner_id = $${params.push(typeof body.partner_id === 'string' && body.partner_id ? body.partner_id : null)}`);
  }
  const updated = await queryOne(
    `UPDATE qsheet_tech_persons SET ${sets.join(', ')} WHERE id = $${params.push(id)} AND deleted_at IS NULL RETURNING id`,
    params,
  );
  if (!updated) throw new NotFoundError('技術人員が見つかりません');
  const row = await getPerson(id);
  if (!row) throw new Error('updatePerson: UPDATE 直後の SELECT が空でした');
  return row;
}

/** 論理削除（資料の行に写した名前は残る。§5-2） */
export async function deletePerson(id: string): Promise<void> {
  const deleted = await queryOne(
    'UPDATE qsheet_tech_persons SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [id],
  );
  if (!deleted) throw new NotFoundError('技術人員が見つかりません');
}
