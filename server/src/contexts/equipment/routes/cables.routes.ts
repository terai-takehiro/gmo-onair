// 機材ケーブル管理 CRUD + Excel I/O + Inline PATCH
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import { queryAll, queryOne, execute, getDb } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  buildExcelWorkbook, excelResponse, parseExcelBuffer, parseExcelHeaders, normalizeHeader,
} from '../../../shared/utils/excel';

const router = Router();
router.use(requireAuth, requirePermission('equipment'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const KIND_VALUES = new Set(['video', 'audio', 'network', 'lighting', 'power', 'other']);
const KIND_LABELS: Record<string, string> = {
  video: '映像', audio: '音声', network: 'NW', lighting: '照明', power: '電源', other: 'その他',
};
const KIND_FROM_LABEL: Record<string, string> = {
  '映像': 'video', '音声': 'audio', 'NW': 'network', 'ネットワーク': 'network',
  '照明': 'lighting', '電源': 'power', 'その他': 'other',
};

function parseKind(v: unknown): string | null {
  const s = String(v ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
  if (!s) return null;
  if (KIND_VALUES.has(s)) return s;
  return KIND_FROM_LABEL[s] || null;
}

const SELECT_SQL = `
  SELECT c.id, c.kind, c.location_id, c.name, c.manufacturer_id, c.model_number,
         c.length_m, c.color, c.quantity, c.storage_method, c.notes, c.sort_order,
         c.created_at, c.updated_at,
         loc.name AS location_name,
         mfr.name AS manufacturer_name
  FROM equipment_cables c
  LEFT JOIN equipment_locations    loc ON loc.id = c.location_id
  LEFT JOIN equipment_manufacturers mfr ON mfr.id = c.manufacturer_id
  WHERE c.deleted_at IS NULL
`;

const EXCEL_COLUMNS = [
  { key: 'kind_label',         header: '種別',     width: 8 },
  { key: 'location_name',      header: '設置場所', width: 16 },
  { key: 'name',               header: '商品名',   width: 28 },
  { key: 'manufacturer_name',  header: 'メーカー', width: 16 },
  { key: 'model_number',       header: '型名',     width: 18 },
  { key: 'length_m',           header: 'メートル', width: 8 },
  { key: 'color',              header: '色',       width: 8 },
  { key: 'quantity',           header: '所有本数', width: 8 },
  { key: 'storage_method',     header: '収納方法', width: 18 },
  { key: 'notes',              header: '備考',     width: 30 },
];

router.get('/', wrap(async (req, res) => {
  const { search, kind, location_id, manufacturer_id } = req.query as Record<string, string | undefined>;
  const params: unknown[] = [];
  let sql = SELECT_SQL;
  let i = 1;
  if (kind && KIND_VALUES.has(kind)) {
    sql += ` AND c.kind = $${i}`; params.push(kind); i += 1;
  }
  if (location_id) {
    sql += ` AND c.location_id = $${i}`; params.push(location_id); i += 1;
  }
  if (manufacturer_id) {
    sql += ` AND c.manufacturer_id = $${i}`; params.push(manufacturer_id); i += 1;
  }
  if (search) {
    sql += ` AND (c.name ILIKE $${i} OR c.model_number ILIKE $${i} OR c.notes ILIKE $${i})`;
    params.push(`%${search}%`); i += 1;
  }
  sql += ' ORDER BY loc.name NULLS LAST, c.name, c.length_m NULLS LAST, c.kind';
  const rows = await queryAll(sql, params);
  res.json({ success: true, data: rows });
}));

const validatePayload = (body: Record<string, unknown>) => {
  const kind = String(body.kind ?? '');
  if (!KIND_VALUES.has(kind)) throw new AppError(400, 'VALIDATION_ERROR', '種別が不正です');
  if (!body.name || !String(body.name).trim()) throw new AppError(400, 'VALIDATION_ERROR', '商品名は必須です');
};

const toNumOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

router.post('/', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  validatePayload(req.body);
  const {
    kind, location_id, name, manufacturer_id, model_number,
    length_m, color, quantity, storage_method, notes, sort_order,
  } = req.body;
  const id = uuid();
  await execute(
    `INSERT INTO equipment_cables
     (id, kind, location_id, name, manufacturer_id, model_number,
      length_m, color, quantity, storage_method, notes, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, kind, location_id || null, String(name).trim(),
      manufacturer_id || null, model_number || null,
      toNumOrNull(length_m), color || null,
      toNumOrNull(quantity) ?? 0, storage_method || null,
      notes || null, toNumOrNull(sort_order) ?? 0,
    ],
  );
  const row = await queryOne(`${SELECT_SQL} AND c.id = $1`, [id]);
  res.status(201).json({ success: true, data: row });
}));

router.put('/:id', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  validatePayload(req.body);
  const {
    kind, location_id, name, manufacturer_id, model_number,
    length_m, color, quantity, storage_method, notes, sort_order,
  } = req.body;
  await execute(
    `UPDATE equipment_cables
     SET kind=$1, location_id=$2, name=$3, manufacturer_id=$4, model_number=$5,
         length_m=$6, color=$7, quantity=$8, storage_method=$9, notes=$10,
         sort_order=$11, updated_at=NOW()
     WHERE id=$12 AND deleted_at IS NULL`,
    [
      kind, location_id || null, String(name).trim(),
      manufacturer_id || null, model_number || null,
      toNumOrNull(length_m), color || null,
      toNumOrNull(quantity) ?? 0, storage_method || null,
      notes || null, toNumOrNull(sort_order) ?? 0,
      req.params.id,
    ],
  );
  const row = await queryOne(`${SELECT_SQL} AND c.id = $1`, [req.params.id]);
  res.json({ success: true, data: row });
}));

// Inline PATCH — 1 セルだけ更新
const PATCHABLE_FIELDS = new Set([
  'name', 'model_number', 'color', 'storage_method', 'notes',
  'length_m', 'quantity', 'kind', 'location_id', 'manufacturer_id',
]);
router.patch('/:id', requirePermission('equipment', 'editor'), wrap(async (req, res) => {
  const updates: [string, unknown][] = [];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!PATCHABLE_FIELDS.has(k)) continue;
    let val: unknown = v;
    if (k === 'length_m' || k === 'quantity') val = toNumOrNull(v);
    if (k === 'location_id' || k === 'manufacturer_id') val = v || null;
    if (k === 'kind' && !KIND_VALUES.has(String(v))) {
      throw new AppError(400, 'VALIDATION_ERROR', '種別が不正です');
    }
    updates.push([k, val ?? null]);
  }
  if (updates.length === 0) {
    return res.json({ success: true, data: null });
  }
  const setSql = updates.map(([k], i) => `${k}=$${i + 1}`).join(', ');
  const params = [...updates.map(([, v]) => v), req.params.id];
  await execute(
    `UPDATE equipment_cables SET ${setSql}, updated_at=NOW() WHERE id=$${updates.length + 1} AND deleted_at IS NULL`,
    params,
  );
  const row = await queryOne(`${SELECT_SQL} AND c.id = $1`, [req.params.id]);
  res.json({ success: true, data: row });
}));

router.delete('/:id', requirePermission('equipment', 'manager'), wrap(async (req, res) => {
  await execute('UPDATE equipment_cables SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// ============================================================
// Excel テンプレート
// ============================================================
router.get('/template', requirePermission('equipment', 'reader'), wrap(async (_req, res) => {
  const buf = await buildExcelWorkbook([
    {
      name: 'ケーブル',
      columns: EXCEL_COLUMNS,
      rows: [
        { kind_label: '映像', location_name: 'サブ1', name: 'HDMIケーブル 3m', manufacturer_name: 'CANARE', model_number: 'HDM03', length_m: 3, color: '黒', quantity: 5, storage_method: 'バスケットA', notes: '' },
        { kind_label: '音声', location_name: 'サブ1', name: 'XLR ケーブル 5m', manufacturer_name: 'CANARE', model_number: 'EC05', length_m: 5, color: '黒', quantity: 10, storage_method: '', notes: '' },
      ],
    },
    {
      name: '記入要領',
      columns: [{ key: 'col', header: '列', width: 14 }, { key: 'desc', header: '説明', width: 60 }],
      rows: [
        { col: '種別', desc: '映像 / 音声 / NW / 照明 / 電源 / その他' },
        { col: '設置場所', desc: '保管場所マスタの名前と一致させてください (未一致は空欄)' },
        { col: '商品名', desc: '必須' },
        { col: 'メーカー', desc: 'メーカーマスタの名前。未登録の場合は自動作成' },
        { col: '型名', desc: '型番・モデル名' },
        { col: 'メートル', desc: '小数可。例: 3, 1.5' },
        { col: '色', desc: '自由記述。例: 黒、青' },
        { col: '所有本数', desc: '整数。例: 10' },
        { col: '収納方法', desc: '保管箱・棚の名称など自由記述' },
        { col: '備考', desc: '自由記述' },
      ],
    },
  ]);
  excelResponse(res, 'ケーブル_テンプレート.xlsx', buf);
}));

// ============================================================
// Excel エクスポート
// ============================================================
router.get('/export-xlsx', requirePermission('equipment', 'exporter'), wrap(async (_req, res) => {
  const items = await queryAll(`${SELECT_SQL} ORDER BY loc.name NULLS LAST, c.name, c.length_m NULLS LAST, c.kind`) as Record<string, unknown>[];
  const rows = items.map((r) => ({
    ...r,
    kind_label: KIND_LABELS[r.kind as string] || r.kind,
  }));
  const buf = await buildExcelWorkbook([{ name: 'ケーブル', columns: EXCEL_COLUMNS, rows }]);
  const today = new Date().toISOString().slice(0, 10);
  excelResponse(res, `ケーブル_${today}.xlsx`, buf);
}));

// ============================================================
// Excel インポートプレビュー
// ============================================================
router.post('/import-preview', requirePermission('equipment', 'editor'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Excelファイルが必要です');
  let detectedHeaders: string[];
  try { detectedHeaders = await parseExcelHeaders(req.file.buffer); }
  catch (e: any) { throw new AppError(400, 'PARSE_ERROR', `Excelの読み込みに失敗しました: ${e?.message || e}`); }
  const normDetected = detectedHeaders.map(normalizeHeader);
  const autoMapping: Record<string, string | null> = {};
  const unmatchedKeys: string[] = [];
  for (const col of EXCEL_COLUMNS) {
    const idx = normDetected.indexOf(normalizeHeader(col.header));
    if (idx >= 0) autoMapping[col.key] = detectedHeaders[idx];
    else { autoMapping[col.key] = null; unmatchedKeys.push(col.key); }
  }
  res.json({
    success: true,
    data: {
      detectedHeaders,
      expectedColumns: EXCEL_COLUMNS.map((c) => ({ key: c.key, header: c.header })),
      autoMapping,
      unmatchedKeys,
    },
  });
}));

// ============================================================
// Excel インポート (dry_run / commit)
// ============================================================
router.post('/import', requirePermission('equipment', 'editor'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Excelファイルが必要です');
  const pickFirst = (v: unknown): string => Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');
  const mode = pickFirst(req.query.mode) || 'dry_run';

  let mapping: Record<string, string | null> | undefined;
  const mappingStr = (req.body && typeof req.body.mapping === 'string') ? req.body.mapping as string : undefined;
  if (mappingStr) {
    try { mapping = JSON.parse(mappingStr); }
    catch (e: any) { throw new AppError(400, 'BAD_MAPPING', `mapping JSONの解析に失敗: ${e?.message || e}`); }
  }

  let rows: Record<string, unknown>[];
  let warnings: string[];
  try { ({ rows, warnings } = await parseExcelBuffer(req.file.buffer, EXCEL_COLUMNS, mapping)); }
  catch (e: any) { throw new AppError(400, 'PARSE_ERROR', `Excelの読み込みに失敗しました: ${e?.message || e}`); }

  const [manufacturers, locations] = await Promise.all([
    queryAll('SELECT id, name FROM equipment_manufacturers WHERE deleted_at IS NULL') as Promise<{ id: string; name: string }[]>,
    queryAll('SELECT id, name FROM equipment_locations WHERE deleted_at IS NULL') as Promise<{ id: string; name: string }[]>,
  ]);
  const mfgMap = new Map(manufacturers.map((m) => [m.name, m.id]));
  const locMap = new Map(locations.map((l) => [l.name, l.id]));

  type VRow = { rowNumber: number; data: Record<string, unknown>; errors: string[] };
  const validated: VRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const errors: string[] = [];
    const rowNumber = i + 2;
    const name = String(r.name ?? '').trim();
    if (!name) errors.push('商品名は必須');
    const kind = parseKind(r.kind_label) ?? 'other';
    if (!parseKind(r.kind_label)) errors.push(`種別 "${r.kind_label}" を認識できません (映像/音声/NW/照明/電源/その他)`);
    const mfgName = String(r.manufacturer_name ?? '').trim() || null;
    const locName = String(r.location_name ?? '').trim() || null;
    const locationId = locName ? (locMap.get(locName) ?? null) : null;
    if (locName && !locationId) warnings.push(`行 ${rowNumber}: 設置場所 "${locName}" が見つかりません — null で登録します`);
    validated.push({
      rowNumber,
      data: {
        kind, name,
        location_id: locationId,
        manufacturer_name: mfgName,
        manufacturer_id: mfgName ? (mfgMap.get(mfgName) ?? null) : null,
        model_number: String(r.model_number ?? '').trim() || null,
        length_m: toNumOrNull(r.length_m),
        color: String(r.color ?? '').trim() || null,
        quantity: toNumOrNull(r.quantity) ?? 0,
        storage_method: String(r.storage_method ?? '').trim() || null,
        notes: String(r.notes ?? '').trim() || null,
      },
      errors,
    });
  }

  const errorCount = validated.filter((v) => v.errors.length > 0).length;
  const summary = {
    total: validated.length,
    insert: validated.filter((v) => !v.errors.length).length,
    update: 0, skip: 0, error: errorCount,
  };

  if (mode === 'dry_run') {
    return res.json({
      success: true,
      data: {
        mode: 'dry_run', summary, warnings,
        rows: validated.map((v) => ({
          rowNumber: v.rowNumber, name: v.data.name, eq_code: null,
          action: v.errors.length ? 'skip' : 'insert',
          errors: v.errors,
        })),
      },
    });
  }

  // COMMIT
  const pool = getDb();
  const client = await pool.connect();
  const inserted: { name: string }[] = [];
  try {
    await client.query('BEGIN');
    // メーカー自動作成
    for (const v of validated) {
      if (v.errors.length) continue;
      const mName = v.data.manufacturer_name as string | null;
      if (mName && !v.data.manufacturer_id) {
        if (!mfgMap.has(mName)) {
          const mId = uuid();
          await client.query('INSERT INTO equipment_manufacturers (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [mId, mName]);
          const row = await client.query('SELECT id FROM equipment_manufacturers WHERE name = $1', [mName]);
          mfgMap.set(mName, row.rows[0]?.id || mId);
        }
        v.data.manufacturer_id = mfgMap.get(mName)!;
      }
    }
    for (const v of validated) {
      if (v.errors.length) continue;
      const d = v.data;
      const id = uuid();
      await client.query(
        `INSERT INTO equipment_cables
         (id, kind, location_id, name, manufacturer_id, model_number,
          length_m, color, quantity, storage_method, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, d.kind, d.location_id, d.name, d.manufacturer_id, d.model_number,
         d.length_m, d.color, d.quantity, d.storage_method, d.notes],
      );
      inserted.push({ name: String(d.name) });
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  res.json({
    success: true,
    data: { mode: 'commit', summary, inserted, updated: [] },
  });
}));

export default router;
