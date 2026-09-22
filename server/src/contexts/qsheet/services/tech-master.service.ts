/**
 * 技術資料のマスタ — パッチ盤（`qsheet_patch_panels` / `qsheet_patch_jacks`）と
 * 会社・技術人員（`qsheet_tech_companies` / `qsheet_tech_persons`）。
 * 設計: docs/design/v4/tech-docs.md §5-1・§5-5・§9。
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
import { queryAll, queryOne, execute, type Row } from '../../../shared/db/connection';
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

/** 盤を1枚足す（manager）。空のパッチ番号（ch数 × A/B の2段）も一緒に作る */
export async function createPanel(input: CreatePanelInput, userId: string): Promise<Row> {
  const name = (input.name || '').trim();
  if (!name) throw new ValidationError('盤の名前を指定してください');
  const jackCount = Number(input.jack_count);
  if (jackCount !== 32 && jackCount !== 48) throw new ValidationError('ch数は 32 か 48 を指定してください');
  const kind = input.kind === 'trunk' ? 'trunk' : 'jack';

  const existing = await queryOne('SELECT id FROM qsheet_patch_panels WHERE name = $1', [name]);
  if (existing) throw new ValidationError('同じ名前の盤があります');

  const id = uuid();
  const next = await queryOne('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM qsheet_patch_panels');
  await execute(
    `INSERT INTO qsheet_patch_panels (id, name, jack_count, kind, location, model, sort_order, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, name, jackCount, kind, (input.location || '').slice(0, 200), (input.model || '').slice(0, 200), Number(next?.n ?? 1), userId],
  );
  // 空のパッチ番号（id の付け方は migration 305 と同じ: pj_vjp100_01a）
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let n = 1; n <= jackCount; n++) {
    for (const jrow of ['A', 'B']) {
      await execute(
        'INSERT INTO qsheet_patch_jacks (id, panel_id, jack_no, jack_row) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [`pj_${slug}_${String(n).padStart(2, '0')}${jrow.toLowerCase()}`, id, n, jrow],
      );
    }
  }
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
      if (f === 'name' && !v.trim()) throw new ValidationError('盤の名前を指定してください');
      sets.push(`${f} = $${params.push(v)}`);
    }
  }
  sets.push(`updated_by = $${params.push(userId)}`);
  const updated = await queryOne(
    `UPDATE qsheet_patch_panels SET ${sets.join(', ')} WHERE id = $${params.push(id)} RETURNING id`,
    params,
  );
  if (!updated) throw new NotFoundError('盤が見つかりません');
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
// 会社
// ============================================================

export async function listCompanies(): Promise<Row[]> {
  return queryAll(`
    SELECT c.id, c.name, c.short_name, c.company_id, c.sort_order, c.note,
           (SELECT COUNT(*) FROM qsheet_tech_persons p
             WHERE p.tech_company_id = c.id AND p.deleted_at IS NULL) AS person_count
    FROM qsheet_tech_companies c
    WHERE c.deleted_at IS NULL
    ORDER BY c.sort_order, c.name
  `);
}

async function getCompany(id: string): Promise<Row | undefined> {
  const rows = await listCompanies();
  return rows.find((r) => r.id === id);
}

export async function createCompany(body: Record<string, unknown>): Promise<Row> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new ValidationError('会社の名前を指定してください');
  const id = uuid();
  const next = await queryOne('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM qsheet_tech_companies');
  await execute(
    `INSERT INTO qsheet_tech_companies (id, name, short_name, company_id, sort_order, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name.slice(0, 200), typeof body.short_name === 'string' ? body.short_name.slice(0, 200) : '',
      typeof body.company_id === 'string' && body.company_id ? body.company_id : null,
      Number(next?.n ?? 1), typeof body.note === 'string' ? body.note.slice(0, 2000) : ''],
  );
  const row = await getCompany(id);
  if (!row) throw new Error('createCompany: INSERT 直後の SELECT が空でした');
  return row;
}

