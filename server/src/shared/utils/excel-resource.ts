// shared/utils/excel-resource.ts
// 汎用Excel入出力ハンドラー — リソース定義から/template, /import, /export-xlsxの3エンドポイントを生成
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { queryAll, getDb } from '../db/connection';
import { requireAuth, requirePermission } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { buildExcelWorkbook, excelResponse, parseExcelBuffer, SheetSpec } from './excel';
import { PoolClient } from 'pg';
import { jstDate } from './jst';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

export interface ColumnDef {
  key: string;
  header: string;
  width?: number;
}

export interface ValidatedRow {
  /** インポート用に正規化されたデータ */
  data: Record<string, unknown>;
  /** バリデーションエラー (空ならOK) */
  errors: string[];
  /** 重複検出キー (例: customer name, eq_code) — 既存ならUPDATEモードへ */
  uniqueKey?: string | null;
}

export interface ResourceConfig {
  /** 表示名 (日本語) — テンプレ・通知メッセージに使用 */
  name: string;
  /** ファイル名のベース (customers, projects 等) */
  filename: string;
  /** Excel列定義 */
  columns: ColumnDef[];
  /** テンプレートのサンプル行 */
  templateRows: Record<string, unknown>[];
  /** 入力ガイドシート (任意) */
  guideSheet?: SheetSpec;
  /** 必要権限 */
  permission: { module: string; level?: 'reader' | 'exporter' | 'editor' | 'manager' | 'owner' };
  /** Excel出力用SQL — 列名は columns.key と一致させる */
  exportQuery: string;
  /** 動的Excel出力 (絞り込み/並び替えを反映) — 指定時は exportQuery より優先 */
  buildExportQuery?: (query: Request['query']) => { sql: string; params: unknown[] };
  /** 重複チェック用のテーブル名・カラム名 (uniqueKey が指定された行で重複検出) */
  duplicate?: { table: string; column: string };
  /** 各行の事前ロード値マップ (例: customer name → id) */
  preloadLookups?: (client: PoolClient) => Promise<Record<string, Map<string, string>>>;
  /** 行ごとのバリデーション+正規化 */
  validateRow: (raw: Record<string, unknown>, lookups: Record<string, Map<string, string>>) => Promise<ValidatedRow> | ValidatedRow;
  /** INSERT実行 (idは自動採番) */
  insert: (client: PoolClient, data: Record<string, unknown>, userId: string | null) => Promise<void>;
  /** UPDATE実行 (uniqueKeyで既存検出) */
  update?: (client: PoolClient, existingId: string, data: Record<string, unknown>, userId: string | null) => Promise<void>;
}

/**
 * リソース設定からExcel入出力エンドポイントを構築
 * 返却ルーター: GET /template, GET /export-xlsx, POST /import
 */
