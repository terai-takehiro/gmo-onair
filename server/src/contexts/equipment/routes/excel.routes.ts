// Excel import / export / template / QR code endpoints for equipment.
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import QRCode from 'qrcode';
import { queryAll, queryOne, getDb } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { buildExcelWorkbook, excelResponse, parseExcelBuffer, SheetSpec } from '../../../shared/utils/excel';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// ============================================================
// QRコード (auth不要 — <img src>から呼ばれるため)
// 先に登録して以降のrequireAuthガードを通さない
// ============================================================
router.get('/items/:id/qr', wrap(async (req, res) => {
  const item = await queryOne(
    'SELECT eq_code, name FROM equipment_items WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id],
  ) as { eq_code: string; name: string } | undefined;
  if (!item) throw new AppError(404, 'NOT_FOUND', '機材が見つかりません');

  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${clientUrl}/equipment/items/${req.params.id}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
}));

// 以下、認証必須
router.use(requireAuth);

// メモリ上で受け取り (5MB制限 — 数千行までの想定)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ============================================================
// 機材アイテム Excel カラム定義
// ============================================================
const ITEM_COLUMNS = [
  { key: 'eq_code',             header: 'EQコード',         width: 16 },
  { key: 'name',                header: '機材名',           width: 30 },
  { key: 'category_name',       header: 'カテゴリ',         width: 20 },
  { key: 'item_type',           header: '種別',             width: 10 }, // facility|rental
  { key: 'manufacturer',        header: 'メーカー',         width: 18 },
  { key: 'model_number',        header: '型番',             width: 18 },
  { key: 'serial_number',       header: 'シリアル番号',     width: 18 },
  { key: 'unit_number',         header: '台数番号',         width: 10 },
  { key: 'asset_number',        header: '資産番号',         width: 14 },
  { key: 'acquisition_date',    header: '取得日',           width: 12 },
  { key: 'acquisition_cost',    header: '取得価額',         width: 12 },
  { key: 'depreciation_method', header: '減価償却方法',     width: 14 }, // straight_line|declining|none
  { key: 'useful_life',         header: '耐用年数',         width: 10 },
  { key: 'book_value',          header: '帳簿価額',         width: 12 },
  { key: 'asset_class',         header: '資産区分',         width: 14 }, // fixed_asset|consumable|low_value
  { key: 'status',              header: 'ステータス',       width: 12 }, // active|in_repair|retired|disposed|lost
  { key: 'condition',           header: 'コンディション',   width: 12 }, // excellent|good|fair|poor
  { key: 'location_name',       header: '保管場所',         width: 18 },
  { key: 'location_detail',     header: '保管場所詳細',     width: 18 },
  { key: 'is_lendable',         header: '貸出可',           width: 8 },  // TRUE|FALSE / 1|0
  { key: 'description',         header: '説明',             width: 30 },
  { key: 'notes',               header: '備考',             width: 30 },
];