export async function updateCompany(id: string, body: Record<string, unknown>): Promise<Row> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  for (const f of ['name', 'short_name', 'note'] as const) {
    if (f in body) {
      const v = typeof body[f] === 'string' ? (body[f] as string).slice(0, f === 'note' ? 2000 : 200) : '';
      if (f === 'name' && !v.trim()) throw new ValidationError('会社の名前を指定してください');
      sets.push(`${f} = $${params.push(v)}`);
    }
  }
  if ('company_id' in body) {
    sets.push(`company_id = $${params.push(typeof body.company_id === 'string' && body.company_id ? body.company_id : null)}`);
  }
  if ('sort_order' in body) sets.push(`sort_order = $${params.push(Number(body.sort_order) || 0)}`);
  const updated = await queryOne(
    `UPDATE qsheet_tech_companies SET ${sets.join(', ')} WHERE id = $${params.push(id)} AND deleted_at IS NULL RETURNING id`,
    params,
  );
  if (!updated) throw new NotFoundError('会社が見つかりません');
  const row = await getCompany(id);
  if (!row) throw new Error('updateCompany: UPDATE 直後の SELECT が空でした');
  return row;
}

/** 論理削除。人が残っている会社は消さない（資料の中の名前は写してあるので消えない） */
export async function deleteCompany(id: string): Promise<void> {
  const person = await queryOne(
    'SELECT 1 FROM qsheet_tech_persons WHERE tech_company_id = $1 AND deleted_at IS NULL LIMIT 1',
    [id],
  );
  if (person) throw new ValidationError('この会社の技術人員が残っています。先に人を削除してください');
  const deleted = await queryOne(
    'UPDATE qsheet_tech_companies SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [id],
  );
  if (!deleted) throw new NotFoundError('会社が見つかりません');
}

// ============================================================
// 技術人員
// ============================================================

const PERSON_SELECT = `
  SELECT p.id, p.tech_company_id, p.name, p.kana, p.main_roles, p.active, p.partner_id, p.note,
         c.name AS company_name, c.short_name AS company_short_name,
         (SELECT COUNT(DISTINCT (s.tech_doc_id, s.work_date)) FROM qsheet_tech_staff_rows s
           WHERE s.person_id = p.id) AS participation_count,
         (SELECT to_char(MAX(s.work_date), 'YYYY-MM-DD') FROM qsheet_tech_staff_rows s
           WHERE s.person_id = p.id) AS last_work_date
  FROM qsheet_tech_persons p
  JOIN qsheet_tech_companies c ON p.tech_company_id = c.id
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
  if (filter.company) sql += ` AND p.tech_company_id = $${params.push(filter.company)}`;
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
  if (!name) throw new ValidationError('名前を指定してください');
  const companyId = typeof body.tech_company_id === 'string' ? body.tech_company_id : '';
  if (!companyId) throw new ValidationError('会社を指定してください');
  const company = await queryOne('SELECT id FROM qsheet_tech_companies WHERE id = $1 AND deleted_at IS NULL', [companyId]);
  if (!company) throw new NotFoundError('会社が見つかりません');

  const id = uuid();
  await execute(
    `INSERT INTO qsheet_tech_persons (id, tech_company_id, name, kana, main_roles, active, partner_id, note)
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
      if (f === 'name' && !v.trim()) throw new ValidationError('名前を指定してください');
      sets.push(`${f} = $${params.push(v)}`);
    }
  }
  if ('tech_company_id' in body) {
    const companyId = typeof body.tech_company_id === 'string' ? body.tech_company_id : '';
    const company = await queryOne('SELECT id FROM qsheet_tech_companies WHERE id = $1 AND deleted_at IS NULL', [companyId]);
    if (!company) throw new NotFoundError('会社が見つかりません');
    sets.push(`tech_company_id = $${params.push(companyId)}`);
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
