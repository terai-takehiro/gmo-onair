// 機材Excel入出力 + QRコード — 実運用Excel列構造準拠
import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import QRCode from 'qrcode';
import { queryAll, queryOne, getDb } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { buildExcelWorkbook, excelResponse, parseExcelBuffer, parseExcelHeaders, normalizeHeader } from '../../../shared/utils/excel';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// QRコード (auth不要)
router.get('/items/:id/qr', wrap(async (req, res) => {
  const item = await queryOne('SELECT eq_code FROM equipment_items WHERE id = $1 AND deleted_at IS NULL', [req.params.id]) as any;
  if (!item) throw new AppError(404, 'NOT_FOUND', '機材が見つかりません');
  const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
  const svg = await QRCode.toString(`${clientUrl}/equipment/items/${req.params.id}`, { type: 'svg', margin: 1 });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
}));

router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// ============================================================
// カラム定義 — 実運用Excel列構造準拠
// ============================================================
const ITEM_COLUMNS = [
  { key: 'eq_code',            header: 'ID',             width: 16 }, // 必須
  { key: 'branch_code',        header: '所管',           width: 14 },
  { key: 'asset_class',        header: '資産管理',       width: 10 },
  { key: 'fixed_asset_code',   header: '固定資産コード', width: 16 },
  { key: 'depreciation_years', header: '償却',           width: 6 },
  { key: 'section_display',    header: '機材セクション', width: 16 },
  { key: 'name',               header: '商品名',         width: 28 },
  { key: 'manufacturer_name',  header: 'メーカー',       width: 18 },
  { key: 'model_number',       header: '型名',           width: 22 },
  { key: 'unit_number',        header: 'no',             width: 6 },
  { key: 'serial_number',      header: 'serial',         width: 18 },
  { key: 'location_display',   header: '設置場所',       width: 18 },
  { key: 'purchased_at',       header: '購入年月',       width: 12 },
  { key: 'warranty_years',     header: '保証期間',       width: 8 },
  { key: 'notes',              header: '備考',           width: 30 },
];

