/**
 * 台本 Excel（.xlsx）の書き出し・取込 API。実装設計: 03-excel.md §9。
 *
 * ⚠️ 08（機器設定の Excel・`device-settings.routes.ts`）とは別物。互いを import しない（§0-0）。
 * `canAccessDoc` を全経路で通す（権限なしは 404。既存の存在秘匿の方針に揃える）。
 */
import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { excelResponse } from '../../../shared/utils/excel';
import { canAccessDoc } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import { buildQsheetWorkbook, qsheetFilename, type QsheetDocForExport } from '../excel/workbook';
import { buildQsheetCsv } from '../excel/csv';
import { buildImportPlan } from '../excel/plan';
import type { ImportMode } from '../excel/planTypes';
import { createBatch, markApplied, undoBatch, listBatches } from '../services/importBatch.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // §8-7: 10MB

async function loadAccessibleDoc(req: Request): Promise<QsheetDocForExport & { created_by: string | null }> {
  const row = await queryOne(
    'SELECT id, title, status, broadcast_date, data, created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
    [p1(req.params.id)],
  );
  if (!row) throw new NotFoundError('ドキュメントが見つかりません');
  if (!(await canAccessDoc(req.user!, row.id as string, (row.created_by as string) ?? null))) {
    throw new NotFoundError('ドキュメントが見つかりません');
  }
  return row as unknown as QsheetDocForExport & { created_by: string | null };
}

// ============================================================
// 書き出し（§9-1）: xlsx / csv、今の台本 or 空のひな形
// ============================================================
router.post('/documents/:id/export', requirePermission('qsheet', 'reader'), wrap(async (req: Request, res: Response) => {
  const doc = await loadAccessibleDoc(req);
  const format = req.body?.format === 'csv' ? 'csv' : 'xlsx';
  const content = req.body?.content === 'empty' ? 'empty' : 'full';
  // current: エディタが持っている最新データ（collab 下では DB の data が最大 3 秒古いため）
  const current = req.body?.current && typeof req.body.current === 'object' ? req.body.current : doc.data;
  const exportDoc: QsheetDocForExport = { id: doc.id, title: doc.title, status: doc.status, broadcast_date: doc.broadcast_date, data: current };

  if (format === 'csv') {
    const csv = buildQsheetCsv(content === 'empty' ? { ...current, sections: [] } : current);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(qsheetFilename(exportDoc, 'csv'))}`);
    res.send(csv);
    return;
  }
  const wb = buildQsheetWorkbook(exportDoc, { empty: content === 'empty', exportedBy: req.user!.id });
  const buf = await wb.xlsx.writeBuffer();
  excelResponse(res, qsheetFilename(exportDoc, 'xlsx'), Buffer.from(buf));
}));

// 空のひな形（GET・ブラウザの直リンクでも取れるように current を持たない版）
router.get('/documents/:id/excel/template', requirePermission('qsheet', 'reader'), wrap(async (req: Request, res: Response) => {
  const doc = await loadAccessibleDoc(req);
  const exportDoc: QsheetDocForExport = { id: doc.id, title: doc.title, status: doc.status, broadcast_date: doc.broadcast_date, data: doc.data };
  const wb = buildQsheetWorkbook(exportDoc, { empty: true, exportedBy: req.user!.id });
  const buf = await wb.xlsx.writeBuffer();
  excelResponse(res, qsheetFilename(exportDoc, 'xlsx'), Buffer.from(buf));
}));

// ============================================================
// 取込の下見（§8-1・§9-2・§9-3 を1段に統合。詳細は plan.ts の冒頭コメント）
// ============================================================
router.post('/documents/:id/excel/import-plan', requirePermission('qsheet', 'editor'), upload.single('file'), wrap(async (req: Request, res: Response) => {
  const doc = await loadAccessibleDoc(req);
  if (!req.file) throw new ValidationError('ファイルが送られていません');
  if (!/\.xlsx$/i.test(req.file.originalname || '')) throw new ValidationError('.xlsx ファイルを選んでください');

  const mode: ImportMode = req.body?.mode === 'append' ? 'append' : 'merge';
  let current: unknown;
  try {
    current = JSON.parse(req.body?.current ?? '');
  } catch {
    throw new ValidationError('current（現在の台本データ）が送られていません');
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(req.file.buffer);
  } catch {
    throw new ValidationError('Excel ファイルを読み取れませんでした（壊れているか、対応していない形式です）');
  }

  const plan = buildImportPlan(wb, current, mode);
  if (!plan.ok) {
    res.status(422).json({ success: false, error: { code: 'IMPORT_INVALID', message: plan.errors[0] || '取込に失敗しました', details: plan.errors } });
    return;
  }

  const batchId = await createBatch({
    documentId: doc.id, mode, sourceKind: 'xlsx', fileName: req.file.originalname || 'import.xlsx',
    fileSize: req.file.size, summary: plan.summary, beforeData: current, createdBy: req.user!.id,
  });

  res.json({ success: true, data: { batchId, ops: plan.ops, summary: plan.summary, entries: plan.entries, warnings: plan.warnings, metaPatch: plan.metaPatch } });
}));

// ============================================================
// 適用の記録（§9-4）
// ============================================================
router.post('/documents/:id/excel/batches/:batchId/applied', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  const doc = await loadAccessibleDoc(req);
  const after = req.body?.after;
  if (!after || typeof after !== 'object') throw new ValidationError('after（適用後の台本データ）が送られていません');
  await markApplied(p1(req.params.batchId), doc.id, after);
  res.json({ success: true, data: { batchId: p1(req.params.batchId) } });
}));

// ============================================================
// 取消（§9-4）
// ============================================================
router.post('/documents/:id/excel/batches/:batchId/undo', requirePermission('qsheet', 'editor'), wrap(async (req: Request, res: Response) => {
  const doc = await loadAccessibleDoc(req);
  const data = await undoBatch(p1(req.params.batchId), doc.id);
  res.json({ success: true, data: { batchId: p1(req.params.batchId), data } });
}));

// ============================================================
// 履歴（直近 20 件）
// ============================================================
router.get('/documents/:id/excel/batches', requirePermission('qsheet', 'reader'), wrap(async (req: Request, res: Response) => {
  const doc = await loadAccessibleDoc(req);
  const rows = await listBatches(doc.id);
  res.json({ success: true, data: rows.map((r) => ({
    id: r.id, mode: r.mode, sourceKind: r.source_kind, fileName: r.file_name, summary: r.summary,
    appliedAt: r.applied_at, undoneAt: r.undone_at, createdAt: r.created_at,
  })) });
}));

export default router;