// 値の正規化
function normItemType(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'rental' || s === '貸出' || s === 'レンタル') return 'rental';
  return 'facility';
}
function normStatus(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    active: 'active', '稼働中': 'active', '稼働': 'active',
    in_repair: 'in_repair', '修理中': 'in_repair', '修理': 'in_repair',
    retired: 'retired', '引退': 'retired',
    disposed: 'disposed', '廃棄': 'disposed',
    lost: 'lost', '紛失': 'lost',
  };
  return map[s] || 'active';
}
function normCondition(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  const map: Record<string, string> = {
    excellent: 'excellent', '優良': 'excellent', '優': 'excellent',
    good: 'good', '良好': 'good', '良': 'good',
    fair: 'fair', '可': 'fair',
    poor: 'poor', '不良': 'poor',
  };
  return map[s] || 'good';
}
function normBool(v: unknown): boolean {
  if (v == null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'はい' || s === '○' || s === 'yes';
}
function normDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // Excel数値日付
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // YYYY-MM-DD or YYYY/MM/DD
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}
function normInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ============================================================
// テンプレートDL
// ============================================================
router.get('/items/template', requirePermission('equipment', 'reader'), wrap(async (_req, res) => {
  const sheets: SheetSpec[] = [
    {
      name: '機材リスト',
      columns: ITEM_COLUMNS,
      rows: [
        {
          eq_code: '', name: 'CANON EOS R5 (サンプル)', category_name: 'カメラ', item_type: 'rental',
          manufacturer: 'Canon', model_number: 'EOS R5', serial_number: 'SN12345', unit_number: '1',
          asset_number: 'A-001', acquisition_date: '2025-04-01', acquisition_cost: 500000,
          depreciation_method: 'straight_line', useful_life: 5, book_value: 400000, asset_class: 'fixed_asset',
          status: 'active', condition: 'excellent',
          location_name: '用賀スタジオ', location_detail: '機材庫A棚3段目',
          is_lendable: 'TRUE', description: '4K動画対応ミラーレス', notes: '',
        },
      ],
    },
    {
      name: '入力ガイド',
      columns: [
        { key: 'col', header: '項目', width: 24 },
        { key: 'desc', header: '説明', width: 60 },
      ],
      rows: [
        { col: 'EQコード', desc: '空欄なら自動採番(EQ-XXXXXXXXXX)。既存コードを指定すると更新モードになります(--mode=update時)' },
        { col: '機材名', desc: '【必須】' },
        { col: 'カテゴリ', desc: 'マスタ登録済みのカテゴリ名と完全一致 (大文字/小文字区別)' },
        { col: '種別', desc: 'facility (設備) または rental (貸出)。日本語OK' },
        { col: '保管場所', desc: 'マスタ登録済みのロケーション名と完全一致' },
        { col: 'ステータス', desc: 'active / in_repair / retired / disposed / lost (日本語OK: 稼働中/修理中/引退/廃棄/紛失)' },
        { col: 'コンディション', desc: 'excellent / good / fair / poor (日本語OK: 優良/良好/可/不良)' },
        { col: '減価償却方法', desc: 'straight_line (定額) / declining (定率) / none (なし)' },
        { col: '資産区分', desc: 'fixed_asset / consumable / low_value' },
        { col: '貸出可', desc: 'TRUE / FALSE (または 1 / 0)' },
        { col: '取得日', desc: 'YYYY-MM-DD 形式。Excel日付セルでも可' },
      ],
    },
  ];
  const buf = buildExcelWorkbook(sheets);
  excelResponse(res, '機材リスト_テンプレート.xlsx', buf);
}));

// ============================================================
// Excel エクスポート (日本語ヘッダー)
// ============================================================
router.get('/items/export-xlsx', requirePermission('equipment', 'exporter'), wrap(async (_req, res) => {
  const items = await queryAll(`
    SELECT ei.eq_code, ei.name, ec.name as category_name, ei.item_type,
           ei.manufacturer, ei.model_number, ei.serial_number, ei.unit_number,
           ei.asset_number, ei.acquisition_date, ei.acquisition_cost,
           ei.depreciation_method, ei.useful_life, ei.book_value, ei.asset_class,
           ei.status, ei.condition, el.name as location_name, ei.location_detail,
           ei.is_lendable, ei.description, ei.notes
    FROM equipment_items ei
    LEFT JOIN equipment_categories ec ON ec.id = ei.category_id AND ec.deleted_at IS NULL
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL
    ORDER BY ec.sort_order, ec.name, ei.name, ei.unit_number
  `) as Record<string, unknown>[];

  // is_lendable を TRUE/FALSE に
  const rows = items.map((r) => ({
    ...r,
    is_lendable: r.is_lendable ? 'TRUE' : 'FALSE',
  }));

  const buf = buildExcelWorkbook([
    { name: '機材リスト', columns: ITEM_COLUMNS, rows },
  ]);
  const today = new Date().toISOString().slice(0, 10);
  excelResponse(res, `機材リスト_${today}.xlsx`, buf);
}));