// asset_class 表示ラベル
const ASSET_CLASS_LABELS: Record<string, string> = {
  fixed_asset: '固定資産', consumable: '消耗品', leased: 'リース', transferred: '譲渡',
};
const ASSET_CLASS_VALUES: Record<string, string> = {
  固定資産: 'fixed_asset', 消耗品: 'consumable', リース: 'leased', 譲渡: 'transferred',
  fixed_asset: 'fixed_asset', consumable: 'consumable', leased: 'leased', transferred: 'transferred',
};
function normAssetClass(v: unknown): string {
  const s = String(v ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
  return ASSET_CLASS_VALUES[s] || 'fixed_asset';
}

// 種別コード (EQコード Y-XR-000001 の2セグメント目に使用)
const TYPE_CODES = ['V','C','A','IC','NW','L','XR','E'];
const TYPE_LABELS: Record<string, string> = {
  V: '映像', C: 'カメラ', A: '音声', IC: 'インカム', NW: 'ネットワーク', L: '照明', XR: 'LED/XR', E: '設備',
};

function normDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  const m = String(v).trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}` : null;
}
function normInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// 機材セクション = 設備 / 貸出 のサフィックスのみ判定
// 「〇〇システム」→ equipment、「〇〇汎用」→ rental
function parseSectionSuffix(raw: string): 'equipment' | 'rental' | null {
  const s = String(raw ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
  if (!s) return null;
  if (/汎用$|汎用貸出$|貸出$|rental$/i.test(s)) return 'rental';
  if (/システム$|設備$|system$|equipment$/i.test(s)) return 'equipment';
  // サフィックスが無い場合のフォールバック: 全体一致
  if (s === '汎用' || s === '貸出') return 'rental';
  if (s === 'システム' || s === '設備') return 'equipment';
  return null;
}

// EQコード Y-XR-000001 から種別コード (XR) を抽出
function extractTypeCodeFromEqCode(eqCode: string): string | null {
  const m = String(eqCode ?? '').trim().match(/^[YS]-([A-Z]{1,2})-\d+$/i);
  if (!m) return null;
  const code = m[1].toUpperCase();
  return TYPE_CODES.includes(code) ? code : null;
}

// ============================================================
// テンプレートDL
// ============================================================
router.get('/items/template', requirePermission('equipment', 'reader'), wrap(async (_req, res) => {
  const buf = await buildExcelWorkbook([
    {
      name: '機材リスト',
      columns: ITEM_COLUMNS,
      rows: [{
        eq_code: 'Y-V-000001', branch_code: 'GMO-IG', asset_class: '固定資産',
        fixed_asset_code: '052312-390', depreciation_years: 8,
        section_display: '映像システム', name: 'ユニバーサルフレーム',
        manufacturer_name: 'VIDEOTRON', model_number: 'Vbus-70V2',
        unit_number: 1, serial_number: '', location_display: 'サブ1',
        purchased_at: '2023/6/30', warranty_years: 1, notes: '',
      }, {
        eq_code: 'Y-C-000001', branch_code: 'GMO-IG', asset_class: '消耗品',
        fixed_asset_code: '', depreciation_years: 0,
        section_display: 'カメラ汎用', name: 'HDMIケーブル 3m',
        manufacturer_name: 'CANARE', model_number: 'HDM03',
        unit_number: 1, serial_number: '', location_display: 'A棟 3F 機材庫',
        purchased_at: '2024/1/15', warranty_years: 0, notes: '',
      }],
    },
    {
      name: '入力ガイド',
      columns: [{ key: 'col', header: '項目', width: 20 }, { key: 'desc', header: '説明', width: 80 }],
      rows: [
        { col: 'ID', desc: '必須。Y-V-000001 形式 (Y=用賀/S=昭和、V/C/A/IC/NW/L/XR/E=種別、6桁連番)。既存IDは更新モード' },
        { col: '所管', desc: '例: GMO-IG / GMO-GLS / 昭和リース / SFI' },
        { col: '資産管理', desc: '固定資産 / 消耗品 / リース / 譲渡' },
        { col: '固定資産コード', desc: '固定資産の場合は必須。消耗品は空欄' },
        { col: '償却', desc: '償却年数(整数)。消耗品の場合は0' },
        { col: '機材セクション', desc: 'サフィックス「システム」→設備、「汎用」→貸出。接頭辞(LED/XR/映像等)は表示用で分類にはIDを使用' },
        { col: '商品名', desc: '機材の商品名・名称' },
        { col: 'メーカー', desc: 'メーカー名。未登録の場合は自動作成' },
        { col: '型名', desc: '型番・モデル名' },
        { col: 'no', desc: '個体番号(同一機材が複数台ある場合の通し番号)' },
        { col: 'serial', desc: 'シリアルナンバー' },
        { col: '設置場所', desc: '設置場所・保管場所' },
        { col: '購入年月', desc: 'YYYY/MM/DD または YYYY/MM 形式' },
        { col: '保証期間', desc: '保証年数(整数)' },
        { col: '備考', desc: '自由記述' },
      ],
    },
  ]);
  excelResponse(res, '機材リスト_テンプレート.xlsx', buf);
}));

// ============================================================
// Excelエクスポート
// ============================================================
router.get('/items/export-xlsx', requirePermission('equipment', 'exporter'), wrap(async (_req, res) => {
  const items = await queryAll(`
    SELECT ei.eq_code,
           ei.branch_code,
           ei.asset_class,
           ei.fixed_asset_code,
           ei.depreciation_years,
           ei.equipment_type_code, ei.equipment_section,
           ei.name,
           em.name as manufacturer_name,
           ei.model_number, ei.unit_number, ei.serial_number,
           COALESCE(el.name, ei.location_detail) as location_display,
           ei.purchased_at, ei.warranty_years,
           ei.notes
    FROM equipment_items ei
    LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
    LEFT JOIN equipment_locations el ON el.id = ei.location_id AND el.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL
    ORDER BY ei.eq_code
  `) as Record<string, unknown>[];

  const rows = items.map((r) => {
    const typeLabel = TYPE_LABELS[r.equipment_type_code as string] || '';
    const secLabel = r.equipment_section === 'equipment' ? 'システム' : r.equipment_section === 'rental' ? '汎用' : '';
    return {
      ...r,
      section_display: `${typeLabel}${secLabel}`,
      asset_class: ASSET_CLASS_LABELS[r.asset_class as string] || (r.asset_class as string) || '固定資産',
    };
  });

  const buf = await buildExcelWorkbook([{ name: '機材リスト', columns: ITEM_COLUMNS, rows }]);
  const today = new Date().toISOString().slice(0, 10);
  excelResponse(res, `機材リスト_${today}.xlsx`, buf);
}));

// ============================================================
// Excelインポート前プレビュー (列対応付けUI用)
// ============================================================
router.post('/items/import-preview', requirePermission('equipment', 'editor'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Excelファイルが必要です');
  let detectedHeaders: string[];
  try {
    detectedHeaders = await parseExcelHeaders(req.file.buffer);
  } catch (e: any) {
    throw new AppError(400, 'PARSE_ERROR', `Excelの読み込みに失敗しました: ${e?.message || e}`);
  }
  // 自動マッチ判定
  const normDetected = detectedHeaders.map(normalizeHeader);
  const autoMapping: Record<string, string | null> = {};
  const unmatchedKeys: string[] = [];
  for (const col of ITEM_COLUMNS) {
    const target = normalizeHeader(col.header);
    const idx = normDetected.indexOf(target);
    if (idx >= 0) {
      autoMapping[col.key] = detectedHeaders[idx];
    } else {
      autoMapping[col.key] = null;
      unmatchedKeys.push(col.key);
    }
  }
  res.json({ success: true, data: {
    detectedHeaders,
    expectedColumns: ITEM_COLUMNS.map((c) => ({ key: c.key, header: c.header })),
    autoMapping,
    unmatchedKeys,
  }});
}));

// ============================================================
// Excelインポート
// ============================================================
router.post('/items/import', requirePermission('equipment', 'editor'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Excelファイルが必要です');
  const pickFirst = (v: unknown): string => Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '');
  const mode = pickFirst(req.query.mode) || 'dry_run';
  const duplicateMode = pickFirst(req.query.duplicate) || 'skip';

  // 手動マッピング (FormDataのフィールド "mapping" にJSON文字列で)
  let mapping: Record<string, string | null> | undefined;
  const mappingStr = (req.body && typeof req.body.mapping === 'string') ? req.body.mapping as string : undefined;
  if (mappingStr) {
    try {
      mapping = JSON.parse(mappingStr);
    } catch (e: any) {
      throw new AppError(400, 'BAD_MAPPING', `mapping JSONの解析に失敗: ${e?.message || e}`);
    }
  }

  let rows: Record<string, unknown>[];
  let warnings: string[];
  try {
    ({ rows, warnings } = await parseExcelBuffer(req.file.buffer, ITEM_COLUMNS, mapping));
  } catch (e: any) {
    throw new AppError(400, 'PARSE_ERROR', `Excelの読み込みに失敗しました: ${e?.message || e}`);
  }

  // マスタ事前ロード
  let manufacturers: { id: string; name: string }[];
  let existingItems: { id: string; eq_code: string }[];
  try {
    [manufacturers, existingItems] = await Promise.all([
      queryAll('SELECT id, name FROM equipment_manufacturers WHERE deleted_at IS NULL') as Promise<{ id: string; name: string }[]>,
      queryAll('SELECT id, eq_code FROM equipment_items WHERE deleted_at IS NULL') as Promise<{ id: string; eq_code: string }[]>,
    ]);
  } catch (e: any) {
    throw new AppError(500, 'DB_ERROR', `マスタ読み込みエラー: ${e?.message || e}`);
  }
  const mfgMap = new Map(manufacturers.map((m) => [m.name, m.id]));
  const eqCodeMap = new Map(existingItems.map((r) => [r.eq_code, r.id]));

  type VRow = { rowNumber: number; data: Record<string, unknown>; errors: string[]; action: 'insert'|'update'|'skip'; existingId?: string };
  const validated: VRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const errors: string[] = [];
    const rowNumber = i + 2;

    const name = String(r.name ?? '').trim();
    if (!name) errors.push('商品名は必須');

    const eqCode = String(r.eq_code ?? '').trim();
    if (!eqCode) errors.push('IDは必須です (例: Y-V-000001)');

    // ID から種別コード抽出 (Y-XR-000001 → XR)
    const typeCode = extractTypeCodeFromEqCode(eqCode);
    if (eqCode && !typeCode) errors.push(`IDの形式が不正です: "${eqCode}" (例: Y-V-000001)`);

    // 機材セクション → equipment / rental (サフィックスのみ判定)
    const section = parseSectionSuffix(String(r.section_display ?? ''));
    if (!section) errors.push('機材セクションは「〇〇システム」(設備) または「〇〇汎用」(貸出) で指定してください');

    const assetClass = normAssetClass(r.asset_class);
    const fixedAssetCode = String(r.fixed_asset_code ?? '').trim() || null;
    const depYears = normInt(r.depreciation_years) ?? 0;

    // メーカー lookup
    const mfgName = String(r.manufacturer_name ?? '').trim() || null;
    let manufacturerId: string | null = null;
    if (mfgName) {
      manufacturerId = mfgMap.get(mfgName) || null;
    }

    // 機材ID チェック (事前ロード済みMapで照合)
    let existingId: string | undefined;
    let action: 'insert'|'update'|'skip' = 'insert';
    if (eqCode) {
      const existingItemId = eqCodeMap.get(eqCode);
      if (existingItemId) {
        existingId = existingItemId;
        if (duplicateMode === 'error') errors.push(`機材ID "${eqCode}" は既に存在します`);
        else if (duplicateMode === 'update') action = 'update';
        else action = 'skip';
      }
    }
    // v2.8.109+: 固定資産コードはユニークではない (1 つのコードを複数機材で共有する運用がある) ため
    // 重複チェックは行わない。migration 085 で uq_fixed_asset_code を非ユニーク index に置換済み。

    // 拠点コード (IDから判定)
    let locationCode: string | null = null;
    if (eqCode) {
      const m = eqCode.match(/^([YS])-/);
      if (m) locationCode = m[1];
    }
    if (!locationCode) locationCode = 'Y'; // デフォルト用賀

    validated.push({
      rowNumber, action, existingId,
      data: {
        eq_code: eqCode || null,
        name, model_number: String(r.model_number ?? '').trim() || null,
        branch_code: String(r.branch_code ?? '').trim() || null,
        asset_class: assetClass,
        fixed_asset_code: fixedAssetCode, depreciation_years: depYears,
        equipment_type_code: typeCode, equipment_section: section, location_code: locationCode,
        manufacturer_name: mfgName, manufacturer_id: manufacturerId,
        unit_number: String(r.unit_number ?? '').trim() || null,
        serial_number: String(r.serial_number ?? '').trim() || null,
        location_detail: String(r.location_display ?? '').trim() || null,
        purchased_at: normDate(r.purchased_at),
        warranty_years: normInt(r.warranty_years) ?? 0,
        notes: String(r.notes ?? '').trim() || null,
      },
      errors,
    });
  }

  const errorCount = validated.filter((v) => v.errors.length > 0).length;
  const summary = {
    total: validated.length,
    insert: validated.filter((v) => v.action === 'insert' && !v.errors.length).length,
    update: validated.filter((v) => v.action === 'update' && !v.errors.length).length,
    skip: validated.filter((v) => v.action === 'skip').length,
    error: errorCount,
  };

  if (mode === 'dry_run') {
    return res.json({ success: true, data: {
      mode: 'dry_run', summary, warnings,
      rows: validated.map((v) => ({ rowNumber: v.rowNumber, name: v.data.name, eq_code: v.data.eq_code, action: v.action, errors: v.errors })),
    }});
  }

  // COMMIT
  const pool = getDb();
  const client = await pool.connect();
  const userId = (req as any).user?.id || null;
  const inserted: { eq_code: string; name: string }[] = [];
  const updated: { eq_code: string; name: string }[] = [];

  try {
    await client.query('BEGIN');

    // メーカー自動作成
    for (const v of validated) {
      if (v.errors.length || v.action === 'skip') continue;
      const mName = v.data.manufacturer_name as string;
      if (mName && !v.data.manufacturer_id) {
        if (!mfgMap.has(mName)) {
          const mId = uuid();
          await client.query('INSERT INTO equipment_manufacturers (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [mId, mName]);
          const row = await client.query('SELECT id FROM equipment_manufacturers WHERE name = $1', [mName]);
          const id = row.rows[0]?.id || mId;
          mfgMap.set(mName, id);
        }
        v.data.manufacturer_id = mfgMap.get(mName)!;
      }
    }

    for (const v of validated) {
      if (v.errors.length || v.action === 'skip') continue;
      const d = v.data;

      if (v.action === 'update' && v.existingId) {
        await client.query(
          `UPDATE equipment_items SET
            name=$1, model_number=$2, branch_code=$3, asset_class=$4,
            fixed_asset_code=$5, depreciation_years=$6,
            equipment_type_code=$7, equipment_section=$8, location_code=$9,
            manufacturer_id=$10,
            unit_number=$11, serial_number=$12, location_detail=$13,
            purchased_at=$14, warranty_years=$15, notes=$16,
            updated_by=$17, updated_at=NOW()
          WHERE id=$18`,
          [d.name, d.model_number, d.branch_code, d.asset_class,
           d.fixed_asset_code, d.depreciation_years,
           d.equipment_type_code, d.equipment_section, d.location_code,
           d.manufacturer_id,
           d.unit_number, d.serial_number, d.location_detail,
           d.purchased_at, d.warranty_years, d.notes,
           userId, v.existingId],
        );
        updated.push({ eq_code: String(d.eq_code), name: String(d.name) });
      } else {
        const id = uuid();
        const eq_code = d.eq_code as string; // バリデーションで必須チェック済み
        await client.query(
          `INSERT INTO equipment_items (
            id, eq_code, name, model_number, branch_code, asset_class,
            fixed_asset_code, depreciation_years,
            equipment_type_code, equipment_section, location_code,
            manufacturer_id,
            unit_number, serial_number, location_detail,
            purchased_at, warranty_years, notes,
            created_by, updated_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [id, eq_code, d.name, d.model_number, d.branch_code, d.asset_class,
           d.fixed_asset_code, d.depreciation_years,
           d.equipment_type_code, d.equipment_section, d.location_code,
           d.manufacturer_id,
           d.unit_number, d.serial_number, d.location_detail,
           d.purchased_at, d.warranty_years, d.notes,
           userId, userId],
        );
        inserted.push({ eq_code, name: String(d.name) });
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, data: { mode: 'commit', summary, inserted, updated, warnings } });
  } catch (err: any) {
    await client.query('ROLLBACK');
    const msg = err?.message || String(err);
    throw new AppError(500, 'DB_ERROR', `インポート中にエラーが発生しました: ${msg}`);
  } finally {
    client.release();
  }
}));

// EQコードlookup
router.get('/items/by-code/:eq_code', requirePermission('equipment', 'reader'), wrap(async (req, res) => {
  const item = await queryOne('SELECT id, eq_code, name FROM equipment_items WHERE eq_code = $1 AND deleted_at IS NULL', [req.params.eq_code]);
  if (!item) throw new AppError(404, 'NOT_FOUND', '該当する機材が見つかりません');
  res.json({ success: true, data: item });
}));

export default router;