export function createExcelResourceRouter(config: ResourceConfig): Router {
  const router = Router();
  router.use(requireAuth);

  const { module, level = 'reader' } = config.permission;

  // ============ テンプレートDL ============
  router.get('/template', requirePermission(module, level), wrap(async (_req, res) => {
    const sheets: SheetSpec[] = [
      { name: config.name.slice(0, 31), columns: config.columns, rows: config.templateRows },
    ];
    if (config.guideSheet) sheets.push(config.guideSheet);
    const buf = await buildExcelWorkbook(sheets);
    excelResponse(res, `${config.name}_テンプレート.xlsx`, buf);
  }));

  // ============ Excelエクスポート ============
  router.get('/export-xlsx', requirePermission(module, 'exporter'), wrap(async (req, res) => {
    const rows = (config.buildExportQuery
      ? await (async () => { const { sql, params } = config.buildExportQuery!(req.query); return queryAll(sql, params); })()
      : await queryAll(config.exportQuery)) as Record<string, unknown>[];
    const buf = await buildExcelWorkbook([
      { name: config.name.slice(0, 31), columns: config.columns, rows },
    ]);
    const today = jstDate();
    excelResponse(res, `${config.name}_${today}.xlsx`, buf);
  }));

  // ============ Excelインポート ============
  router.post('/import', requirePermission(module, 'editor'), upload.single('file'),
    wrap(async (req, res) => {
      if (!req.file) throw new AppError(400, 'NO_FILE', 'Excelファイルが必要です');
      const mode = (req.query.mode as string) || 'dry_run';
      const duplicateMode = (req.query.duplicate as string) || 'skip';

      const { rows, warnings } = await parseExcelBuffer(req.file.buffer, config.columns);

      const pool = getDb();
      const client = await pool.connect();
      const userId = (req as { user?: { id: string } }).user?.id || null;

      try {
        // マスタロード
        const lookups = config.preloadLookups ? await config.preloadLookups(client) : {};

        type ProcessedRow = {
          rowNumber: number;
          name: string;
          uniqueKey: string | null;
          action: 'insert' | 'update' | 'skip';
          existingId?: string;
          errors: string[];
          data: Record<string, unknown>;
        };

        const processed: ProcessedRow[] = [];

        for (let i = 0; i < rows.length; i++) {
          const validated = await config.validateRow(rows[i], lookups);
          const rowNumber = i + 2;
          let action: 'insert' | 'update' | 'skip' = 'insert';
          let existingId: string | undefined;
          const errors = [...validated.errors];

          // 重複検出
          if (config.duplicate && validated.uniqueKey) {
            const dupSql = `SELECT id FROM ${config.duplicate.table} WHERE ${config.duplicate.column} = $1 AND deleted_at IS NULL LIMIT 1`;
            const dup = await client.query(dupSql, [validated.uniqueKey]);
            if (dup.rows[0]) {
              existingId = dup.rows[0].id;
              if (duplicateMode === 'error') errors.push(`既に存在: "${validated.uniqueKey}"`);
              else if (duplicateMode === 'update') action = 'update';
              else action = 'skip';
            }
          }

          processed.push({
            rowNumber,
            name: String(validated.data._displayName ?? validated.uniqueKey ?? ''),
            uniqueKey: validated.uniqueKey ?? null,
            action,
            existingId,
            errors,
            data: validated.data,
          });
        }

        const errorCount = processed.filter((p) => p.errors.length > 0).length;
        const summary = {
          total: processed.length,
          insert: processed.filter((p) => p.action === 'insert' && p.errors.length === 0).length,
          update: processed.filter((p) => p.action === 'update' && p.errors.length === 0).length,
          skip: processed.filter((p) => p.action === 'skip').length,
          error: errorCount,
        };

        if (mode === 'dry_run' || errorCount > 0) {
          res.json({
            success: true,
            data: {
              mode: 'dry_run',
              summary,
              warnings,
              rows: processed.map((p) => ({
                rowNumber: p.rowNumber,
                name: p.name,
                uniqueKey: p.uniqueKey,
                action: p.action,
                errors: p.errors,
              })),
            },
          });
          return;
        }

        // ======== コミット ========
        await client.query('BEGIN');
        const inserted: { uniqueKey: string | null; name: string }[] = [];
        const updated: { uniqueKey: string | null; name: string }[] = [];

        try {
          for (const p of processed) {
            if (p.errors.length > 0 || p.action === 'skip') continue;
            if (p.action === 'update' && p.existingId && config.update) {
              await config.update(client, p.existingId, p.data, userId);
              updated.push({ uniqueKey: p.uniqueKey, name: p.name });
            } else {
              await config.insert(client, p.data, userId);
              inserted.push({ uniqueKey: p.uniqueKey, name: p.name });
            }
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }

        res.json({
          success: true,
          data: { mode: 'commit', summary, inserted, updated, warnings },
        });
      } finally {
        client.release();
      }
    }),
  );

  return router;
}

// 汎用ID生成
export function newId(): string {
  return uuid();
}

// 共通正規化ヘルパー
export function asString(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim();
}
export function asInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
export function asDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}