// ============================================================
// Excel インポート (検証 + コミット)
// POST /equipment/items/import?mode=dry_run|commit&duplicate=skip|update|error
// ============================================================
router.post('/items/import', requirePermission('equipment', 'editor'), upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) throw new AppError(400, 'NO_FILE', 'Excelファイルが必要です');
    const mode = (req.query.mode as string) || 'dry_run';
    const duplicateMode = (req.query.duplicate as string) || 'skip';

    const { rows, warnings } = parseExcelBuffer(req.file.buffer, ITEM_COLUMNS);

    // マスタ事前ロード
    const categories = await queryAll('SELECT id, name FROM equipment_categories WHERE deleted_at IS NULL') as { id: string; name: string }[];
    const locations = await queryAll('SELECT id, name FROM equipment_locations WHERE deleted_at IS NULL') as { id: string; name: string }[];
    const catMap = new Map(categories.map((c) => [c.name, c.id]));
    const locMap = new Map(locations.map((l) => [l.name, l.id]));

    type ValidatedRow = {
      rowNumber: number;
      data: Record<string, unknown>;
      errors: string[];
      action: 'insert' | 'update' | 'skip';
      existingId?: string;
    };

    const validated: ValidatedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const errors: string[] = [];
      const rowNumber = i + 2; // ヘッダー行を考慮

      const name = String(r.name ?? '').trim();
      if (!name) errors.push('機材名は必須');

      // カテゴリlookup
      let categoryId: string | null = null;
      if (r.category_name) {
        const id = catMap.get(String(r.category_name).trim());
        if (!id) errors.push(`カテゴリ "${r.category_name}" がマスタに存在しません`);
        else categoryId = id;
      }

      // ロケーションlookup
      let locationId: string | null = null;
      if (r.location_name) {
        const id = locMap.get(String(r.location_name).trim());
        if (!id) errors.push(`保管場所 "${r.location_name}" がマスタに存在しません`);
        else locationId = id;
      }

      // 既存EQコードチェック
      const eqCode = String(r.eq_code ?? '').trim();
      let existingId: string | undefined;
      let action: 'insert' | 'update' | 'skip' = 'insert';
      if (eqCode) {
        const existing = await queryOne(
          'SELECT id FROM equipment_items WHERE eq_code = $1 AND deleted_at IS NULL',
          [eqCode]
        ) as { id: string } | undefined;
        if (existing) {
          existingId = existing.id;
          if (duplicateMode === 'error') errors.push(`EQコード "${eqCode}" は既に存在します`);
          else if (duplicateMode === 'update') action = 'update';
          else action = 'skip';
        }
      }

      validated.push({
        rowNumber,
        data: {
          ...r,
          name,
          category_id: categoryId,
          location_id: locationId,
          item_type: normItemType(r.item_type),
          status: normStatus(r.status),
          condition: normCondition(r.condition),
          is_lendable: normBool(r.is_lendable),
          acquisition_date: normDate(r.acquisition_date),
          acquisition_cost: normInt(r.acquisition_cost),
          useful_life: normInt(r.useful_life),
          book_value: normInt(r.book_value),
          eq_code: eqCode || null,
        },
        errors,
        action,
        existingId,
      });
    }

    const errorCount = validated.filter((v) => v.errors.length > 0).length;
    const summary = {
      total: validated.length,
      insert: validated.filter((v) => v.action === 'insert' && v.errors.length === 0).length,
      update: validated.filter((v) => v.action === 'update' && v.errors.length === 0).length,
      skip: validated.filter((v) => v.action === 'skip').length,
      error: errorCount,
    };

    if (mode === 'dry_run' || errorCount > 0) {
      res.json({
        success: true,
        data: {
          mode: 'dry_run',
          summary,
          warnings,
          rows: validated.map((v) => ({
            rowNumber: v.rowNumber,
            name: v.data.name,
            eq_code: v.data.eq_code,
            action: v.action,
            errors: v.errors,
          })),
        },
      });
      return;
    }

    // ============================================================
    // コミット (トランザクション内)
    // ============================================================
    const pool = getDb();
    const client = await pool.connect();
    const userId = (req as { user?: { id: string } }).user?.id || null;
    const inserted: { eq_code: string; name: string }[] = [];
    const updated: { eq_code: string; name: string }[] = [];

    try {
      await client.query('BEGIN');

      // EQ採番
      const generateEqCode = async (): Promise<string> => {
        await client.query("UPDATE sequences SET counter = counter + 1 WHERE seq_name = 'eq_code'");
        const seq = await client.query("SELECT counter FROM sequences WHERE seq_name = 'eq_code'");
        const counter = seq.rows[0]?.counter || Date.now();
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let code = '';
        let seed = Number(counter);
        for (let i = 0; i < 10; i++) {
          const idx = (seed * 31 + i * 7 + Number(counter)) % chars.length;
          code += chars[Math.abs(idx) % chars.length];
          seed = Math.floor(seed * 1.7) + 11;
        }
        return `EQ-${code}`;
      };

      for (const v of validated) {
        if (v.errors.length > 0 || v.action === 'skip') continue;
        const d = v.data;

        if (v.action === 'update' && v.existingId) {
          await client.query(
            `UPDATE equipment_items SET
               name=$1, category_id=$2, item_type=$3, unit_number=$4,
               manufacturer=$5, model_number=$6, serial_number=$7, description=$8,
               asset_number=$9, acquisition_date=$10, acquisition_cost=$11,
               depreciation_method=$12, useful_life=$13, book_value=$14, asset_class=$15,
               status=$16, condition=$17, location_id=$18, location_detail=$19, notes=$20,
               is_lendable=$21, updated_by=$22, updated_at=NOW()
             WHERE id=$23`,
            [
              d.name, d.category_id, d.item_type, d.unit_number || null,
              d.manufacturer || null, d.model_number || null, d.serial_number || null, d.description || null,
              d.asset_number || null, d.acquisition_date, d.acquisition_cost,
              d.depreciation_method || 'straight_line', d.useful_life, d.book_value, d.asset_class || 'fixed_asset',
              d.status, d.condition, d.location_id, d.location_detail || null, d.notes || null,
              d.is_lendable ? 1 : 0, userId, v.existingId,
            ],
          );
          updated.push({ eq_code: String(d.eq_code || ''), name: String(d.name) });
        } else {
          // INSERT
          const id = uuid();
          const eq_code = (d.eq_code as string) || (await generateEqCode());
          await client.query(
            `INSERT INTO equipment_items (
               id, eq_code, name, category_id, item_type, unit_number,
               manufacturer, model_number, serial_number, description,
               asset_number, acquisition_date, acquisition_cost,
               depreciation_method, useful_life, book_value, asset_class,
               status, condition, location_id, location_detail, notes,
               is_lendable, created_by, updated_by
             ) VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9,$10, $11,$12,$13, $14,$15,$16,$17, $18,$19,$20,$21,$22, $23,$24,$25)`,
            [
              id, eq_code, d.name, d.category_id, d.item_type, d.unit_number || null,
              d.manufacturer || null, d.model_number || null, d.serial_number || null, d.description || null,
              d.asset_number || null, d.acquisition_date, d.acquisition_cost,
              d.depreciation_method || 'straight_line', d.useful_life, d.book_value, d.asset_class || 'fixed_asset',
              d.status, d.condition, d.location_id, d.location_detail || null, d.notes || null,
              d.is_lendable ? 1 : 0, userId, userId,
            ],
          );
          inserted.push({ eq_code, name: String(d.name) });
        }
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        data: {
          mode: 'commit',
          summary,
          inserted,
          updated,
          warnings,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// EQコードでlookup (スキャナー用)
router.get('/items/by-code/:eq_code', requirePermission('equipment', 'reader'), wrap(async (req, res) => {
  const item = await queryOne(
    'SELECT id, eq_code, name FROM equipment_items WHERE eq_code = $1 AND deleted_at IS NULL',
    [req.params.eq_code],
  );
  if (!item) throw new AppError(404, 'NOT_FOUND', '該当する機材が見つかりません');
  res.json({ success: true, data: item });
}));

export default router;
