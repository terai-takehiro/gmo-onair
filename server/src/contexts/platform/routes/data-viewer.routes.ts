import { Router } from 'express';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole, requirePermission } from '../../../shared/middleware/auth';
import { paginatedResponse } from '../../../shared/services/pagination';

const router = Router();

// Apply auth + permission middleware to all routes
router.use(requireAuth, requirePermission('admin'));

/**
 * 編集・閲覧可能なテーブル一覧 (v2.8.0+ 全アプリのテーブルに拡張)
 * 個別テーブルを意図的に追加して新規テーブル誤公開を防ぐ。
 */
const ALLOWED_TABLES = [
  // 案件管理
  // Phase 3-3-7〜9: `customers`/`vendors` テーブルは削除済み（`companies` に一本化）。
  // この配列に残したままだと、この管理画面から「customers」「vendors」を選んだ瞬間
  // `relation does not exist` の生DBエラーになる
  'projects', 'companies', 'partners',
  'revenues', 'revenue_items', 'revenue_allocations',
  'purchases', 'purchase_allocations',
  'project_groups', 'project_group_members',
  'sga_expenses',
  'pricing_categories', 'pricing_items',
  'episodes', 'episode_orders',
  'invoice_groups', 'invoice_group_episodes',
  'studio_locations', 'studio_rooms', 'studio_bookings', 'studio_booking_rooms',
  'lost_reason_categories',
  'simulations', 'sales_targets',
  'activity_logs',
  // Qシート
  'qsheet_documents', 'qsheet_stage_templates',
  // 機材管理
  'equipment_items', 'equipment_categories',
  'equipment_branches', 'equipment_locations',
  'equipment_manufacturers', 'equipment_colors',
  'equipment_rack_types', 'rack_blank_panels',
  'equipment_accessories',
  'equipment_custom_columns', 'equipment_custom_values',
  'equipment_id_sequences',
  'equipment_lendings', 'equipment_rental_categories',
  'inventory_checks', 'inventory_check_items',
  'maintenance_records',
  // 技術資料
  'techsheet_documents',
  // ライブ運用
  'liveops_programs', 'liveops_settings', 'liveops_snapshots', 'liveops_timers',
  // リアルタイムCG
  'awards_events', 'awards_categories', 'awards_entries', 'awards_cue_state',
  // 共通・マスター
  'users', 'user_permissions', 'sequences',
  'login_attempts', 'verification_codes',
];

/**
 * 編集を禁止するカラム (v2.8.0+)
 * - 主キー / 監査列 / 認証情報 は UI からの直接編集を許可しない
 */
const PROTECTED_COLUMNS = new Set([
  'id',
  'created_at', 'updated_at', 'deleted_at',
  'created_by', 'updated_by',
  'password_hash', 'password',
  'two_factor_secret', 'totp_secret',
  'password_reset_token', 'session_token',
  'verification_code', 'sms_code',
]);

// PostgreSQL identifier quoting (prevents injection in table/column names)
function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

async function getColumns(table: string): Promise<ColumnInfo[]> {
  const rows = await queryAll(
    `SELECT column_name as name, data_type as type, is_nullable = 'YES' as nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ?
     ORDER BY ordinal_position`,
    [table]
  );
  return rows as unknown as ColumnInfo[];
}

// GET /data-viewer/tables - list tables with row counts
router.get('/tables', requireRole('system_admin'), async (_req, res) => {
  const tables = [];
  for (const name of ALLOWED_TABLES) {
    try {
      const row = await queryOne(`SELECT COUNT(*) as count FROM ${quoteIdent(name)}`);
      tables.push({ name, count: (row?.count as number) || 0 });
    } catch (err) {
      // テーブル未作成 (新規環境やマイグレーション未実行) はスキップ
      console.warn(`[data-viewer] Skipping table '${name}':`, (err as Error).message);
    }
  }
  res.json({ success: true, data: tables });
});

// GET /data-viewer/tables/:name/schema - column info
router.get('/tables/:name/schema', requireRole('system_admin'), async (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }
  const columns = await getColumns(name);
  // クライアントが編集可否を判別できるように editable フラグを付与
  const enriched = columns.map(c => ({
    ...c,
    editable: !PROTECTED_COLUMNS.has(c.name),
  }));
  res.json({ success: true, data: enriched });
});

// GET /data-viewer/tables/:name - paginated data
router.get('/tables/:name', requireRole('system_admin'), async (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }

  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = (page - 1) * limit;
  const sort = req.query.sort as string || 'id';
  const order = (req.query.order as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const search = req.query.search as string;

  // Validate sort column exists
  const colRows = await queryAll(
    `SELECT column_name as name FROM information_schema.columns WHERE table_name = ?`,
    [name]
  ) as Array<{ name: string }>;
  const validColumns = colRows.map(r => r.name);

  const safeSort = validColumns.includes(sort) ? sort : 'id';

  let where = '';
  const params: unknown[] = [];
  if (search) {
    const safeSearch = String(search).slice(0, 100).replace(/[%_\\]/g, '\\$&');
    // Search across all text columns with quoted identifiers
    const textCols = validColumns.filter(c => c !== 'id');
    const conditions = textCols.map(c => `CAST(${quoteIdent(c)} AS TEXT) ILIKE ? ESCAPE '\\'`);
    where = `WHERE ${conditions.join(' OR ')}`;
    for (let i = 0; i < textCols.length; i++) params.push(`%${safeSearch}%`);
  }

  const quotedTable = quoteIdent(name);
  const totalRow = await queryOne(`SELECT COUNT(*) as c FROM ${quotedTable} ${where}`, params);
  const total = (totalRow?.c as number) || 0;
  const rows = await queryAll(`SELECT * FROM ${quotedTable} ${where} ORDER BY ${quoteIdent(safeSort)} ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);

  res.json({ ...paginatedResponse(rows, total, page, limit), columns: validColumns });
});

// GET /data-viewer/tables/:name/export - CSV export
router.get('/tables/:name/export', requireRole('system_admin'), async (req, res) => {
  const name = req.params.name as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }

  const colRows = await queryAll(
    `SELECT column_name as name FROM information_schema.columns WHERE table_name = ?`,
    [name]
  ) as Array<{ name: string }>;
  const columns = colRows.map(r => r.name);

  const rows = await queryAll(`SELECT * FROM ${quoteIdent(name)}`);

  // BOM for Excel UTF-8 compatibility
  let csv = '﻿' + columns.join(',') + '\n';
  for (const row of rows) {
    csv += columns.map(c => {
      const val = (row as any)[c];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',') + '\n';
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${name}.csv`);
  res.send(csv);
});

// =============================================================
// v2.8.0+ 編集 / 論理削除 (system_admin のみ)
// =============================================================

/**
 * PATCH /data-viewer/tables/:name/rows/:id
 * 行を更新する。PROTECTED_COLUMNS は無視。updated_at / updated_by が
 * カラムに存在すれば自動で現在時刻 / 操作ユーザー ID にセット。
 */
router.patch('/tables/:name/rows/:id', requireRole('system_admin'), async (req, res) => {
  const name = req.params.name as string;
  const id = req.params.id as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }
  const updates = req.body as Record<string, unknown>;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    res.status(400).json({ success: false, error: 'Invalid body' });
    return;
  }

  const columns = await getColumns(name);
  const colNames = new Set(columns.map(c => c.name));

  // 編集可能なフィールドのみ抽出
  const setClauses: string[] = [];
  const params: unknown[] = [];
  const changed: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(updates)) {
    if (PROTECTED_COLUMNS.has(col)) continue;
    if (!colNames.has(col)) continue;
    setClauses.push(`${quoteIdent(col)} = ?`);
    // 空文字 → NULL (string 型のみ)
    params.push(val === '' ? null : val);
    changed[col] = val;
  }

  if (setClauses.length === 0) {
    res.status(400).json({ success: false, error: '編集可能なフィールドが指定されていません' });
    return;
  }

  // updated_at / updated_by は自動セット (カラムが存在する場合)
  if (colNames.has('updated_at')) setClauses.push(`${quoteIdent('updated_at')} = NOW()`);
  if (colNames.has('updated_by')) {
    setClauses.push(`${quoteIdent('updated_by')} = ?`);
    params.push((req.user as { id: string })?.id ?? null);
  }

  params.push(id);

  // 主キーが id でないテーブル (e.g. user_permissions) は更新できない
  if (!colNames.has('id')) {
    res.status(405).json({ success: false, error: `テーブル '${name}' は id カラムを持たないため更新できません` });
    return;
  }

  const sql = `UPDATE ${quoteIdent(name)} SET ${setClauses.join(', ')} WHERE ${quoteIdent('id')} = ?`;
  try {
    await execute(sql, params);
    console.log(`[data-viewer] UPDATE ${name}/${id} by user=${(req.user as { id: string })?.id}`, JSON.stringify(changed));
    const row = await queryOne(`SELECT * FROM ${quoteIdent(name)} WHERE ${quoteIdent('id')} = ?`, [id]);
    res.json({ success: true, data: row });
  } catch (err) {
    console.error(`[data-viewer] UPDATE failed on ${name}/${id}:`, (err as Error).message);
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

/**
 * DELETE /data-viewer/tables/:name/rows/:id (論理削除のみ)
 * deleted_at カラムを持つテーブルのみ対応。物理削除は提供しない。
 */
router.delete('/tables/:name/rows/:id', requireRole('system_admin'), async (req, res) => {
  const name = req.params.name as string;
  const id = req.params.id as string;
  if (!ALLOWED_TABLES.includes(name)) { res.status(400).json({ success: false, error: 'Invalid table' }); return; }

  const columns = await getColumns(name);
  const colNames = new Set(columns.map(c => c.name));

  if (!colNames.has('deleted_at')) {
    res.status(405).json({
      success: false,
      error: `テーブル '${name}' は deleted_at カラムを持たないため、論理削除できません (物理削除は安全のため未提供)`,
    });
    return;
  }
  if (!colNames.has('id')) {
    res.status(405).json({ success: false, error: `テーブル '${name}' は id カラムを持たないため削除できません` });
    return;
  }

  const setClauses = [`${quoteIdent('deleted_at')} = NOW()`];
  const params: unknown[] = [];
  if (colNames.has('updated_at')) setClauses.push(`${quoteIdent('updated_at')} = NOW()`);
  if (colNames.has('updated_by')) {
    setClauses.push(`${quoteIdent('updated_by')} = ?`);
    params.push((req.user as { id: string })?.id ?? null);
  }
  params.push(id);

  const sql = `UPDATE ${quoteIdent(name)} SET ${setClauses.join(', ')} WHERE ${quoteIdent('id')} = ? AND ${quoteIdent('deleted_at')} IS NULL`;
  try {
    await execute(sql, params);
    console.log(`[data-viewer] LOGICAL DELETE ${name}/${id} by user=${(req.user as { id: string })?.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[data-viewer] DELETE failed on ${name}/${id}:`, (err as Error).message);
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// =============================================================
// v2.8.2+ DB バックアップ一覧取得 (BOX 上のファイルを列挙)
// 復元の実行は CLI スクリプト経由のみ (UI からは行えない設計、案 B)
// =============================================================

interface BoxFolderItem {
  id: string;
  name: string;
  type: string;
  size?: number | string;
  created_at?: string;
}

interface BoxItemsResponse {
  entries: BoxFolderItem[];
}

router.get('/db-backups', requireRole('system_admin'), async (_req, res) => {
  try {
    const cfg = process.env.BOX_CONFIG_JSON;
    const parentId = process.env.BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL;
    if (!cfg || !parentId) {
      res.json({ success: true, data: { configured: false, environments: [] } });
      return;
    }

    // 動的 import で起動時のクラッシュを避ける (BOX 未設定環境向け)
    const BoxSDK = (await import('box-node-sdk')).default;
    const sdk = BoxSDK.getPreconfiguredInstance(JSON.parse(cfg));
    const client = sdk.getAppAuthClient('enterprise');

    async function findFolder(parent: string, name: string): Promise<string | null> {
      const items = (await client.folders.getItems(parent, { limit: 1000, fields: 'id,name,type' })) as BoxItemsResponse;
      return items.entries.find((e) => e.type === 'folder' && e.name === name)?.id ?? null;
    }

    const rootId = await findFolder(parentId, '00_DB_Backup');
    if (!rootId) {
      res.json({ success: true, data: { configured: true, environments: [] } });
      return;
    }

    const result: { env: string; files: BoxFolderItem[] }[] = [];
    for (const env of ['prod', 'dev']) {
      const envId = await findFolder(rootId, env);
      if (!envId) continue;
      const items = (await client.folders.getItems(envId, {
        limit: 1000,
        fields: 'id,name,type,size,created_at',
      })) as BoxItemsResponse;
      const files = items.entries
        .filter((e) => e.type === 'file' && e.name.endsWith('.sql.gz'))
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      result.push({ env, files });
    }

    res.json({ success: true, data: { configured: true, environments: result } });
  } catch (err) {
    console.error('[data-viewer] db-backups list failed:', (err as Error).message);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
